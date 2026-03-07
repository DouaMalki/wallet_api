import { sql } from "../config/db.js";
import {
    ensureLocationsForTripType,
    refreshLocationsForTripType,
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