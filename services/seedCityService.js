import { sql } from "../config/db.js";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

if (!GOOGLE_KEY) throw new Error("Missing env GOOGLE_MAPS_API_KEY");
if (!GEMINI_KEY) throw new Error("Missing env GEMINI_API_KEY");

///////helpers///////
//  divid the array into small groups (e.g., 15 items at a time) because Gemini works best in batches, and there is a limit/cost/rate limit.
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
//used it when there were 429 (very many requests).
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// concurrency limiter (no libs)
async function mapLimit(items, limit, fn) {
    const ret = [];
    const executing = new Set();

    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item));
        ret.push(p);
        executing.add(p);
        p.finally(() => executing.delete(p));

        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }

    return Promise.all(ret);
}

// fetch with retry/backoff (handles 429/503/504)
async function fetchWithRetry(url, options, { retries = 4, baseDelayMs = 800 } = {}) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        const res = await fetch(url, options);

        if (res.ok) return res;

        const status = res.status;
        const shouldRetry = status === 429 || status === 503 || status === 504;

        const bodyText = await res.text();

        if (!shouldRetry || attempt === retries) {
            throw new Error(`Fetch failed: ${status} ${bodyText}`);
        }

        // exponential backoff + jitter
        const waitMs = Math.round(baseDelayMs * 2 ** (attempt - 1) * (0.7 + Math.random() * 0.6));
        await sleep(waitMs);
    }
}

// meters -> lat/lng delta helpers (approx)
function metersToLatDelta(m) {
    return m / 111320; // ~ meters per degree latitude
}
function metersToLngDelta(m, atLat) {
    const latRad = (Number(atLat) * Math.PI) / 180;
    return m / (111320 * Math.cos(latRad));
}

// quick distance (meters) using haversine
function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (x) => (Number(x) * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Build grid points around city center:
 * - stepMeters: spacing between grid points
 * - jitterRatio: adds random offset up to (stepMeters * jitterRatio)
 */
function buildJitterPoints({
    centerLat,
    centerLng,
    radiusMeters,
    stepMeters,
    jitterRatio = 0.35,
    maxPoints = 25,
}) {
    const points = [];
    const steps = [];
    for (let d = -radiusMeters; d <= radiusMeters; d += stepMeters) steps.push(d);

    // always include center
    points.push({ lat: centerLat, lng: centerLng });

    for (const dy of steps) {
        for (const dx of steps) {
            if (dx === 0 && dy === 0) continue;

            // keep roughly within circle-ish
            if (Math.sqrt(dx * dx + dy * dy) > radiusMeters * 1.05) continue;

            const j = stepMeters * jitterRatio;
            const jx = (Math.random() * 2 - 1) * j;
            const jy = (Math.random() * 2 - 1) * j;

            const lat = centerLat + metersToLatDelta(dy + jy);
            const lng = centerLng + metersToLngDelta(dx + jx, centerLat);

            points.push({ lat, lng });

            if (points.length >= maxPoints) return points;
        }
    }
    return points;
}

///////DB helpers ///////
//retrieve city data from the cities table.
async function getCityOrThrow(cityId) {
    const rows = await sql`
    SELECT id, name, name_ar, center_lat, center_lng
    FROM public.cities
    WHERE id = ${cityId}
    LIMIT 1
  `;
    if (!rows?.length) throw new Error(`City not found: ${cityId}`);
    return rows[0];
}

async function getRuleCategoriesByTripTypeSlug(tripTypeSlug) {
    const rows = await sql`
    SELECT r.rule_json
    FROM public.trip_type_rules r
    JOIN public.trip_types t ON t.id = r.trip_type_id
    WHERE r.is_active = TRUE
      AND t.slug = ${tripTypeSlug}
    LIMIT 1
  `;
    const rule = rows?.[0]?.rule_json;
    const slugs = rule?.required_category_slugs || [];
    return Array.isArray(slugs) ? slugs.map(s => String(s).toLowerCase().trim()).filter(Boolean) : [];
}

async function getCategoriesBySlugs(slugs) {
    if (!slugs?.length) return [];
    const rows = await sql`
    SELECT id, slug, google_types, min_results_per_city
    FROM public.categories
    WHERE slug = ANY(${slugs})
    ORDER BY slug ASC
  `;
    return rows;
}

/**
 * Returns missing category slugs for given city.
 * Missing means: count(locations in city for category) < min_results_per_city (or default 20)
 */
async function getMissingCategorySlugsForCity(cityId, requiredSlugs) {
    if (!requiredSlugs?.length) return [];

    const rows = await sql`
    SELECT
      c.slug,
      COALESCE(c.min_results_per_city, 20) AS min_need,
      COUNT(l.id)::int AS cnt
    FROM public.categories c
    LEFT JOIN public.locations l
      ON l.category_id = c.id
     AND l.city_id = ${cityId}
    WHERE c.slug = ANY(${requiredSlugs})
    GROUP BY c.slug, c.min_results_per_city
  `;

    const missing = [];
    for (const r of rows) {
        const minNeed = Number(r.min_need || 5);
        const cnt = Number(r.cnt || 0);
        if (cnt < minNeed) missing.push(String(r.slug));
    }
    return missing;
}

//The function returns a Set with the google_place_id that we need to enrichment. We used Set for a quick search: needSet.has(id).
async function getPlacesNeedingGemini(cityId, googlePlaceIds) {
    if (!googlePlaceIds?.length) return new Set();
    const rows = await sql`
    SELECT google_place_id
    FROM public.locations
    WHERE city_id = ${cityId}
      AND google_place_id = ANY(${googlePlaceIds})
      AND (
        estimated_time IS NULL OR
        max_cost IS NULL OR
        recommended_for IS NULL OR cardinality(recommended_for) = 0 OR
        closed_days IS NULL OR cardinality(closed_days) = 0
      )
  `;
    return new Set(rows.map(r => r.google_place_id));
}


async function upsertLocation({
    city_id,
    category_id,
    name,
    google_place_id,
    lat,
    lng,
    rating,
    user_ratings_total,
    open_hours,
}) {
    const rows = await sql`
    INSERT INTO public.locations (
      id, city_id, category_id, name, google_place_id, lat, lng, rating, user_ratings_total, open_hours,
      created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), ${city_id}, ${category_id}, ${name}, ${google_place_id},
      ${lat}, ${lng}, ${rating}, ${user_ratings_total}, ${open_hours}::jsonb,
      now(), now()
    )
    ON CONFLICT (google_place_id) DO UPDATE SET
      category_id = COALESCE(EXCLUDED.category_id, public.locations.category_id),
      name = COALESCE(EXCLUDED.name, public.locations.name),
      lat = COALESCE(EXCLUDED.lat, public.locations.lat),
      lng = COALESCE(EXCLUDED.lng, public.locations.lng),
      rating = COALESCE(EXCLUDED.rating, public.locations.rating),
      user_ratings_total = COALESCE(EXCLUDED.user_ratings_total, public.locations.user_ratings_total),
      open_hours = COALESCE(EXCLUDED.open_hours, public.locations.open_hours),
      updated_at = now()
    RETURNING id
  `;
    return rows[0].id;
}

async function upsertPrimaryPhoto(locationId, photoName) {
    if (!photoName) return;
    await sql`
    INSERT INTO public.location_photos (id, location_id, photo_reference, source, is_primary, created_at)
    VALUES (gen_random_uuid(), ${locationId}, ${photoName}, 'google', TRUE, now())
    ON CONFLICT (location_id, photo_reference, source) DO NOTHING
  `;
}

async function linkTripTypesByRules(locationId, categorySlug) {
    const rows = await sql`
    SELECT r.trip_type_id
    FROM public.trip_type_rules r
    WHERE r.is_active = TRUE
      AND (r.rule_json->'required_category_slugs') ? ${categorySlug}
  `;

    for (const row of rows) {
        await sql`
      INSERT INTO public.location_trip_types (location_id, trip_type_id)
      VALUES (${locationId}, ${row.trip_type_id})
      ON CONFLICT (location_id, trip_type_id) DO NOTHING
    `;
    }
}

async function updateGeminiFields(googlePlaceId, enriched) {
    await sql`
    UPDATE public.locations
    SET
      estimated_time = COALESCE(public.locations.estimated_time, ${enriched.estimated_time_minutes}),
      max_cost       = COALESCE(public.locations.max_cost, ${enriched.max_cost_ils}),

      recommended_for = CASE
        WHEN public.locations.recommended_for IS NULL
          OR cardinality(public.locations.recommended_for) = 0
        THEN ${enriched.recommended_for}
        ELSE public.locations.recommended_for
      END,

      closed_days = CASE
        WHEN public.locations.closed_days IS NULL
          OR cardinality(public.locations.closed_days) = 0
        THEN ${enriched.closed_days}
        ELSE public.locations.closed_days
      END,

      updated_at = now()
    WHERE google_place_id = ${googlePlaceId}
  `;
}

// Preload: categorySlug -> tripTypeIds[] (from active rules)
// This replaces the per-location SELECT inside linkTripTypesByRules
async function preloadTripTypeIdsByCategorySlugs(categorySlugs) {
    if (!categorySlugs?.length) return new Map();

    // Ensure slugs are normalized
    const slugs = categorySlugs.map(s => String(s).toLowerCase().trim()).filter(Boolean);

    // Expand required_category_slugs array into rows using jsonb_array_elements_text
    // Only keep slugs we care about to reduce data
    const rows = await sql`
      SELECT
        r.trip_type_id,
        lower(trim(x.slug)) AS category_slug
      FROM public.trip_type_rules r
      CROSS JOIN LATERAL jsonb_array_elements_text(r.rule_json->'required_category_slugs') AS x(slug)
      WHERE r.is_active = TRUE
        AND lower(trim(x.slug)) = ANY(${slugs})
    `;

    const map = new Map(); // slug -> [trip_type_id, ...]
    for (const row of rows) {
        const slug = String(row.category_slug);
        const tripTypeId = row.trip_type_id;

        if (!map.has(slug)) map.set(slug, []);
        map.get(slug).push(tripTypeId);
    }

    return map;
}

// Fast link using cached mapping (no SELECT)
async function linkTripTypesByRulesCached(locationId, categorySlug, tripTypeIdsBySlugMap) {
    const slug = String(categorySlug).toLowerCase().trim();
    const tripTypeIds = tripTypeIdsBySlugMap.get(slug) || [];
    if (!tripTypeIds.length) return;

    // Simple + safe: a few inserts (usually small list)
    for (const tripTypeId of tripTypeIds) {
        await sql`
          INSERT INTO public.location_trip_types (location_id, trip_type_id)
          VALUES (${locationId}, ${tripTypeId})
          ON CONFLICT (location_id, trip_type_id) DO NOTHING
        `;
    }
}

///////Google Places helpers (same as your script)///////
async function placesSearchNearby({ lat, lng, includedTypes, maxResultCount = 20, radius = 3000 }) {
    const url = "https://places.googleapis.com/v1/places:searchNearby";
    const body = {
        includedTypes,
        maxResultCount,
        locationRestriction: {
            circle: { center: { latitude: lat, longitude: lng }, radius },
        },
    };

    const fieldMask =
        "places.id,places.displayName,places.location,places.types,places.primaryType,places.rating,places.userRatingCount,places.photos";

    // const res = await fetch(url, {
    //     method: "POST",
    //     headers: {
    //         "Content-Type": "application/json",
    //         "X-Goog-Api-Key": GOOGLE_KEY,
    //         "X-Goog-FieldMask": fieldMask,
    //     },
    //     body: JSON.stringify(body),
    // });
    const res = await fetchWithRetry(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(body),
    });

    // if (!res.ok) {
    //     const t = await res.text();
    //     throw new Error(`placesSearchNearby failed: ${res.status} ${t}`);
    // }
    return res.json();
}

async function placesGetDetails(placeId) {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const fieldMask = "id,displayName,location,types,primaryType,rating,userRatingCount,regularOpeningHours,photos";

    // const res = await fetch(url, {
    //     method: "GET",
    //     headers: {
    //         "Content-Type": "application/json",
    //         "X-Goog-Api-Key": GOOGLE_KEY,
    //         "X-Goog-FieldMask": fieldMask,
    //     },
    // });

    // if (!res.ok) {
    //     const t = await res.text();
    //     throw new Error(`placesGetDetails failed: ${res.status} ${t}`);
    // }
    const res = await fetchWithRetry(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask": fieldMask,
        },
    });
    return res.json();
}
const SEARCH_CONCURRENCY = 3; // جرّب 3 أو 4 (مش أكثر بالبداية)

function pickBestCategoryIdForPlace({ placeTypes, primaryType }, categories) {
    for (const c of categories) {
        const gtypes = (c.google_types || []).map(String);
        if (primaryType && gtypes.includes(primaryType)) return c.id;
    }
    for (const c of categories) {
        const gtypes = (c.google_types || []).map(String);
        if (placeTypes?.some((t) => gtypes.includes(t))) return c.id;
    }
    return null;
}
/////// Gemini helper (as-is) + retry 429///////
async function geminiEnrich(batch, cityName, cityNameAr = null, attempt = 1) {

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        GEMINI_MODEL
    )}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;

    const schema = {
        type: "object",
        properties: {
            results: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        google_place_id: { type: "string" },
                        estimated_time_minutes: { type: "integer", minimum: 10, maximum: 360 },
                        max_cost_ils: { type: "number", minimum: 0, maximum: 2000 },
                        recommended_for: {
                            type: "array",
                            items: { type: "string", enum: ["solo", "couples", "friends", "family", "kids", "elderly"] },
                            minItems: 0,
                            maxItems: 6,
                        },
                        closed_days: {
                            type: "array",
                            items: { type: "string", enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
                            minItems: 0,
                            maxItems: 7,
                        },
                    },
                    required: ["google_place_id", "estimated_time_minutes", "max_cost_ils", "recommended_for", "closed_days"],
                },
            },
        },
        required: ["results"],
    };

    const compactPlaces = batch.map((p) => ({
        google_place_id: p.google_place_id,
        name: p.name,
        category_slug: p.category_slug,
        rating: p.rating ?? null,
        user_ratings_total: p.user_ratings_total ?? null,
    }));

    const prompt = `
You are enriching travel POIs for a trip-planner app.
City (EN): ${cityName}
City (AR): ${cityNameAr || "N/A"}
For each place, return best-effort estimates:
- estimated_time_minutes
- max_cost_ils
- recommended_for: subset of [solo,couples,friends,family,kids,elderly]
- closed_days
IMPORTANT: Output must follow the provided JSON schema exactly.

Places:
${JSON.stringify(compactPlaces, null, 2)}
`.trim();


    const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0.2,
        },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const t = await res.text();
        if (res.status === 429) {
            if (attempt >= 5) throw new Error("Gemini 429 persisted after 5 retries. Stop.");
            const waitMs = 30000 * attempt;
            await sleep(waitMs);
            return geminiEnrich(batch, cityName, cityNameAr, attempt + 1);

        }
        throw new Error(`Gemini generateContent failed: ${res.status} ${t}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no text.");
    return JSON.parse(text);
}

///////  Public API: seed on demand ///////
export async function seedCityOnDemand({
    cityId,
    tripTypeSlug = null,
    categoriesSlugs = null,
    radiusMeters = 3000,
    stepMeters = 1500,
    maxPoints = 21,
    maxTotalPlaces = 220,
    batchSize = 15,
}) {
    const tSearch0 = Date.now();
    let searchCalls = 0;
    let detailsTotalMs = 0;
    let detailsCalls = 0;

    const city = await getCityOrThrow(cityId);

    const points = buildJitterPoints({
        centerLat: city.center_lat,
        centerLng: city.center_lng,
        radiusMeters,
        stepMeters,
        jitterRatio: 0.35,
        maxPoints,
    });

    // فلترة خفيفة: ما نجيب أماكن تبعد كثير عن center (حتى لو search رجعها)
    //const MAX_FROM_CENTER = radiusMeters * 1.6;
    const MAX_FROM_CENTER = radiusMeters * 1.05;

    // determine slugs
    let slugs = [];
    if (Array.isArray(categoriesSlugs) && categoriesSlugs.length) {
        slugs = categoriesSlugs.map(s => String(s).toLowerCase().trim()).filter(Boolean);
    } else if (tripTypeSlug) {
        slugs = await getRuleCategoriesByTripTypeSlug(tripTypeSlug);
    }
    if (!slugs.length) {
        throw new Error(`seedCityOnDemand: no categories slugs resolved for tripType=${tripTypeSlug}`);
    }

    const categories = await getCategoriesBySlugs(slugs);
    if (!categories.length) return { imported: 0, geminiEnriched: 0, categories: slugs };

    // Preload rules mapping once (kills per-location SELECT)
    const tripTypeIdsBySlugMap = await preloadTripTypeIdsByCategorySlugs(slugs);

    let totalImported = 0;
    const placesForGemini = [];

    // for (const cat of categories) {
    //     if (totalImported >= maxTotalPlaces) break;

    //     const includedTypes = (cat.google_types || []).map(String);
    //     if (!includedTypes.length) continue;

    //     const minNeed = Number(cat.min_results_per_city ?? 10);
    //     const maxThisCategory = Math.min(minNeed, Math.max(10, maxTotalPlaces - totalImported));

    //     const resp = await placesSearchNearby({
    //         lat: city.center_lat,
    //         lng: city.center_lng,
    //         includedTypes,
    //         maxResultCount: Math.min(20, maxThisCategory),
    //         radius: radiusMeters,
    //     });
    //     searchCalls++;

    //     const places = resp?.places || [];

    //     for (const p of places) {
    //         if (totalImported >= maxTotalPlaces) break;

    //         const placeId = p.id;
    //         if (!placeId) continue;

    //         const tD0 = Date.now();
    //         const d = await placesGetDetails(placeId);
    //         const tD1 = Date.now();

    //         detailsTotalMs += (tD1 - tD0);
    //         detailsCalls += 1;

    //         const name = d?.displayName?.text || p?.displayName?.text || null;
    //         const lat = d?.location?.latitude ?? p?.location?.latitude ?? null;
    //         const lng = d?.location?.longitude ?? p?.location?.longitude ?? null;

    //         const rating = d?.rating ?? p?.rating ?? null;
    //         const userRatingsTotal = d?.userRatingCount ?? p?.userRatingCount ?? null;

    //         const primaryType = d?.primaryType ?? p?.primaryType ?? null;
    //         const types = d?.types ?? p?.types ?? [];

    //         const bestCategoryId =
    //             pickBestCategoryIdForPlace({ placeTypes: types, primaryType }, categories) || cat.id;

    //         const openHours = d?.regularOpeningHours ?? null;

    //         const locationId = await upsertLocation({
    //             city_id: city.id,
    //             category_id: bestCategoryId,
    //             name,
    //             google_place_id: placeId,
    //             lat,
    //             lng,
    //             rating,
    //             user_ratings_total: userRatingsTotal,
    //             open_hours: openHours ? JSON.stringify(openHours) : null,
    //         });

    //         const firstPhotoName = d?.photos?.[0]?.name || p?.photos?.[0]?.name || null;
    //         await upsertPrimaryPhoto(locationId, firstPhotoName);

    //         const categorySlugRow = categories.find((c) => c.id === bestCategoryId);
    //         const categorySlug = categorySlugRow?.slug || cat.slug;

    //         await linkTripTypesByRules(locationId, categorySlug);

    //         placesForGemini.push({
    //             google_place_id: placeId,
    //             name,
    //             category_slug: categorySlug,
    //             rating,
    //             user_ratings_total: userRatingsTotal,
    //         });

    //         totalImported += 1;
    //     }
    // }
    // dedup عالمي لكل run
    //const seenPlaceIds = new Set();
    // لو بدك تمنع details مرتين لنفس placeId (حتى لو تكرر بفئات مختلفة)
    const detailedPlaceIds = new Set();

    for (const cat of categories) {
        if (totalImported >= maxTotalPlaces) break;

        const includedTypes = (cat.google_types || []).map(String);
        if (!includedTypes.length) continue;

        const minNeed = Number(cat.min_results_per_city ?? 10);
        const maxThisCategory = Math.min(minNeed, Math.max(10, maxTotalPlaces - totalImported));

        // // 1) Search عبر نقاط jitter واجمع placeIds (بدون details)
        // const collected = [];              // [{placeId, seedData}]
        // const collectedIds = new Set();    // per-category unique

        // for (const pt of points) {
        //     if (collectedIds.size >= maxThisCategory) break;

        //     const resp = await placesSearchNearby({
        //         lat: pt.lat,
        //         lng: pt.lng,
        //         includedTypes,
        //         maxResultCount: 20,
        //         radius: radiusMeters,
        //     });
        //     searchCalls++;

        //     const places = resp?.places || [];
        //     for (const p of places) {
        //         const placeId = p?.id;
        //         if (!placeId) continue;

        //         // dedup على مستوى الفئة
        //         if (collectedIds.has(placeId)) continue;

        //         // فلترة خفيفة: بعيد عن مركز المدينة؟ ارمِه
        //         const plat = p?.location?.latitude;
        //         const plng = p?.location?.longitude;
        //         if (plat != null && plng != null) {
        //             const dist = haversineMeters(city.center_lat, city.center_lng, plat, plng);
        //             if (dist > MAX_FROM_CENTER) continue;
        //         }

        //         collectedIds.add(placeId);
        //         collected.push({
        //             placeId,
        //             seed: {
        //                 displayName: p?.displayName?.text || null,
        //                 lat: plat ?? null,
        //                 lng: plng ?? null,
        //                 rating: p?.rating ?? null,
        //                 userRatingCount: p?.userRatingCount ?? null,
        //                 photos: p?.photos ?? null,
        //                 primaryType: p?.primaryType ?? null,
        //                 types: p?.types ?? null,
        //             },
        //         });

        //         if (collectedIds.size >= maxThisCategory) break;
        //     }
        // }

        // 1) Search عبر نقاط jitter (CONCURRENT) واجمع placeIds (بدون details)
        const collected = [];              // [{placeId, seedData}]
        const collectedIds = new Set();    // per-category unique

        // اعمل requests search بشكل متوازي محدود
        const searchResponses = await mapLimit(points, SEARCH_CONCURRENCY, async (pt) => {
            // ملاحظة: ما فينا نعمل early stop هنا بسهولة لأننا بالتوازي
            const resp = await placesSearchNearby({
                lat: pt.lat,
                lng: pt.lng,
                includedTypes,
                maxResultCount: 20,
                radius: radiusMeters,
            });
            searchCalls++;
            return resp;
        });

        // مرّ على النتائج واجمع IDs لحد ما نوصل maxThisCategory
        for (const resp of searchResponses) {
            if (collectedIds.size >= maxThisCategory) break;

            const places = resp?.places || [];
            for (const p of places) {
                const placeId = p?.id;
                if (!placeId) continue;

                if (collectedIds.has(placeId)) continue;

                const plat = p?.location?.latitude;
                const plng = p?.location?.longitude;

                // distance filter (cheap)
                if (plat != null && plng != null) {
                    const dist = haversineMeters(city.center_lat, city.center_lng, plat, plng);
                    if (dist > MAX_FROM_CENTER) continue;
                }

                collectedIds.add(placeId);
                collected.push({
                    placeId,
                    seed: {
                        displayName: p?.displayName?.text || null,
                        lat: plat ?? null,
                        lng: plng ?? null,
                        rating: p?.rating ?? null,
                        userRatingCount: p?.userRatingCount ?? null,
                        photos: p?.photos ?? null,
                        primaryType: p?.primaryType ?? null,
                        types: p?.types ?? null,
                    },
                });

                if (collectedIds.size >= maxThisCategory) break;
            }
        }

        // 2) اعمل details فقط للـ unique IDs اللي ما اتعاملنا معهم قبل
        // for (const item of collected) {
        //     if (totalImported >= maxTotalPlaces) break;

        //     const placeId = item.placeId;

        //     // إذا دخل سابقًا بأي فئة، ما نعيد details (يوفّر كثير)
        //     if (detailedPlaceIds.has(placeId)) continue;
        //     detailedPlaceIds.add(placeId);

        //     const tD0 = Date.now();
        //     const d = await placesGetDetails(placeId);
        //     const tD1 = Date.now();
        //     detailsTotalMs += (tD1 - tD0);
        //     detailsCalls += 1;

        //     const name = d?.displayName?.text || item.seed.displayName || null;
        //     const lat = d?.location?.latitude ?? item.seed.lat ?? null;
        //     const lng = d?.location?.longitude ?? item.seed.lng ?? null;

        //     // فلترة خفيفة بعد details كمان (لو بدك تكون أضمن)
        //     if (lat != null && lng != null) {
        //         const dist = haversineMeters(city.center_lat, city.center_lng, lat, lng);
        //         if (dist > MAX_FROM_CENTER) continue;
        //     }

        //     const rating = d?.rating ?? item.seed.rating ?? null;
        //     const userRatingsTotal = d?.userRatingCount ?? item.seed.userRatingCount ?? null;

        //     const primaryType = d?.primaryType ?? item.seed.primaryType ?? null;
        //     const types = d?.types ?? item.seed.types ?? [];

        //     const bestCategoryId =
        //         pickBestCategoryIdForPlace({ placeTypes: types, primaryType }, categories) || cat.id;

        //     const openHours = d?.regularOpeningHours ?? null;

        //     const locationId = await upsertLocation({
        //         city_id: city.id,
        //         category_id: bestCategoryId,
        //         name,
        //         google_place_id: placeId,
        //         lat,
        //         lng,
        //         rating,
        //         user_ratings_total: userRatingsTotal,
        //         open_hours: openHours ? JSON.stringify(openHours) : null,
        //     });

        //     const firstPhotoName = d?.photos?.[0]?.name || item.seed?.photos?.[0]?.name || null;
        //     await upsertPrimaryPhoto(locationId, firstPhotoName);

        //     const categorySlugRow = categories.find((c) => c.id === bestCategoryId);
        //     const categorySlug = categorySlugRow?.slug || cat.slug;
        //     await linkTripTypesByRules(locationId, categorySlug);

        //     placesForGemini.push({
        //         google_place_id: placeId,
        //         name,
        //         category_slug: categorySlug,
        //         rating,
        //         user_ratings_total: userRatingsTotal,
        //     });

        //     totalImported += 1;
        // }
        // 2) DETAILS with limited concurrency (e.g., 4)
        const DETAILS_CONCURRENCY = 4;

        const insertFlags = await mapLimit(collected, DETAILS_CONCURRENCY, async (item) => {
            // stop inserting if global limit reached (soft stop)
            if (totalImported >= maxTotalPlaces) return 0;

            const placeId = item.placeId;

            // skip if we already did details for this place in this run
            if (detailedPlaceIds.has(placeId)) return 0;
            detailedPlaceIds.add(placeId);

            const tD0 = Date.now();
            const d = await placesGetDetails(placeId);
            const tD1 = Date.now();

            detailsTotalMs += (tD1 - tD0);
            detailsCalls += 1;

            const name = d?.displayName?.text || item.seed.displayName || null;
            const lat = d?.location?.latitude ?? item.seed.lat ?? null;
            const lng = d?.location?.longitude ?? item.seed.lng ?? null;

            // distance filter
            if (lat != null && lng != null) {
                const dist = haversineMeters(city.center_lat, city.center_lng, lat, lng);
                if (dist > MAX_FROM_CENTER) return 0;
            }

            const rating = d?.rating ?? item.seed.rating ?? null;
            const userRatingsTotal = d?.userRatingCount ?? item.seed.userRatingCount ?? null;

            const primaryType = d?.primaryType ?? item.seed.primaryType ?? null;
            const types = d?.types ?? item.seed.types ?? [];

            const bestCategoryId =
                pickBestCategoryIdForPlace({ placeTypes: types, primaryType }, categories) || cat.id;

            const openHours = d?.regularOpeningHours ?? null;

            const locationId = await upsertLocation({
                city_id: city.id,
                category_id: bestCategoryId,
                name,
                google_place_id: placeId,
                lat,
                lng,
                rating,
                user_ratings_total: userRatingsTotal,
                open_hours: openHours ? JSON.stringify(openHours) : null,
            });

            const firstPhotoName = d?.photos?.[0]?.name || item.seed?.photos?.[0]?.name || null;
            await upsertPrimaryPhoto(locationId, firstPhotoName);

            const categorySlugRow = categories.find((c) => c.id === bestCategoryId);
            const categorySlug = categorySlugRow?.slug || cat.slug;
            // await linkTripTypesByRules(locationId, categorySlug);
            await linkTripTypesByRulesCached(locationId, categorySlug, tripTypeIdsBySlugMap);

            placesForGemini.push({
                google_place_id: placeId,
                name,
                category_slug: categorySlug,
                rating,
                user_ratings_total: userRatingsTotal,
            });

            // IMPORTANT: don't increment totalImported here (race). Return flag instead.
            return 1;
        });

        // after concurrency batch finishes, update totalImported once
        const insertedCount = insertFlags.reduce((a, b) => a + b, 0);
        totalImported += insertedCount;

        console.log("[COLLECT]", cat.slug, {
            collected: collected.length,
            uniqueIds: collectedIds.size,
            detailsAlreadyDone: [...collectedIds].filter(id => detailedPlaceIds.has(id)).length,
        });

    }

    const tSearch1 = Date.now();
    console.log(`[TIMING] placesSearchNearby total: ${tSearch1 - tSearch0} ms`, { searchCalls });
    console.log(`[TIMING] placesGetDetails total: ${detailsTotalMs} ms`, { detailsCalls, avgMs: detailsCalls ? Math.round(detailsTotalMs / detailsCalls) : 0 });

    // Gemini only for ones needing it
    const googleIds = placesForGemini.map(p => p.google_place_id);
    const needSet = await getPlacesNeedingGemini(city.id, googleIds);
    const filteredForGemini = placesForGemini.filter(p => needSet.has(p.google_place_id));

    let geminiEnriched = 0;
    let geminiTotalMs = 0;
    let geminiBatches = 0;
    for (const group of chunk(filteredForGemini, batchSize)) {
        const tG0 = Date.now();
        const out = await geminiEnrich(group, city.name, city.name_ar);

        const tG1 = Date.now();

        geminiTotalMs += (tG1 - tG0);
        geminiBatches += 1;

        const results = out?.results || [];
        const map = new Map(results.map((r) => [r.google_place_id, r]));

        for (const p of group) {
            const r = map.get(p.google_place_id);
            if (!r) continue;
            await updateGeminiFields(p.google_place_id, r);
        }
        geminiEnriched += group.length;
    }
    console.log(`[TIMING] geminiEnrich total: ${geminiTotalMs} ms`, { geminiBatches, batchSize });

    return { imported: totalImported, geminiEnriched, categories: slugs };
}

///////Public API: ensure (called by controller)///////
export async function ensureLocationsForTripType({
    cityId,
    tripTypeSlug = null,
    categoriesSlugs = null,
    radiusMeters = 3000,
    stepMeters = 1500,
    maxPoints = 21,
    maxTotalPlaces = 220,
    batchSize = 15,
}) {

    const tEnsure0 = Date.now();

    if (!cityId || !tripTypeSlug) return { didSeed: false, reason: "missing params" };

    const safeTripType = String(tripTypeSlug).toLowerCase().trim();
    const required = await getRuleCategoriesByTripTypeSlug(tripTypeSlug);
    if (!required.length) return { didSeed: false, reason: "no required_category_slugs" };

    const missing = await getMissingCategorySlugsForCity(cityId, required);
    if (!missing.length) return { didSeed: false, reason: "already sufficient" };


    // ---------------------------
    // Advisory lock (prevents parallel seeds for same city+tripType)
    // ---------------------------
    const lockKey = `${cityId}:${safeTripType}`;
    const lockRows = await sql`SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS ok`;
    const ok = Boolean(lockRows?.[0]?.ok);

    if (!ok) {
        return { didSeed: false, reason: "locked", missing };
    }

    // OPTIONAL: prevent parallel seeds for same city+tripType using advisory lock
    // If you want: SELECT pg_try_advisory_lock(hashtext(...))
    // For now: do seed directly
    try {
        const stats = await seedCityOnDemand({
            cityId,
            tripTypeSlug: safeTripType,
            categoriesSlugs: missing,
            radiusMeters,
            stepMeters: Math.round(radiusMeters * 0.5),
            maxTotalPlaces,
            batchSize,
        });
        return { didSeed: true, missing, stats };
    } finally {
        // Ensure unlock even if seed fails
        await sql`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
        const tEnsure1 = Date.now(); // ✅ END ensure
        console.log(`[TIMING] ensureLocationsForTripType total: ${tEnsure1 - tEnsure0} ms`, { cityId, tripTypeSlug, missingCount: missing?.length });
    }
}