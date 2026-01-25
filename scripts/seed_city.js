// wallet_api/scripts/seed_city.js
import "dotenv/config";
import { seedCityOnDemand, ensureLocationsForTripType } from "../services/seedCityService.js";

function getArg(name, def = null) {
    const idx = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (idx === -1) return def;
    const a = process.argv[idx];
    if (a.includes("=")) return a.split("=").slice(1).join("=");
    return process.argv[idx + 1] ?? def;
}

function parseCsv(csv) {
    if (!csv) return [];
    return csv
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

async function main() {
    const cityId = getArg("city");
    const mode = (getArg("mode", "on_demand") || "on_demand").toLowerCase(); // seed | on_demand | ensure
    const tripTypeSlug = getArg("trip_type"); // optional
    const categoriesCsv = getArg("categories"); // optional
    const radiusMeters = Number(getArg("radius", "8000"));
    const maxTotalPlaces = Number(getArg("max_total", "220"));
    const batchSize = Number(getArg("batch", "15"));

    if (!cityId) {
        console.error(
            "Usage:\n" +
            "  node scripts/seed_city.js --city=ramallah --mode=on_demand --categories=hiking,kids_activities\n" +
            "  node scripts/seed_city.js --city=ramallah --mode=on_demand --trip_type=cultural\n" +
            "  node scripts/seed_city.js --city=ramallah --mode=ensure --trip_type=cultural\n"
        );
        process.exit(1);
    }

    // modes:
    // - on_demand: seed based on categories OR trip_type
    // - ensure: checks missing categories for trip_type then seeds only missing
    // - seed: (optional) if you still want it, you can call seedCityOnDemand with "seed default categories"
    //         but I recommend keeping "seed" as separate script if needed.
    if (mode === "ensure") {
        if (!tripTypeSlug) {
            throw new Error("mode=ensure requires --trip_type=...");
        }

        const out = await ensureLocationsForTripType({
            cityId,
            tripTypeSlug: tripTypeSlug.trim().toLowerCase(),
            radiusMeters,
            maxTotalPlaces,
            batchSize,
        });

        console.log("\n=== ENSURE RESULT ===");
        console.log(JSON.stringify(out, null, 2));
        return;
    }

    if (mode === "on_demand") {
        const slugs = parseCsv(categoriesCsv);

        const out = await seedCityOnDemand({
            cityId,
            tripTypeSlug: tripTypeSlug ? tripTypeSlug.trim().toLowerCase() : null,
            categoriesSlugs: slugs.length ? slugs : null,
            radiusMeters,
            maxTotalPlaces,
            batchSize,
        });

        console.log("\n=== ON_DEMAND RESULT ===");
        console.log(JSON.stringify(out, null, 2));
        return;
    }

    if (mode === "seed") {
        // If you still need "seed default categories" from DB, implement it inside service later.
        // For now, keep it explicit to avoid silent surprises.
        throw new Error(
            "mode=seed is not supported in the wrapper yet. Use on_demand with --categories=... or use ensure."
        );
    }

    throw new Error(`Unknown mode: ${mode}`);
}

main().catch((e) => {
    console.error("Seed failed:", e?.message || e);
    if (e?.stack) console.error(e.stack);
    process.exit(1);
});










// // wallet_api/scripts/seed_city.js
// import "dotenv/config";
// import { sql } from "../config/db.js";

// // -------------------- CLI --------------------
// function getArg(name, def = null) {
//     const idx = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
//     if (idx === -1) return def;
//     const a = process.argv[idx];
//     if (a.includes("=")) return a.split("=").slice(1).join("=");
//     return process.argv[idx + 1] ?? def;
// }

// const cityId = getArg("city");
// const mode = (getArg("mode", "seed") || "seed").toLowerCase(); // seed | on_demand
// const categoriesCsv = getArg("categories"); // for on_demand
// const radiusMeters = Number(getArg("radius", "8000")); // default 8km
// const maxTotalPlaces = Number(getArg("max_total", "220")); // safety cap
// const batchSize = Number(getArg("batch", "15"));

// const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
// const GEMINI_KEY = process.env.GEMINI_API_KEY;
// const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";


// if (!GOOGLE_KEY) throw new Error("Missing env GOOGLE_MAPS_API_KEY");
// if (!GEMINI_KEY) throw new Error("Missing env GEMINI_API_KEY");

// const tripTypeSlug = getArg("trip_type"); // optional

// if (!cityId) {
//     console.error("Usage: node scripts/seed_city.js --city=ramallah [--mode=seed|on_demand] [--categories=hiking,kids_activities]");
//     process.exit(1);
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
//     const rule = rows?.[0]?.rule_json;
//     const slugs = rule?.required_category_slugs || [];
//     return Array.isArray(slugs) ? slugs.map(s => String(s).toLowerCase()) : [];
// }


// // -------------------- Google Places v1 helpers --------------------
// // Nearby Search (New) is POST https://places.googleapis.com/v1/places:searchNearby and requires field mask. :contentReference[oaicite:0]{index=0}
// async function placesSearchNearby({ lat, lng, includedTypes, maxResultCount = 20, radius = 8000 }) {
//     const url = "https://places.googleapis.com/v1/places:searchNearby";

//     const body = {
//         includedTypes,
//         maxResultCount,
//         locationRestriction: {
//             circle: {
//                 center: { latitude: lat, longitude: lng },
//                 radius: radius,
//             },
//         },
//     };

//     // FieldMask is required; no default fields. :contentReference[oaicite:1]{index=1}
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

// // Place Details (New) is GET https://places.googleapis.com/v1/places/PLACE_ID and requires field mask. :contentReference[oaicite:2]{index=2}
// async function placesGetDetails(placeId) {
//     const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
//     const fieldMask =
//         "id,displayName,location,types,primaryType,rating,userRatingCount,regularOpeningHours,photos";

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

// // -------------------- Gemini helper --------------------
// // generateContent endpoint: POST https://generativelanguage.googleapis.com/v1beta/{model=models/*}:generateContent :contentReference[oaicite:3]{index=3}
// // GenerationConfig supports responseMimeType + responseSchema for structured JSON. :contentReference[oaicite:4]{index=4}
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
// - estimated_time_minutes: reasonable visit time
// - max_cost_ils: conservative upper bound in Israeli Shekels (ILS) for a typical visit (entry/food/fees)
// - recommended_for: subset of [solo,couples,friends,family,kids,elderly]
// - closed_days: based on typical patterns if unknown, otherwise empty array
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

//     // if (!res.ok) {
//     //     const t = await res.text();
//     //     throw new Error(`Gemini generateContent failed: ${res.status} ${t}`);
//     // }
//     if (!res.ok) {
//         const t = await res.text();

//         // Retry on 429 (rate limit)
//         // if (res.status === 429) {
//         //     // backoff بسيط (30 ثانية)
//         //     console.warn("Gemini 429 rate limit. Sleeping 30s then retry...");
//         //     await sleep(30000);
//         //     return geminiEnrich(batch, cityName);
//         // }
//         if (res.status === 429) {
//             if (attempt >= 5) {
//                 throw new Error("Gemini 429 persisted after 5 retries. Stop.");
//             }
//             const waitMs = 30000 * attempt; // 30s ثم 60s ثم 90s...
//             console.warn(`Gemini 429. Sleeping ${waitMs / 1000}s then retry (attempt ${attempt + 1})...`);
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

// function sleep(ms) {
//     return new Promise((r) => setTimeout(r, ms));
// }


// // -------------------- DB helpers --------------------
// async function getCityOrThrow(cityId) {
//     const rows = await sql`SELECT id, name, center_lat, center_lng FROM public.cities WHERE id = ${cityId} LIMIT 1`;
//     if (!rows?.length) throw new Error(`City not found: ${cityId}`);
//     return rows[0];
// }

// async function isCityAlreadySeeded(cityId) {
//     const rows = await sql`
//     SELECT city_id
//     FROM public.city_seed_status
//     WHERE city_id = ${cityId}
//     LIMIT 1
//   `;
//     return rows.length > 0;
// }



// async function getCategoriesForRun(mode, categoriesCsv) {
//     if (mode === "seed") {
//         return sql`
//       SELECT id, slug, google_types, is_seed_default, seed_rank, min_results_per_city, search_strategy
//       FROM public.categories
//       WHERE is_seed_default = TRUE
//       ORDER BY seed_rank ASC NULLS LAST, slug ASC
//     `;
//     }
//     // if (mode === "on_demand") {
//     //     if (!categoriesCsv) throw new Error("on_demand mode requires --categories=slug1,slug2");
//     //     const slugs = categoriesCsv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
//     //     return sql`
//     //   SELECT id, slug, google_types, is_seed_default, seed_rank, min_results_per_city, search_strategy
//     //   FROM public.categories
//     //   WHERE slug = ANY(${slugs})
//     //   ORDER BY slug ASC
//     // `;
//     // }
//     if (mode === "on_demand") {
//         let slugs = [];

//         if (categoriesCsv) {
//             slugs = categoriesCsv.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
//         } else if (tripTypeSlug) {
//             slugs = await getRuleCategoriesByTripTypeSlug(tripTypeSlug);
//         }

//         if (!slugs.length) {
//             throw new Error(
//                 `on_demand: no categories found. Provide --categories=... OR ensure trip_type_rules has required_category_slugs for trip_type=${tripTypeSlug}`
//             );
//         }


//         return sql`
//     SELECT id, slug, google_types, is_seed_default, seed_rank, min_results_per_city, search_strategy
//     FROM public.categories
//     WHERE slug = ANY(${slugs})
//     ORDER BY slug ASC
//   `;
//     }

//     throw new Error(`Unknown mode: ${mode}`);
// }

// function pickBestCategoryIdForPlace({ placeTypes, primaryType }, categories) {
//     // Prefer primaryType match, else any intersection.
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
//     // Photo name comes from photos[].name in Details/Search results. :contentReference[oaicite:5]{index=5}
//     await sql`
//     INSERT INTO public.location_photos (id, location_id, photo_reference, source, is_primary, created_at)
//     VALUES (gen_random_uuid(), ${locationId}, ${photoName}, 'google', TRUE, now())
//     ON CONFLICT (location_id, photo_reference, source) DO NOTHING
//   `;
// }

// // IMPORTANT NOTE (Terms/expiry):
// // Google warns you cannot cache a photo name; it can expire. :contentReference[oaicite:6]{index=6}
// // We still store it as "last known reference" for MVP, but you should be ready to refresh it later if it stops working.

// async function linkTripTypesByRules(locationId, categorySlug) {
//     // ربط تلقائي: أي trip type rules تحتوي هذا categorySlug ضمن required_category_slugs
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
//       estimated_time  = COALESCE(public.locations.estimated_time, ${enriched.estimated_time_minutes}),
//       max_cost        = COALESCE(public.locations.max_cost, ${enriched.max_cost_ils}),
//       recommended_for = COALESCE(public.locations.recommended_for, ${enriched.recommended_for}),
//       closed_days     = COALESCE(public.locations.closed_days, ${enriched.closed_days}),
//       updated_at = now()
//     WHERE google_place_id = ${googlePlaceId}
//   `;
// }


// async function getPlacesNeedingGemini(cityId) {
//     const rows = await sql`
//     SELECT google_place_id
//     FROM public.locations
//     WHERE city_id = ${cityId}
//       AND (
//         estimated_time IS NULL OR
//         max_cost IS NULL OR
//         recommended_for IS NULL OR
//         closed_days IS NULL
//       )
//   `;
//     return new Set(rows.map(r => r.google_place_id));
// }


// // -------------------- Main run --------------------
// function chunk(arr, size) {
//     const out = [];
//     for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
//     return out;
// }

// async function main() {
//     const city = await getCityOrThrow(cityId);

//     // If city already seeded, skip Google/Gemini for seed mode
//     if (mode === "seed") {
//         const already = await isCityAlreadySeeded(city.id);
//         if (already) {
//             console.log(`City ${city.id} already seeded. Exiting without Google/Gemini.`);
//             return;
//         }
//     }


//     const categories = await getCategoriesForRun(mode, categoriesCsv);

//     console.log("City:", city.id, city.name, city.center_lat, city.center_lng);
//     console.log("Mode:", mode, "Categories:", categories.map((c) => c.slug).join(", "));

//     let totalImported = 0;
//     const placesForGemini = [];

//     for (const cat of categories) {
//         if (totalImported >= maxTotalPlaces) break;

//         const includedTypes = (cat.google_types || []).map(String);
//         if (!includedTypes.length) {
//             console.log(`Skip category ${cat.slug} (no google_types)`);
//             continue;
//         }

//         const minNeed = Number(cat.min_results_per_city ?? 20);
//         const maxThisCategory = Math.min(minNeed, Math.max(10, maxTotalPlaces - totalImported));

//         console.log(`\n[${cat.slug}] searchNearby types=${includedTypes.join("|")} target=${maxThisCategory}`);

//         const resp = await placesSearchNearby({
//             lat: city.center_lat,
//             lng: city.center_lng,
//             includedTypes,
//             maxResultCount: Math.min(20, maxThisCategory),
//             radius: radiusMeters,
//         });

//         const places = resp?.places || [];
//         console.log(`[${cat.slug}] got ${places.length} places`);

//         for (const p of places) {
//             if (totalImported >= maxTotalPlaces) break;

//             const placeId = p.id;
//             if (!placeId) continue;

//             // details
//             const d = await placesGetDetails(placeId);

//             const name = d?.displayName?.text || p?.displayName?.text || null;
//             const lat = d?.location?.latitude ?? p?.location?.latitude ?? null;
//             const lng = d?.location?.longitude ?? p?.location?.longitude ?? null;

//             const rating = d?.rating ?? p?.rating ?? null;
//             const userRatingsTotal = d?.userRatingCount ?? p?.userRatingCount ?? null;

//             const primaryType = d?.primaryType ?? p?.primaryType ?? null;
//             const types = d?.types ?? p?.types ?? [];

//             const bestCategoryId = pickBestCategoryIdForPlace(
//                 { placeTypes: types, primaryType },
//                 categories
//             ) || cat.id;

//             // Open hours -> store as jsonb (as-is)
//             const openHours = d?.regularOpeningHours ?? null;

//             const locationId = await upsertLocation({
//                 city_id: city.id,
//                 category_id: bestCategoryId,
//                 name,
//                 google_place_id: placeId,
//                 lat,
//                 lng,
//                 rating,
//                 user_ratings_total: userRatingsTotal,
//                 open_hours: openHours ? JSON.stringify(openHours) : null,
//             });

//             // photo: store first photo name if exists
//             const firstPhotoName = d?.photos?.[0]?.name || p?.photos?.[0]?.name || null;
//             await upsertPrimaryPhoto(locationId, firstPhotoName);

//             // link trip types by rules using category slug
//             const categorySlugRow = categories.find((c) => c.id === bestCategoryId);
//             const categorySlug = categorySlugRow?.slug || cat.slug;
//             await linkTripTypesByRules(locationId, categorySlug);

//             placesForGemini.push({
//                 google_place_id: placeId,
//                 name,
//                 category_slug: categorySlug,
//                 rating,
//                 user_ratings_total: userRatingsTotal,
//             });

//             totalImported += 1;
//         }
//     }

//     console.log(`\nImported/Upserted locations: ${totalImported}`);
//     console.log(`Gemini raw candidates (before DB filter): ${placesForGemini.length}`);

//     // Only enrich places that still need enrichment
//     const needSet = await getPlacesNeedingGemini(city.id);
//     const filteredForGemini = placesForGemini.filter(p => needSet.has(p.google_place_id));

//     console.log(`Gemini candidates (after DB filter): ${filteredForGemini.length}`);


//     // Gemini batches
//     //for (const group of chunk(placesForGemini, batchSize)) {
//     for (const group of chunk(filteredForGemini, batchSize)) {
//         const out = await geminiEnrich(group, city.name);
//         const results = out?.results || [];
//         const map = new Map(results.map((r) => [r.google_place_id, r]));

//         for (const p of group) {
//             const r = map.get(p.google_place_id);
//             if (!r) continue;
//             await updateGeminiFields(p.google_place_id, r);
//         }

//         console.log(`Gemini batch enriched: ${group.length}`);
//     }

//     if (mode === "seed") {
//         await sql`
//     INSERT INTO public.city_seed_status (city_id, last_seeded_at, last_mode, notes)
//     VALUES (${city.id}, now(), ${mode}, 'seed completed')
//     ON CONFLICT (city_id) DO UPDATE SET
//       last_seeded_at = EXCLUDED.last_seeded_at,
//       last_mode = EXCLUDED.last_mode,
//       notes = EXCLUDED.notes
//   `;
//     }



//     console.log("Done.");
// }

// main().catch((e) => {
//     console.error("Seed failed:", e?.message || e, e?.stack || "");
//     process.exit(1);
// });