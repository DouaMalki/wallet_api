import { refreshLocationsForTripType } from "../services/seedCityService.js";

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
        const batchSize = Number.isFinite(Number(batch)) ? Number(batch) : 15;

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

        return res.status(500).json({ message: "Internal server error" });
    }
}