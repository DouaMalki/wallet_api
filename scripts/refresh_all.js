// import "dotenv/config";
// import { sql } from "../config/db.js";
// import { refreshLocationsForTripType } from "../services/seedCityService.js";

// function sleep(ms) {
//     return new Promise((resolve) => setTimeout(resolve, ms));
// }

// async function getAllCities() {
//     const rows = await sql`
//     SELECT id, name
//     FROM public.cities
//     ORDER BY id ASC
//   `;
//     return rows;
// }

// async function getAllTripTypes() {
//     const rows = await sql`
//     SELECT slug, name
//     FROM public.trip_types
//     ORDER BY slug ASC
//   `;
//     return rows;
// }

// async function main() {
//     const cities = await getAllCities();
//     const tripTypes = await getAllTripTypes();

//     console.log("=== REFRESH ALL START ===");
//     console.log("cities:", cities.length);
//     console.log("tripTypes:", tripTypes.length);

//     const results = [];

//     for (const city of cities) {
//         for (const tripType of tripTypes) {
//             const cityId = String(city.id).toLowerCase().trim();
//             const tripTypeSlug = String(tripType.slug).toLowerCase().trim();

//             console.log(`\n[REFRESH] city=${cityId} tripType=${tripTypeSlug}`);

//             try {
//                 const out = await refreshLocationsForTripType({
//                     cityId,
//                     tripTypeSlug,
//                     radiusMeters: 3000,
//                     maxTotalPlaces: 220,
//                     batchSize: 8,
//                 });

//                 console.log("[RESULT]", JSON.stringify(out));

//                 results.push({
//                     cityId,
//                     tripType: tripTypeSlug,
//                     ok: true,
//                     didRefresh: out?.didRefresh ?? false,
//                     imported: out?.stats?.imported ?? 0,
//                     geminiEnriched: out?.stats?.geminiEnriched ?? 0,
//                     reason: out?.reason ?? null,
//                 });
//             } catch (error) {
//                 console.error("[ERROR]", cityId, tripTypeSlug, error?.message || error);

//                 results.push({
//                     cityId,
//                     tripType: tripTypeSlug,
//                     ok: false,
//                     didRefresh: false,
//                     imported: 0,
//                     geminiEnriched: 0,
//                     reason: error?.message || String(error),
//                 });
//             }

//             // pause صغير بين كل عملية
//             await sleep(1500);
//         }
//     }

//     console.log("\n=== REFRESH ALL SUMMARY ===");

//     const total = results.length;
//     const okCount = results.filter((r) => r.ok).length;
//     const failCount = results.filter((r) => !r.ok).length;
//     const refreshedCount = results.filter((r) => r.didRefresh).length;
//     const totalImported = results.reduce((sum, r) => sum + (r.imported || 0), 0);
//     const totalGemini = results.reduce((sum, r) => sum + (r.geminiEnriched || 0), 0);

//     console.log(
//         JSON.stringify(
//             {
//                 total,
//                 okCount,
//                 failCount,
//                 refreshedCount,
//                 totalImported,
//                 totalGemini,
//                 results,
//             },
//             null,
//             2
//         )
//     );
// }

// main().catch((e) => {
//     console.error("refresh_all failed:", e?.message || e);
//     if (e?.stack) console.error(e.stack);
//     process.exit(1);
// });