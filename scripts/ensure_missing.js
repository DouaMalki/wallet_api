// import "dotenv/config";
// import { sql } from "../config/db.js";
// import { ensureLocationsForTripType } from "../services/seedCityService.js";

// function sleep(ms) {
//     return new Promise((resolve) => setTimeout(resolve, ms));
// }

// function parseArgs() {
//     const args = process.argv.slice(2);
//     const out = {};

//     for (const arg of args) {
//         const clean = String(arg).trim();
//         if (!clean.startsWith("--")) continue;

//         const eqIndex = clean.indexOf("=");
//         if (eqIndex === -1) {
//             out[clean.slice(2)] = true;
//         } else {
//             const key = clean.slice(2, eqIndex).trim();
//             const value = clean.slice(eqIndex + 1).trim();
//             out[key] = value;
//         }
//     }

//     return out;
// }

// async function getAllCities({ cityId = null } = {}) {
//     if (cityId) {
//         return sql`
//       SELECT id, name, name_ar
//       FROM public.cities
//       WHERE lower(id) = lower(${cityId})
//       ORDER BY id ASC
//     `;
//     }

//     return sql`
//     SELECT id, name, name_ar
//     FROM public.cities
//     ORDER BY id ASC
//   `;
// }

// async function getAllTripTypes({ tripType = null } = {}) {
//     if (tripType) {
//         return sql`
//       SELECT slug, name, name_ar
//       FROM public.trip_types
//       WHERE lower(slug) = lower(${tripType})
//       ORDER BY slug ASC
//     `;
//     }

//     return sql`
//     SELECT slug, name, name_ar
//     FROM public.trip_types
//     ORDER BY slug ASC
//   `;
// }

// async function main() {
//     const args = parseArgs();

//     const onlyCityId =
//         typeof args.city === "string" && args.city.trim()
//             ? args.city.trim().toLowerCase()
//             : null;

//     const onlyTripType =
//         typeof args.trip_type === "string" && args.trip_type.trim()
//             ? args.trip_type.trim().toLowerCase()
//             : null;

//     const radiusMeters = Number.isFinite(Number(args.radius))
//         ? Number(args.radius)
//         : 3000;

//     const maxTotalPlaces = Number.isFinite(Number(args.maxTotal))
//         ? Number(args.maxTotal)
//         : 220;

//     const batchSize = Number.isFinite(Number(args.batch))
//         ? Number(args.batch)
//         : 8;

//     const pauseMs = Number.isFinite(Number(args.pause))
//         ? Number(args.pause)
//         : 1500;

//     console.log("=== ensure_missing start ===");
//     console.log({
//         onlyCityId,
//         onlyTripType,
//         radiusMeters,
//         maxTotalPlaces,
//         batchSize,
//         pauseMs,
//     });

//     const cities = await getAllCities({ cityId: onlyCityId });
//     const tripTypes = await getAllTripTypes({ tripType: onlyTripType });

//     if (!cities.length) {
//         throw new Error(`No cities found${onlyCityId ? ` for city=${onlyCityId}` : ""}`);
//     }

//     if (!tripTypes.length) {
//         throw new Error(
//             `No trip types found${onlyTripType ? ` for trip_type=${onlyTripType}` : ""}`
//         );
//     }

//     const results = [];
//     let processed = 0;

//     for (const city of cities) {
//         for (const tripType of tripTypes) {
//             processed += 1;

//             const cityId = String(city.id).toLowerCase().trim();
//             const tripTypeSlug = String(tripType.slug).toLowerCase().trim();

//             console.log(
//                 `[ENSURE_MISSING] (${processed}/${cities.length * tripTypes.length}) city=${cityId} tripType=${tripTypeSlug}`
//             );

//             try {
//                 const out = await ensureLocationsForTripType({
//                     cityId,
//                     tripTypeSlug,
//                     radiusMeters,
//                     maxTotalPlaces,
//                     batchSize,
//                 });

//                 const row = {
//                     cityId,
//                     tripType: tripTypeSlug,
//                     didSeed: Boolean(out?.didSeed),
//                     reason: out?.reason || null,
//                     missing: out?.missing || [],
//                     imported: Number(out?.stats?.imported || 0),
//                     geminiEnriched: Number(out?.stats?.geminiEnriched || 0),
//                     ok: true,
//                 };

//                 results.push(row);
//                 console.log("[ENSURE_MISSING][OK]", row);
//             } catch (error) {
//                 const row = {
//                     cityId,
//                     tripType: tripTypeSlug,
//                     didSeed: false,
//                     reason: error?.message || String(error),
//                     missing: [],
//                     imported: 0,
//                     geminiEnriched: 0,
//                     ok: false,
//                 };

//                 results.push(row);
//                 console.error("[ENSURE_MISSING][ERROR]", row);
//             }

//             await sleep(pauseMs);
//         }
//     }

//     const summary = {
//         totalPairs: results.length,
//         okCount: results.filter((r) => r.ok).length,
//         failCount: results.filter((r) => !r.ok).length,
//         seededCount: results.filter((r) => r.didSeed).length,
//         skippedCount: results.filter((r) => !r.didSeed && r.ok).length,
//         totalImported: results.reduce((sum, r) => sum + (r.imported || 0), 0),
//         totalGeminiEnriched: results.reduce(
//             (sum, r) => sum + (r.geminiEnriched || 0),
//             0
//         ),
//     };

//     console.log("=== ensure_missing done ===");
//     console.log(JSON.stringify(summary, null, 2));
// }

// main()
//     .then(() => {
//         process.exit(0);
//     })
//     .catch((err) => {
//         console.error("ensure_missing fatal error:", err);
//         process.exit(1);
//     });