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
    const radiusMeters = Number(getArg("radius", "3000"));
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