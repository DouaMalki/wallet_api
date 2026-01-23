// wallet_api/services/seedCityService.js
import { sql } from "../config/db.js";

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

if (!GOOGLE_KEY) throw new Error("Missing env GOOGLE_MAPS_API_KEY");
if (!GEMINI_KEY) throw new Error("Missing env GEMINI_API_KEY");

/* =========================
   Small helpers
   ========================= */
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/* =========================
   DB helpers
   ========================= */
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

    const rule = rows?.[0]?.rule_json || {};

    // (1) required_category_slugs
    const required = Array.isArray(rule?.required_category_slugs)
        ? rule.required_category_slugs
        : [];

    // (2) all categories inside day_pattern
    const dayPattern = Array.isArray(rule?.day_pattern) ? rule.day_pattern : [];
    const fromPattern = dayPattern.flatMap((item) =>
        Array.isArray(item?.categories) ? item.categories : []
    );

    // (3) union + normalize
    const set = new Set(
        [...required, ...fromPattern]
            .map((s) => String(s).toLowerCase().trim())
            .filter(Boolean)
    );

    return [...set];
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

function metersToLat(m) { return m / 111320; } // تقريب
function metersToLng(m, lat) { return m / (111320 * Math.cos((lat * Math.PI) / 180)); }

function jitterPoints(centerLat, centerLng, radiusMeters, count = 6) {
    // نقاط حول المركز (شكل دائرة)
    const pts = [{ lat: centerLat, lng: centerLng }];
    const step = (2 * Math.PI) / count;
    const r = Math.max(800, Math.min(radiusMeters * 0.6, 3000)); // توازن
    for (let i = 0; i < count; i++) {
        const ang = i * step;
        const dx = Math.cos(ang) * r;
        const dy = Math.sin(ang) * r;
        pts.push({
            lat: centerLat + metersToLat(dy),
            lng: centerLng + metersToLng(dx, centerLat),
        });
    }
    return pts;
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
        const minNeed = Number(r.min_need || 20);
        const cnt = Number(r.cnt || 0);
        if (cnt < minNeed) missing.push(String(r.slug));
    }
    return missing;
}

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
        recommended_for IS NULL OR recommended_for = '{}'::text[] OR
        closed_days IS NULL OR closed_days = '{}'::text[]
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
      city_id = EXCLUDED.city_id,
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
      max_cost = COALESCE(public.locations.max_cost, ${enriched.max_cost_ils}),
      recommended_for = COALESCE(
        NULLIF(public.locations.recommended_for, ARRAY[]::text[]),
        ${enriched.recommended_for}
      ),
      closed_days = COALESCE(
        NULLIF(public.locations.closed_days, ARRAY[]::text[]),
        ${enriched.closed_days}
      ),
      updated_at = now()
    WHERE google_place_id = ${googlePlaceId}
  `;
}

/* =========================
   Google Places helpers (same as your script)
   ========================= */
async function placesSearchNearby({ lat, lng, includedTypes, maxResultCount = 20, radius = 8000 }) {
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

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const t = await res.text();
        throw new Error(`placesSearchNearby failed: ${res.status} ${t}`);
    }
    return res.json();
}


async function placesGetDetails(placeId) {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    // const fieldMask = "id,displayName,location,types,primaryType,rating,userRatingCount,regularOpeningHours,photos";
    const fieldMask =
        "id,displayName,location,types,primaryType,rating,userRatingCount,regularOpeningHours,photos,formattedAddress,addressComponents";

    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask": fieldMask,
        },
    });

    if (!res.ok) {
        const t = await res.text();
        throw new Error(`placesGetDetails failed: ${res.status} ${t}`);
    }
    return res.json();
}

function normalizeStr(s) {
    return String(s || "").toLowerCase().trim();
}

function placeMatchesCity(details, city) {
    // city: { id, name, ... } من getCityOrThrow
    const cityName = normalizeStr(city?.name);
    const cityNameAr = normalizeStr(city?.name_ar);
    const cityIdLike = normalizeStr(city?.id);


    // 1) جرّبي addressComponents (الأدق)
    const comps = Array.isArray(details?.addressComponents) ? details.addressComponents : [];

    // في Places (New) كل component فيه types + longText/shortText غالبًا.
    const getText = (c) => normalizeStr(c?.longText || c?.shortText || c?.name);

    // أنواع شائعة لتمثيل المدينة:
    // locality / administrative_area_level_2 (ممكن تختلف حسب المنطقة)
    const cityLike = comps
        .filter(c => Array.isArray(c?.types))
        .filter(c =>
            c.types.includes("locality") ||
            c.types.includes("postal_town") ||
            c.types.includes("administrative_area_level_2") ||
            c.types.includes("sublocality") ||
            c.types.includes("sublocality_level_1")
        )
        .map(getText)
        .filter(Boolean);

    if (cityLike.some(t =>
        (cityName && (t.includes(cityName) || cityName.includes(t))) ||
        (cityNameAr && (t.includes(cityNameAr) || cityNameAr.includes(t)))
    )) return true;

    // fallback formattedAddress
    const addr = normalizeStr(details?.formattedAddress);
    if (addr && cityName && addr.includes(cityName)) return true;
    if (addr && cityNameAr && addr.includes(cityNameAr)) return true;
    if (addr && cityIdLike && addr.includes(cityIdLike)) return true;



    return false;
}




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

/* =========================
   Gemini helper (as-is) + retry 429
   ========================= */
async function geminiEnrich(batch, cityName, attempt = 1) {
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
City: ${cityName}
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
            return geminiEnrich(batch, cityName, attempt + 1);
        }
        throw new Error(`Gemini generateContent failed: ${res.status} ${t}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no text.");
    return JSON.parse(text);
}

/* =========================
   Public API: seed on demand
   ========================= */
export async function seedCityOnDemand({
    cityId,
    tripTypeSlug = null,
    categoriesSlugs = null,
    radiusMeters = 8000,
    maxTotalPlaces = 220,
    batchSize = 15,
}) {
    const city = await getCityOrThrow(cityId);

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

    let totalImported = 0;
    const placesForGemini = [];

    // dedupe across all categories in this run (keep ONLY this one)
    const seenPlaceIds = new Set();

    for (const cat of categories) {
        if (totalImported >= maxTotalPlaces) break;

        const minNeed = Number(cat.min_results_per_city ?? 20);
        const target = Math.min(minNeed, Math.max(10, maxTotalPlaces - totalImported));

        const includedTypes = (cat.google_types || []).map(String);
        if (!includedTypes.length) continue;

        const points = jitterPoints(city.center_lat, city.center_lng, radiusMeters, 6);

        let collectedForCat = 0;
        let attempts = 0;
        const maxAttempts = Math.max(12, points.length * 4);

        while (collectedForCat < target && totalImported < maxTotalPlaces && attempts < maxAttempts) {
            const pt = points[attempts % points.length];

            const radiusCap = Math.max(8000, Math.min(radiusMeters + 3000, 9000));
            const radiusNow = Math.min(radiusMeters + attempts * 500, radiusCap);


            const resp = await placesSearchNearby({
                lat: pt.lat,
                lng: pt.lng,
                includedTypes,
                maxResultCount: 20,
                radius: radiusNow,
            });

            const places = resp?.places || [];
            if (!places.length) {
                attempts++;
                continue;
            }

            for (const p of places) {
                if (collectedForCat >= target) break;
                if (totalImported >= maxTotalPlaces) break;

                const placeId = p.id;
                if (!placeId) continue;

                // ✅ dedupe across ALL categories + attempts
                if (seenPlaceIds.has(placeId)) continue;
                seenPlaceIds.add(placeId);

                const d = await placesGetDetails(placeId);

                // ✅ city filter (Ramallah only-ish)
                if (!placeMatchesCity(d, city)) continue;

                const name = d?.displayName?.text || p?.displayName?.text || null;
                const lat = d?.location?.latitude ?? p?.location?.latitude ?? null;
                const lng = d?.location?.longitude ?? p?.location?.longitude ?? null;

                const rating = d?.rating ?? p?.rating ?? null;
                const userRatingsTotal = d?.userRatingCount ?? p?.userRatingCount ?? null;

                const primaryType = d?.primaryType ?? p?.primaryType ?? null;
                const types = d?.types ?? p?.types ?? [];

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

                const firstPhotoName = d?.photos?.[0]?.name || p?.photos?.[0]?.name || null;
                await upsertPrimaryPhoto(locationId, firstPhotoName);

                const categorySlugRow = categories.find((c) => c.id === bestCategoryId);
                const categorySlug = categorySlugRow?.slug || cat.slug;

                await linkTripTypesByRules(locationId, categorySlug);

                placesForGemini.push({
                    google_place_id: placeId,
                    name,
                    category_slug: categorySlug,
                    rating,
                    user_ratings_total: userRatingsTotal,
                });

                totalImported += 1;
                collectedForCat += 1;
            }

            attempts++;
        }
    }

    console.log("[seed] imported candidates:", placesForGemini.length);

    // Gemini only for ones needing it
    const googleIds = placesForGemini.map(p => p.google_place_id);
    const needSet = await getPlacesNeedingGemini(city.id, googleIds);
    const filteredForGemini = placesForGemini.filter(p => needSet.has(p.google_place_id));

    console.log("[seed] need gemini:", filteredForGemini.length);

    let geminiEnriched = 0;
    for (const group of chunk(filteredForGemini, batchSize)) {
        console.log("[seed] calling gemini, batch size:", group.length);
        const out = await geminiEnrich(group, city.name);
        console.log("[seed] gemini returned results:", out?.results?.length ?? 0);
        const results = out?.results || [];
        const map = new Map(results.map((r) => [r.google_place_id, r]));

        for (const p of group) {
            const r = map.get(p.google_place_id);
            if (!r) continue;
            await updateGeminiFields(p.google_place_id, r);
        }
        geminiEnriched += group.length;
    }

    return { imported: totalImported, geminiEnriched, categories: slugs };
}

/* =========================
   Public API: ensure (called by controller)
   ========================= */
export async function ensureLocationsForTripType({
    cityId,
    tripTypeSlug,
    radiusMeters = 8000,
    maxTotalPlaces = 220,
    batchSize = 15,
}) {
    if (!cityId || !tripTypeSlug) return { didSeed: false, reason: "missing params" };

    const safeTripType = String(tripTypeSlug).toLowerCase().trim();
    const required = await getRuleCategoriesByTripTypeSlug(safeTripType);

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
            maxTotalPlaces,
            batchSize,
        });

        return { didSeed: true, missing, stats };
    } finally {
        // Ensure unlock even if seed fails
        await sql`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
    }
}
