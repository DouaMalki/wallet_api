// // wallet_api/services/seedCityService.js
// import { sql } from "../config/db.js";

// const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
// const GEMINI_KEY = process.env.GEMINI_API_KEY;
// const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

// if (!GOOGLE_KEY) throw new Error("Missing env GOOGLE_MAPS_API_KEY");
// if (!GEMINI_KEY) throw new Error("Missing env GEMINI_API_KEY");

// /* =========================
//    Small helpers
//    ========================= */
// function chunk(arr, size) {
//     const out = [];
//     for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
//     return out;
// }
// function sleep(ms) {
//     return new Promise((r) => setTimeout(r, ms));
// }

// /* =========================
//    DB helpers
//    ========================= */
// async function getCityOrThrow(cityId) {
//     const rows = await sql`
//     SELECT id, name, name_ar, center_lat, center_lng
//     FROM public.cities
//     WHERE id = ${cityId}
//     LIMIT 1
//   `;
//     if (!rows?.length) throw new Error(`City not found: ${cityId}`);
//     return rows[0];
// }


// async function getRuleCategoriesByTripTypeSlug(tripTypeSlug) {
//     const rows = await sql`
//     SELECT r.rule_json
//     FROM public.trip_type_rules r
//     JOIN public.trip_types t ON t.id = r.trip_type_id
//     WHERE r.is_active = TRUE
//       AND t.slug = ${tripTypeSlug}
//     LIMIT 1
//   `;

//     const rule = rows?.[0]?.rule_json || {};

//     // (1) required_category_slugs
//     const required = Array.isArray(rule?.required_category_slugs)
//         ? rule.required_category_slugs
//         : [];

//     // (2) all categories inside day_pattern
//     const dayPattern = Array.isArray(rule?.day_pattern) ? rule.day_pattern : [];
//     const fromPattern = dayPattern.flatMap((item) =>
//         Array.isArray(item?.categories) ? item.categories : []
//     );

//     // (3) union + normalize
//     const set = new Set(
//         [...required, ...fromPattern]
//             .map((s) => String(s).toLowerCase().trim())
//             .filter(Boolean)
//     );

//     return [...set];
// }


// async function getCategoriesBySlugs(slugs) {
//     if (!slugs?.length) return [];
//     const rows = await sql`
//     SELECT id, slug, google_types, min_results_per_city
//     FROM public.categories
//     WHERE slug = ANY(${slugs})
//     ORDER BY slug ASC
//   `;
//     return rows;
// }

// function metersToLat(m) { return m / 111320; } // تقريب
// function metersToLng(m, lat) { return m / (111320 * Math.cos((lat * Math.PI) / 180)); }

// function jitterPoints(centerLat, centerLng, radiusMeters, count = 6) {
//     // نقاط حول المركز (شكل دائرة)
//     const pts = [{ lat: centerLat, lng: centerLng }];
//     const step = (2 * Math.PI) / count;
//     const r = Math.max(800, Math.min(radiusMeters * 0.6, 3000)); // توازن
//     for (let i = 0; i < count; i++) {
//         const ang = i * step;
//         const dx = Math.cos(ang) * r;
//         const dy = Math.sin(ang) * r;
//         pts.push({
//             lat: centerLat + metersToLat(dy),
//             lng: centerLng + metersToLng(dx, centerLat),
//         });
//     }
//     return pts;
// }


// /**
//  * Returns missing category slugs for given city.
//  * Missing means: count(locations in city for category) < min_results_per_city (or default 20)
//  */
// async function getMissingCategorySlugsForCity(cityId, requiredSlugs) {
//     if (!requiredSlugs?.length) return [];

//     const rows = await sql`
//     SELECT
//       c.slug,
//       COALESCE(c.min_results_per_city, 20) AS min_need,
//       COUNT(l.id)::int AS cnt
//     FROM public.categories c
//     LEFT JOIN public.locations l
//       ON l.category_id = c.id
//      AND l.city_id = ${cityId}
//     WHERE c.slug = ANY(${requiredSlugs})
//     GROUP BY c.slug, c.min_results_per_city
//   `;

//     const missing = [];
//     for (const r of rows) {
//         const minNeed = Number(r.min_need || 20);
//         const cnt = Number(r.cnt || 0);
//         if (cnt < minNeed) missing.push(String(r.slug));
//     }
//     return missing;
// }



// async function getLocationsMissingGeminiForTripType(cityId, tripTypeSlug, limit = 30) {
//     const rows = await sql`
//     SELECT
//       l.google_place_id,
//       l.name,
//       c.slug AS category_slug,
//       l.rating,
//       l.user_ratings_total
//     FROM public.locations l
//     JOIN public.location_trip_types ltt ON ltt.location_id = l.id
//     JOIN public.trip_types t ON t.id = ltt.trip_type_id
//     LEFT JOIN public.categories c ON c.id = l.category_id
//     WHERE l.city_id = ${cityId}
//       AND t.slug = ${tripTypeSlug}
//       AND (
//         l.estimated_time IS NULL OR
//         l.max_cost IS NULL OR
//         l.recommended_for IS NULL OR l.recommended_for = '{}'::text[] OR
//         l.closed_days IS NULL OR l.closed_days = '{}'::text[]
//       )
//     ORDER BY l.updated_at DESC
//     LIMIT ${limit}
//   `;
//     return rows;
// }

// async function enrichMissingGeminiForTripType({ cityId, tripTypeSlug, batchSize = 15, limit = 30 }) {
//     const city = await getCityOrThrow(cityId);

//     const rows = await getLocationsMissingGeminiForTripType(cityId, tripTypeSlug, limit);
//     console.log("[ensure] missing gemini rows:", rows.length);

//     if (!rows.length) return { didEnrich: false, enriched: 0 };

//     let enriched = 0;

//     // rows are already “missing”, so no need to call getPlacesNeedingGemini here
//     for (const group of chunk(rows, batchSize)) {
//         console.log("[ensure] calling gemini batch:", group.length);

//         const out = await geminiEnrich(group, city.name);
//         const results = out?.results || [];
//         const map = new Map(results.map(r => [r.google_place_id, r]));

//         for (const p of group) {
//             const r = map.get(p.google_place_id);
//             if (!r) continue;
//             await updateGeminiFields(p.google_place_id, r);
//             enriched += 1;
//         }
//     }

//     return { didEnrich: true, enriched };
// }


// async function getPlacesNeedingGemini(cityId, googlePlaceIds) {
//     if (!googlePlaceIds?.length) return new Set();
//     const rows = await sql`
//     SELECT google_place_id
//     FROM public.locations
//     WHERE city_id = ${cityId}
//       AND google_place_id = ANY(${googlePlaceIds})
//       AND (
//         estimated_time IS NULL OR
//         max_cost IS NULL OR
//         recommended_for IS NULL OR recommended_for = '{}'::text[] OR
//         closed_days IS NULL OR closed_days = '{}'::text[]
//       )
//   `;
//     return new Set(rows.map(r => r.google_place_id));
// }

// async function upsertLocation({
//     city_id,
//     category_id,
//     name,
//     google_place_id,
//     lat,
//     lng,
//     rating,
//     user_ratings_total,
//     open_hours,
// }) {
//     const rows = await sql`
//     INSERT INTO public.locations (
//       id, city_id, category_id, name, google_place_id, lat, lng, rating, user_ratings_total, open_hours,
//       created_at, updated_at
//     )
//     VALUES (
//       gen_random_uuid(), ${city_id}, ${category_id}, ${name}, ${google_place_id},
//       ${lat}, ${lng}, ${rating}, ${user_ratings_total}, ${open_hours}::jsonb,
//       now(), now()
//     )
//     ON CONFLICT (google_place_id) DO UPDATE SET
//       city_id = EXCLUDED.city_id,
//       category_id = COALESCE(EXCLUDED.category_id, public.locations.category_id),
//       name = COALESCE(EXCLUDED.name, public.locations.name),
//       lat = COALESCE(EXCLUDED.lat, public.locations.lat),
//       lng = COALESCE(EXCLUDED.lng, public.locations.lng),
//       rating = COALESCE(EXCLUDED.rating, public.locations.rating),
//       user_ratings_total = COALESCE(EXCLUDED.user_ratings_total, public.locations.user_ratings_total),
//       open_hours = COALESCE(EXCLUDED.open_hours, public.locations.open_hours),
//       updated_at = now()
//     RETURNING id
//   `;
//     return rows[0].id;
// }

// async function upsertPrimaryPhoto(locationId, photoName) {
//     if (!photoName) return;
//     await sql`
//     INSERT INTO public.location_photos (id, location_id, photo_reference, source, is_primary, created_at)
//     VALUES (gen_random_uuid(), ${locationId}, ${photoName}, 'google', TRUE, now())
//     ON CONFLICT (location_id, photo_reference, source) DO NOTHING
//   `;
// }

// async function linkTripTypesByRules(locationId, categorySlug) {
//     const rows = await sql`
//     SELECT r.trip_type_id
//     FROM public.trip_type_rules r
//     WHERE r.is_active = TRUE
//       AND (r.rule_json->'required_category_slugs') ? ${categorySlug}
//   `;

//     for (const row of rows) {
//         await sql`
//       INSERT INTO public.location_trip_types (location_id, trip_type_id)
//       VALUES (${locationId}, ${row.trip_type_id})
//       ON CONFLICT (location_id, trip_type_id) DO NOTHING
//     `;
//     }
// }

// async function updateGeminiFields(googlePlaceId, enriched) {
//     await sql`
//     UPDATE public.locations
//     SET
//       estimated_time = COALESCE(public.locations.estimated_time, ${enriched.estimated_time_minutes}),
//       max_cost = COALESCE(public.locations.max_cost, ${enriched.max_cost_ils}),
//       recommended_for = COALESCE(
//         NULLIF(public.locations.recommended_for, ARRAY[]::text[]),
//         ${enriched.recommended_for}
//       ),
//       closed_days = COALESCE(
//         NULLIF(public.locations.closed_days, ARRAY[]::text[]),
//         ${enriched.closed_days}
//       ),
//       updated_at = now()
//     WHERE google_place_id = ${googlePlaceId}
//   `;
// }

// async function placesSearchNearby({ lat, lng, includedTypes, maxResultCount = 20, radius = 8000 }) {
//     const url = "https://places.googleapis.com/v1/places:searchNearby";
//     const body = {
//         includedTypes,
//         maxResultCount,
//         locationRestriction: {
//             circle: { center: { latitude: lat, longitude: lng }, radius },
//         },
//     };

//     const fieldMask =
//         "places.id,places.displayName,places.location,places.types,places.primaryType,places.rating,places.userRatingCount,places.photos";

//     const res = await fetch(url, {
//         method: "POST",
//         headers: {
//             "Content-Type": "application/json",
//             "X-Goog-Api-Key": GOOGLE_KEY,
//             "X-Goog-FieldMask": fieldMask,
//         },
//         body: JSON.stringify(body),
//     });

//     if (!res.ok) {
//         const t = await res.text();
//         throw new Error(`placesSearchNearby failed: ${res.status} ${t}`);
//     }
//     return res.json();
// }


// async function placesGetDetails(placeId) {
//     const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
//     // const fieldMask = "id,displayName,location,types,primaryType,rating,userRatingCount,regularOpeningHours,photos";
//     const fieldMask =
//         "id,displayName,location,types,primaryType,rating,userRatingCount,regularOpeningHours,photos,formattedAddress,addressComponents";

//     const res = await fetch(url, {
//         method: "GET",
//         headers: {
//             "Content-Type": "application/json",
//             "X-Goog-Api-Key": GOOGLE_KEY,
//             "X-Goog-FieldMask": fieldMask,
//         },
//     });

//     if (!res.ok) {
//         const t = await res.text();
//         throw new Error(`placesGetDetails failed: ${res.status} ${t}`);
//     }
//     return res.json();
// }

// function normalizeStr(s) {
//     return String(s || "").toLowerCase().trim();
// }

// function placeMatchesCity(details, city) {
//     // city: { id, name, ... } من getCityOrThrow
//     const cityName = normalizeStr(city?.name);
//     const cityNameAr = normalizeStr(city?.name_ar);
//     const cityIdLike = normalizeStr(city?.id);


//     // 1) جرّبي addressComponents (الأدق)
//     const comps = Array.isArray(details?.addressComponents) ? details.addressComponents : [];

//     // في Places (New) كل component فيه types + longText/shortText غالبًا.
//     const getText = (c) => normalizeStr(c?.longText || c?.shortText || c?.name);

//     // أنواع شائعة لتمثيل المدينة:
//     // locality / administrative_area_level_2 (ممكن تختلف حسب المنطقة)
//     const cityLike = comps
//         .filter(c => Array.isArray(c?.types))
//         .filter(c =>
//             c.types.includes("locality") ||
//             c.types.includes("postal_town") ||
//             c.types.includes("administrative_area_level_2") ||
//             c.types.includes("sublocality") ||
//             c.types.includes("sublocality_level_1")
//         )
//         .map(getText)
//         .filter(Boolean);

//     if (cityLike.some(t =>
//         (cityName && (t.includes(cityName) || cityName.includes(t))) ||
//         (cityNameAr && (t.includes(cityNameAr) || cityNameAr.includes(t)))
//     )) return true;

//     // fallback formattedAddress
//     const addr = normalizeStr(details?.formattedAddress);
//     if (addr && cityName && addr.includes(cityName)) return true;
//     if (addr && cityNameAr && addr.includes(cityNameAr)) return true;
//     if (addr && cityIdLike && addr.includes(cityIdLike)) return true;



//     return false;
// }




// function pickBestCategoryIdForPlace({ placeTypes, primaryType }, categories) {
//     for (const c of categories) {
//         const gtypes = (c.google_types || []).map(String);
//         if (primaryType && gtypes.includes(primaryType)) return c.id;
//     }
//     for (const c of categories) {
//         const gtypes = (c.google_types || []).map(String);
//         if (placeTypes?.some((t) => gtypes.includes(t))) return c.id;
//     }
//     return null;
// }

// /* =========================
//    Gemini helper (as-is) + retry 429
//    ========================= */
// async function geminiEnrich(batch, cityName, attempt = 1) {
//     const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
//         GEMINI_MODEL
//     )}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;

//     const schema = {
//         type: "object",
//         properties: {
//             results: {
//                 type: "array",
//                 items: {
//                     type: "object",
//                     properties: {
//                         google_place_id: { type: "string" },
//                         estimated_time_minutes: { type: "integer", minimum: 10, maximum: 360 },
//                         max_cost_ils: { type: "number", minimum: 0, maximum: 2000 },
//                         recommended_for: {
//                             type: "array",
//                             items: { type: "string", enum: ["solo", "couples", "friends", "family", "kids", "elderly"] },
//                             minItems: 0,
//                             maxItems: 6,
//                         },
//                         closed_days: {
//                             type: "array",
//                             items: { type: "string", enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
//                             minItems: 0,
//                             maxItems: 7,
//                         },
//                     },
//                     required: ["google_place_id", "estimated_time_minutes", "max_cost_ils", "recommended_for", "closed_days"],
//                 },
//             },
//         },
//         required: ["results"],
//     };

//     const compactPlaces = batch.map((p) => ({
//         google_place_id: p.google_place_id,
//         name: p.name,
//         category_slug: p.category_slug,
//         rating: p.rating ?? null,
//         user_ratings_total: p.user_ratings_total ?? null,
//     }));

//     const prompt = `
// You are enriching travel POIs for a trip-planner app.
// City: ${cityName}
// For each place, return best-effort estimates:
// - estimated_time_minutes
// - max_cost_ils
// - recommended_for: subset of [solo,couples,friends,family,kids,elderly]
// - closed_days
// IMPORTANT: Output must follow the provided JSON schema exactly.

// Places:
// ${JSON.stringify(compactPlaces, null, 2)}
// `.trim();

//     const body = {
//         contents: [{ role: "user", parts: [{ text: prompt }] }],
//         generationConfig: {
//             responseMimeType: "application/json",
//             responseSchema: schema,
//             temperature: 0.2,
//         },
//     };

//     const res = await fetch(url, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//     });

//     if (!res.ok) {
//         const t = await res.text();
//         if (res.status === 429) {
//             if (attempt >= 5) throw new Error("Gemini 429 persisted after 5 retries. Stop.");
//             const waitMs = 30000 * attempt;
//             await sleep(waitMs);
//             return geminiEnrich(batch, cityName, attempt + 1);
//         }
//         throw new Error(`Gemini generateContent failed: ${res.status} ${t}`);
//     }

//     const data = await res.json();
//     const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
//     if (!text) throw new Error("Gemini returned no text.");
//     return JSON.parse(text);
// }

// /* =========================
//    Public API: seed on demand
//    ========================= */
// export async function seedCityOnDemand({
//     cityId,
//     tripTypeSlug = null,
//     categoriesSlugs = null,
//     radiusMeters = 8000,
//     maxTotalPlaces = 220,
//     batchSize = 15,
// }) {
//     const city = await getCityOrThrow(cityId);

//     // determine slugs
//     let slugs = [];
//     if (Array.isArray(categoriesSlugs) && categoriesSlugs.length) {
//         slugs = categoriesSlugs.map(s => String(s).toLowerCase().trim()).filter(Boolean);
//     } else if (tripTypeSlug) {
//         slugs = await getRuleCategoriesByTripTypeSlug(tripTypeSlug);
//     }
//     if (!slugs.length) {
//         throw new Error(`seedCityOnDemand: no categories slugs resolved for tripType=${tripTypeSlug}`);
//     }

//     const categories = await getCategoriesBySlugs(slugs);
//     if (!categories.length) return { imported: 0, geminiEnriched: 0, categories: slugs };

//     let totalImported = 0;
//     const placesForGemini = [];

//     // dedupe across all categories in this run (keep ONLY this one)
//     const seenPlaceIds = new Set();

//     for (const cat of categories) {
//         if (totalImported >= maxTotalPlaces) break;

//         const minNeed = Number(cat.min_results_per_city ?? 20);
//         const target = Math.min(minNeed, Math.max(10, maxTotalPlaces - totalImported));

//         const includedTypes = (cat.google_types || []).map(String);
//         if (!includedTypes.length) continue;

//         const points = jitterPoints(city.center_lat, city.center_lng, radiusMeters, 6);

//         let collectedForCat = 0;
//         let attempts = 0;
//         const maxAttempts = Math.max(12, points.length * 4);

//         while (collectedForCat < target && totalImported < maxTotalPlaces && attempts < maxAttempts) {
//             const pt = points[attempts % points.length];

//             const radiusCap = Math.max(8000, Math.min(radiusMeters + 3000, 9000));
//             const radiusNow = Math.min(radiusMeters + attempts * 500, radiusCap);


//             const resp = await placesSearchNearby({
//                 lat: pt.lat,
//                 lng: pt.lng,
//                 includedTypes,
//                 maxResultCount: 20,
//                 radius: radiusNow,
//             });

//             const places = resp?.places || [];
//             if (!places.length) {
//                 attempts++;
//                 continue;
//             }

//             for (const p of places) {
//                 if (collectedForCat >= target) break;
//                 if (totalImported >= maxTotalPlaces) break;

//                 const placeId = p.id;
//                 if (!placeId) continue;

//                 // ✅ dedupe across ALL categories + attempts
//                 if (seenPlaceIds.has(placeId)) continue;
//                 seenPlaceIds.add(placeId);

//                 const d = await placesGetDetails(placeId);

//                 // ✅ city filter (Ramallah only-ish)
//                 if (!placeMatchesCity(d, city)) continue;

//                 const name = d?.displayName?.text || p?.displayName?.text || null;
//                 const lat = d?.location?.latitude ?? p?.location?.latitude ?? null;
//                 const lng = d?.location?.longitude ?? p?.location?.longitude ?? null;

//                 const rating = d?.rating ?? p?.rating ?? null;
//                 const userRatingsTotal = d?.userRatingCount ?? p?.userRatingCount ?? null;

//                 const primaryType = d?.primaryType ?? p?.primaryType ?? null;
//                 const types = d?.types ?? p?.types ?? [];

//                 const bestCategoryId =
//                     pickBestCategoryIdForPlace({ placeTypes: types, primaryType }, categories) || cat.id;

//                 const openHours = d?.regularOpeningHours ?? null;

//                 const locationId = await upsertLocation({
//                     city_id: city.id,
//                     category_id: bestCategoryId,
//                     name,
//                     google_place_id: placeId,
//                     lat,
//                     lng,
//                     rating,
//                     user_ratings_total: userRatingsTotal,
//                     open_hours: openHours ? JSON.stringify(openHours) : null,
//                 });

//                 const firstPhotoName = d?.photos?.[0]?.name || p?.photos?.[0]?.name || null;
//                 await upsertPrimaryPhoto(locationId, firstPhotoName);

//                 const categorySlugRow = categories.find((c) => c.id === bestCategoryId);
//                 const categorySlug = categorySlugRow?.slug || cat.slug;

//                 await linkTripTypesByRules(locationId, categorySlug);

//                 placesForGemini.push({
//                     google_place_id: placeId,
//                     name,
//                     category_slug: categorySlug,
//                     rating,
//                     user_ratings_total: userRatingsTotal,
//                 });

//                 totalImported += 1;
//                 collectedForCat += 1;
//             }

//             attempts++;
//         }
//     }

//     console.log("[seed] imported candidates:", placesForGemini.length);

//     // Gemini only for ones needing it
//     const googleIds = placesForGemini.map(p => p.google_place_id);
//     console.log("[seed] placesForGemini:", placesForGemini.length);
//     console.log("[seed] googleIds sample:", googleIds.slice(0, 3));

//     const needSet = await getPlacesNeedingGemini(city.id, googleIds);
//     console.log("[seed] needSet size:", needSet.size);

//     const filteredForGemini = placesForGemini.filter(p => needSet.has(p.google_place_id));
//     console.log("[seed] need gemini:", filteredForGemini.length);

//     let geminiEnriched = 0;
//     for (const group of chunk(filteredForGemini, batchSize)) {
//         console.log("[seed] calling gemini, batch size:", group.length);
//         const out = await geminiEnrich(group, city.name);
//         console.log("[seed] gemini returned results:", out?.results?.length ?? 0);
//         const results = out?.results || [];
//         const map = new Map(results.map((r) => [r.google_place_id, r]));

//         for (const p of group) {
//             const r = map.get(p.google_place_id);
//             if (!r) continue;
//             await updateGeminiFields(p.google_place_id, r);
//         }
//         geminiEnriched += group.length;
//     }

//     return { imported: totalImported, geminiEnriched, categories: slugs };
// }

// async function getLocationsMissingGeminiForCityTripType(cityId, tripTypeSlug, limit = 60) {
//     return await sql`
//     SELECT
//       l.google_place_id,
//       l.name,
//       c.slug AS category_slug,
//       l.rating,
//       l.user_ratings_total
//     FROM public.locations l
//     JOIN public.location_trip_types ltt ON ltt.location_id = l.id
//     JOIN public.trip_types t ON t.id = ltt.trip_type_id
//     JOIN public.categories c ON c.id = l.category_id
//     WHERE l.city_id = ${cityId}
//       AND t.slug = ${tripTypeSlug}
//       AND (
//         l.estimated_time IS NULL OR
//         l.max_cost IS NULL OR
//         l.recommended_for IS NULL OR l.recommended_for = '{}'::text[] OR
//         l.closed_days IS NULL OR l.closed_days = '{}'::text[]
//       )
//     ORDER BY l.updated_at DESC
//     LIMIT ${limit}
//   `;
// }

// export async function ensureLocationsForTripType({
//     cityId,
//     tripTypeSlug,
//     radiusMeters = 8000,
//     maxTotalPlaces = 220,
//     batchSize = 15,
// }) {
//     if (!cityId || !tripTypeSlug) return { didSeed: false, didEnrich: false, reason: "missing params" };

//     const safeTripType = String(tripTypeSlug).toLowerCase().trim();

//     // 1) نحاول نفهم required categories من rules (لـ seed)
//     const required = await getRuleCategoriesByTripTypeSlug(safeTripType);

//     let missing = [];
//     let seedReason = null;

//     if (!required.length) {
//         // لا نقدر نقرر seed حسب rules، لكن ما زال ممكن نعمل enrichment للأماكن الموجودة
//         seedReason = "no required_category_slugs in rules";
//     } else {
//         missing = await getMissingCategorySlugsForCity(cityId, required);
//         if (!missing.length) seedReason = "already sufficient (counts)";
//     }

//     // 2) Advisory lock لمنع parallel
//     const lockKey = `${cityId}:${safeTripType}`;
//     const lockRows = await sql`SELECT pg_try_advisory_lock(hashtext(${lockKey})) AS ok`;
//     const ok = Boolean(lockRows?.[0]?.ok);

//     if (!ok) {
//         return { didSeed: false, didEnrich: false, reason: "locked", missing };
//     }

//     try {
//         let seedStats = null;
//         let didSeed = false;

//         // 3) seed فقط إذا عندنا missing categories
//         if (missing.length) {
//             seedStats = await seedCityOnDemand({
//                 cityId,
//                 tripTypeSlug: safeTripType,
//                 categoriesSlugs: missing,
//                 radiusMeters,
//                 maxTotalPlaces,
//                 batchSize,
//             });
//             didSeed = true;
//         }

//         // 4) ✅ ALWAYS: Gemini backfill للأماكن الموجودة والناقصة (حتى لو didSeed=false)
//         // limit صغير لتجنب تعليق request؛ للتنظيف مرة واحدة شغّلي script وارفع limit.
//         const enrichStats = await enrichMissingGeminiForTripType({
//             cityId,
//             tripTypeSlug: safeTripType,
//             batchSize,
//             limit: 30,
//         });

//         return {
//             didSeed,
//             seedReason,
//             missing,
//             seedStats,
//             ...enrichStats,
//         };
//     } finally {
//         await sql`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
//     }
// }

_______________________________________































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
    SELECT id, name, center_lat, center_lng
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
        const minNeed = Number(r.min_need || 20);
        const cnt = Number(r.cnt || 0);
        if (cnt < minNeed) missing.push(String(r.slug));
    }
    return missing;
}

async function getPlacesNeedingGemini(cityId, googlePlaceIds) {
    // لو أعطيتيني قائمة google_place_id من هالـ run: نفلتر عليها لتقليل
    if (!googlePlaceIds?.length) return new Set();
    const rows = await sql`
    SELECT google_place_id
    FROM public.locations
    WHERE city_id = ${cityId}
      AND google_place_id = ANY(${googlePlaceIds})
      AND (
  estimated_time IS NULL OR estimated_time <= 0 OR
        max_cost IS NULL OR max_cost <= 0 OR
        recommended_for IS NULL OR cardinality(recommended_for) = 0 OR
        closed_days IS NULL
        
        

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

// async function updateGeminiFields(googlePlaceId, enriched) {
//     const rec = Array.isArray(enriched.recommended_for) ? enriched.recommended_for : [];
//     const closed = Array.isArray(enriched.closed_days) ? enriched.closed_days : [];

//     await sql`
//     UPDATE public.locations
//     SET
//       estimated_time  = COALESCE(public.locations.estimated_time, ${enriched.estimated_time_minutes}),
//       max_cost        = COALESCE(public.locations.max_cost, ${enriched.max_cost_ils}),
//       recommended_for = COALESCE(public.locations.recommended_for, ${rec}::text[]),
//       closed_days     = COALESCE(public.locations.closed_days, ${closed}::text[]),
//       updated_at = now()
//     WHERE google_place_id = ${googlePlaceId}
//   `;
// }

// async function updateGeminiFields(googlePlaceId, enriched) {
//     // Sanitization أولي
//     const rec = Array.isArray(enriched.recommended_for) ? enriched.recommended_for.filter(Boolean) : [];
//     const closed = Array.isArray(enriched.closed_days) ? enriched.closed_days.filter(Boolean) : [];

//     const est = Number(enriched.estimated_time_minutes);
//     const cost = Number(enriched.max_cost_ils);

//     await sql`
//     UPDATE public.locations
//     SET
//       estimated_time = CASE
//         WHEN public.locations.estimated_time IS NULL OR public.locations.estimated_time <= 0
//           THEN ${Number.isFinite(est) && est > 0 ? est : 60}
//         ELSE public.locations.estimated_time
//       END,

//       max_cost = CASE
//         WHEN public.locations.max_cost IS NULL OR public.locations.max_cost <= 0
//           THEN ${Number.isFinite(cost) && cost > 0 ? cost : 50}
//         ELSE public.locations.max_cost
//       END,

//       recommended_for = CASE
//         WHEN public.locations.recommended_for IS NULL OR cardinality(public.locations.recommended_for) = 0
//           THEN ${rec.length ? rec : ["friends"]}::text[]
//         ELSE public.locations.recommended_for
//       END,

//       closed_days = CASE
//         WHEN public.locations.closed_days IS NULL OR cardinality(public.locations.closed_days) = 0
//           THEN ${closed.length ? closed : ["fri"]}::text[]
//         ELSE public.locations.closed_days
//       END,

//       updated_at = now()
//     WHERE google_place_id = ${googlePlaceId}
//   `;
// }

async function updateGeminiFields(googlePlaceId, enriched) {
    const rec = Array.isArray(enriched.recommended_for) ? enriched.recommended_for.filter(Boolean) : [];
    const closed = Array.isArray(enriched.closed_days) ? enriched.closed_days.filter(Boolean) : [];

    const est = Number(enriched.estimated_time_minutes);
    const cost = Number(enriched.max_cost_ils);

    await sql`
    UPDATE public.locations
    SET
      estimated_time = CASE
        WHEN estimated_time IS NULL OR estimated_time <= 0
          THEN ${Number.isFinite(est) && est > 0 ? est : 60}
        ELSE estimated_time
      END,

      max_cost = CASE
        WHEN max_cost IS NULL OR max_cost <= 0
          THEN ${Number.isFinite(cost) && cost > 0 ? cost : 50}
        ELSE max_cost
      END,

      recommended_for = CASE
        WHEN recommended_for IS NULL OR cardinality(recommended_for) = 0
          THEN ${rec.length ? rec : ["friends"]}::text[]
        ELSE recommended_for
      END,

      closed_days = CASE
  WHEN closed_days IS NULL OR cardinality(closed_days) = 0
    THEN ${closed}::text[]
  ELSE closed_days
END



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
    const fieldMask = "id,displayName,location,types,primaryType,rating,userRatingCount,regularOpeningHours,photos";

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
                        max_cost_ils: { type: "number", minimum: 1, maximum: 2000 },
                        recommended_for: {
                            type: "array",
                            items: { type: "string", enum: ["solo", "couples", "friends", "family", "kids", "elderly"] },
                            minItems: 1,
                            maxItems: 6,
                        },
                        closed_days: {
                            type: "array",
                            items: { type: "string", enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
                            minItems: 1,
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
IMPORTANT:
- Do not return 0 for max_cost_ils or estimated_time_minutes.
- recommended_for must NOT be an empty array.
- closed_days must NOT be an empty array
- Output must follow the provided JSON schema exactly.



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

    for (const cat of categories) {
        if (totalImported >= maxTotalPlaces) break;

        const includedTypes = (cat.google_types || []).map(String);
        if (!includedTypes.length) continue;

        const minNeed = Number(cat.min_results_per_city ?? 20);
        const maxThisCategory = Math.min(minNeed, Math.max(10, maxTotalPlaces - totalImported));

        const resp = await placesSearchNearby({
            lat: city.center_lat,
            lng: city.center_lng,
            includedTypes,
            maxResultCount: Math.min(20, maxThisCategory),
            radius: radiusMeters,
        });

        const places = resp?.places || [];

        for (const p of places) {
            if (totalImported >= maxTotalPlaces) break;

            const placeId = p.id;
            if (!placeId) continue;

            const d = await placesGetDetails(placeId);

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
        }
    }

    // Gemini only for ones needing it
    const googleIds = placesForGemini.map(p => p.google_place_id);
    const needSet = await getPlacesNeedingGemini(city.id, googleIds);
    const filteredForGemini = placesForGemini.filter(p => needSet.has(p.google_place_id));

    console.log("placesForGemini:", placesForGemini.length);
    console.log("needSet:", needSet.size);
    console.log("filteredForGemini:", filteredForGemini.length);


    let geminiEnriched = 0;
    for (const group of chunk(filteredForGemini, batchSize)) {
        const out = await geminiEnrich(group, city.name);
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

async function getTripTypePlacesNeedingGemini(cityId, tripTypeSlug, limit = 120) {
    const rows = await sql`
    SELECT l.google_place_id, l.name, c.slug AS category_slug, l.rating, l.user_ratings_total
    FROM public.locations l
    JOIN public.location_trip_types ltt ON ltt.location_id = l.id
    JOIN public.trip_types tt ON tt.id = ltt.trip_type_id
    LEFT JOIN public.categories c ON c.id = l.category_id
    WHERE l.city_id = ${cityId}
      AND tt.slug = ${tripTypeSlug}
      AND l.google_place_id IS NOT NULL
      AND (
        l.estimated_time IS NULL OR l.estimated_time <= 0 OR
        l.max_cost IS NULL OR l.max_cost <= 0 OR
        l.recommended_for IS NULL OR cardinality(l.recommended_for) = 0 OR
        l.closed_days IS NULL
      )
    ORDER BY l.updated_at ASC
    LIMIT ${limit}
  `;
    return rows.map(r => ({
        google_place_id: r.google_place_id,
        name: r.name,
        category_slug: r.category_slug || null,
        rating: r.rating ?? null,
        user_ratings_total: r.user_ratings_total ?? null,
    }));
}

async function enrichTripTypePlacesNeedingGemini({ city, tripTypeSlug, batchSize = 15, limit = 120 }) {
    const need = await getTripTypePlacesNeedingGemini(city.id, tripTypeSlug, limit);
    if (!need.length) return { geminiEnriched: 0 };

    let geminiEnriched = 0;
    for (const group of chunk(need, batchSize)) {
        const out = await geminiEnrich(group, city.name);
        const results = out?.results || [];
        const map = new Map(results.map(r => [r.google_place_id, r]));

        for (const p of group) {
            const r = map.get(p.google_place_id);
            if (!r) continue;
            await updateGeminiFields(p.google_place_id, r);
        }
        geminiEnriched += group.length;
    }

    // Hardening نهائي: لو بقي شيء غلط (نادر) نسكرها defaults
    await sql`
  UPDATE public.locations l
  SET
    estimated_time = CASE WHEN l.estimated_time IS NULL OR l.estimated_time <= 0 THEN 60 ELSE l.estimated_time END,
    max_cost       = CASE WHEN l.max_cost IS NULL OR l.max_cost <= 0 THEN 50 ELSE l.max_cost END,
    recommended_for= CASE WHEN l.recommended_for IS NULL OR cardinality(l.recommended_for)=0 THEN ARRAY['friends']::text[] ELSE l.recommended_for END,
    closed_days    = CASE WHEN l.closed_days IS NULL THEN ARRAY[]::text[] ELSE l.closed_days END,
    updated_at = now()
  WHERE l.city_id = ${city.id}
    AND EXISTS (
      SELECT 1
      FROM public.location_trip_types ltt
      JOIN public.trip_types tt ON tt.id = ltt.trip_type_id
      WHERE ltt.location_id = l.id
        AND tt.slug = ${tripTypeSlug}
    )
    AND (
      l.estimated_time IS NULL OR l.estimated_time <= 0 OR
      l.max_cost IS NULL OR l.max_cost <= 0 OR
      l.recommended_for IS NULL OR cardinality(l.recommended_for) = 0 OR
      l.closed_days IS NULL
    )
`;


    return { geminiEnriched };
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
    const city = await getCityOrThrow(cityId);
    // if (!missing.length) return { didSeed: false, reason: "already sufficient" };
    if (!missing.length) {
        const enriched = await enrichTripTypePlacesNeedingGemini({
            city,
            tripTypeSlug: safeTripType,
            batchSize,
            limit: 120,
        });

        return { didSeed: false, reason: "already sufficient (seed), but enrichment ensured", enriched };
    }


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

        const enriched = await enrichTripTypePlacesNeedingGemini({
            city,
            tripTypeSlug: safeTripType,
            batchSize,
            limit: 160,
        });

        return { didSeed: true, missing, stats, enriched };
    } finally {
        // Ensure unlock even if seed fails
        await sql`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
    }
}