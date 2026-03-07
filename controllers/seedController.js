import { sql } from "../config/db.js";
import {
    refreshLocationsForTripType,
    ensureLocationsForTripType,
} from "../services/seedCityService.js";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureAllSeed(req, res) {
    try {
        const cities = await sql`
            SELECT id, name
            FROM public.cities
            ORDER BY id ASC
        `;

        const tripTypes = await sql`
            SELECT slug, name
            FROM public.trip_types
            ORDER BY slug ASC
        `;

        const results = [];

        for (const city of cities) {
            for (const tripType of tripTypes) {
                const cityId = String(city.id).toLowerCase().trim();
                const tripTypeSlug = String(tripType.slug).toLowerCase().trim();

                console.log(`[ENSURE-ALL] city=${cityId} tripType=${tripTypeSlug}`);

                try {
                    const out = await ensureLocationsForTripType({
                        cityId,
                        tripTypeSlug,
                        radiusMeters: 3000,
                        maxTotalPlaces: 220,
                        batchSize: 8,
                    });

                    results.push({
                        cityId,
                        tripType: tripTypeSlug,
                        ok: true,
                        didSeed: out?.didSeed ?? false,
                        reason: out?.reason ?? null,
                        imported: out?.stats?.imported ?? 0,
                        geminiEnriched: out?.stats?.geminiEnriched ?? 0,
                    });
                } catch (error) {
                    console.error("[ENSURE-ALL ERROR]", cityId, tripTypeSlug, error?.message || error);

                    results.push({
                        cityId,
                        tripType: tripTypeSlug,
                        ok: false,
                        didSeed: false,
                        reason: error?.message || String(error),
                        imported: 0,
                        geminiEnriched: 0,
                    });
                }

                await sleep(1500);
            }
        }

        return res.status(200).json({
            total: results.length,
            seededCount: results.filter((r) => r.didSeed).length,
            failCount: results.filter((r) => !r.ok).length,
            results,
        });
    } catch (error) {
        console.error("ensureAllSeed error:", {
            message: error?.message,
            code: error?.code,
            detail: error?.detail,
            hint: error?.hint,
            where: error?.where,
            stack: error?.stack,
        });

        return res.status(500).json({
            message: "Internal server error",
            error: error?.message || String(error),
        });
    }
}

export async function ensureMissingSeed(req, res) {
    try {
        const { cityId, tripType, radius, maxTotal, batch, pause } = req.query;

        const safeCityId =
            typeof cityId === "string" && cityId.trim()
                ? cityId.trim().toLowerCase()
                : null;

        const safeTripType =
            typeof tripType === "string" && tripType.trim()
                ? tripType.trim().toLowerCase()
                : null;

        const radiusMeters = Number.isFinite(Number(radius)) ? Number(radius) : 3000;
        const maxTotalPlaces = Number.isFinite(Number(maxTotal)) ? Number(maxTotal) : 40;
        const batchSize = Number.isFinite(Number(batch)) ? Number(batch) : 5;
        const pauseMs = Number.isFinite(Number(pause)) ? Number(pause) : 2000;

        const cities = safeCityId
            ? await sql`
                SELECT id, name, name_ar
                FROM public.cities
                WHERE lower(id) = lower(${safeCityId})
                ORDER BY id ASC
              `
            : await sql`
                SELECT id, name, name_ar
                FROM public.cities
                ORDER BY id ASC
              `;

        const tripTypes = safeTripType
            ? await sql`
                SELECT slug, name, name_ar
                FROM public.trip_types
                WHERE lower(slug) = lower(${safeTripType})
                ORDER BY slug ASC
              `
            : await sql`
                SELECT slug, name, name_ar
                FROM public.trip_types
                ORDER BY slug ASC
              `;

        if (!cities.length) {
            return res.status(400).json({ message: "No matching cities found" });
        }

        if (!tripTypes.length) {
            return res.status(400).json({ message: "No matching trip types found" });
        }

        const results = [];
        let processed = 0;
        const totalPairs = cities.length * tripTypes.length;

        for (const city of cities) {
            for (const tripTypeRow of tripTypes) {
                processed += 1;

                const cityIdValue = String(city.id).toLowerCase().trim();
                const tripTypeSlug = String(tripTypeRow.slug).toLowerCase().trim();

                console.log(
                    `[ENSURE_MISSING] (${processed}/${totalPairs}) city=${cityIdValue} tripType=${tripTypeSlug}`
                );

                try {
                    const out = await ensureLocationsForTripType({
                        cityId: cityIdValue,
                        tripTypeSlug,
                        radiusMeters,
                        maxTotalPlaces,
                        batchSize,
                    });

                    results.push({
                        cityId: cityIdValue,
                        tripType: tripTypeSlug,
                        ok: true,
                        didSeed: Boolean(out?.didSeed),
                        reason: out?.reason || null,
                        missing: out?.missing || [],
                        imported: Number(out?.stats?.imported || 0),
                        geminiEnriched: Number(out?.stats?.geminiEnriched || 0),
                    });
                } catch (error) {
                    results.push({
                        cityId: cityIdValue,
                        tripType: tripTypeSlug,
                        ok: false,
                        didSeed: false,
                        reason: error?.message || String(error),
                        missing: [],
                        imported: 0,
                        geminiEnriched: 0,
                    });
                }

                if (pauseMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, pauseMs));
                }
            }
        }

        const summary = {
            totalPairs: results.length,
            okCount: results.filter((r) => r.ok).length,
            failCount: results.filter((r) => !r.ok).length,
            seededCount: results.filter((r) => r.didSeed).length,
            skippedCount: results.filter((r) => !r.didSeed && r.ok).length,
            totalImported: results.reduce((sum, r) => sum + (r.imported || 0), 0),
            totalGeminiEnriched: results.reduce(
                (sum, r) => sum + (r.geminiEnriched || 0),
                0
            ),
            results,
        };

        return res.status(200).json(summary);
    } catch (error) {
        console.error("ensureMissingSeed error:", {
            message: error?.message,
            code: error?.code,
            detail: error?.detail,
            hint: error?.hint,
            where: error?.where,
            stack: error?.stack,
        });

        return res.status(500).json({
            message: "Internal server error",
            error: error?.message || String(error),
        });
    }
}

export async function ensureSeed(req, res) {
    try {
        const { cityId, tripType, radius, maxTotal, batch } = req.query;

        const safeCityId =
            typeof cityId === "string" && cityId.trim() ? cityId.trim().toLowerCase() : null;

        const safeTripType =
            typeof tripType === "string" && tripType.trim()
                ? tripType.trim().toLowerCase()
                : null;

        const radiusMeters = Number.isFinite(Number(radius)) ? Number(radius) : 3000;
        const maxTotalPlaces = Number.isFinite(Number(maxTotal)) ? Number(maxTotal) : 220;
        const batchSize = Number.isFinite(Number(batch)) ? Number(batch) : 8;

        const out = await ensureLocationsForTripType({
            cityId: safeCityId,
            tripTypeSlug: safeTripType,
            radiusMeters,
            maxTotalPlaces,
            batchSize,
        });

        return res.status(200).json(out);
    } catch (error) {
        console.error("ensureSeed error:", {
            message: error?.message,
            code: error?.code,
            detail: error?.detail,
            hint: error?.hint,
            where: error?.where,
            stack: error?.stack,
        });

        return res.status(500).json({
            message: "Internal server error",
            error: error?.message || String(error),
        });
    }
}

export async function refreshSeed(req, res) {
    try {
        const { cityId, tripType, categories, radius, maxTotal, batch } = req.query;

        const safeCityId =
            typeof cityId === "string" && cityId.trim() ? cityId.trim().toLowerCase() : null;

        const safeTripType =
            typeof tripType === "string" && tripType.trim()
                ? tripType.trim().toLowerCase()
                : null;

        const categoriesSlugs =
            typeof categories === "string" && categories.trim()
                ? categories
                    .split(",")
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean)
                : null;

        const radiusMeters = Number.isFinite(Number(radius)) ? Number(radius) : 3000;
        const maxTotalPlaces = Number.isFinite(Number(maxTotal)) ? Number(maxTotal) : 220;
        const batchSize = Number.isFinite(Number(batch)) ? Number(batch) : 8;

        const out = await refreshLocationsForTripType({
            cityId: safeCityId,
            tripTypeSlug: safeTripType,
            categoriesSlugs,
            radiusMeters,
            maxTotalPlaces,
            batchSize,
        });

        return res.status(200).json(out);
    } catch (error) {
        console.error("refreshSeed error:", {
            message: error?.message,
            code: error?.code,
            detail: error?.detail,
            hint: error?.hint,
            where: error?.where,
            stack: error?.stack,
        });

        return res.status(500).json({
            message: "Internal server error",
            error: error?.message || String(error),
        });
    }
}