import { listLocations } from "../repositories/locationsRepo.js";
import { ensureLocationsForTripType } from "../services/seedCityService.js";

export async function getLocations(req, res) {
    try {
        const { cityId, tripType, limit, offset } = req.query;
        const parsedLimit =
            limit === undefined || limit === null || limit === ""
                ? null
                : Number(limit);

        const safeLimit =
            Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

        const parsedOffset =
            offset === undefined || offset === null || offset === "" ? null : Number(offset);
        const safeOffset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : null;

        const safeTripType =
            typeof tripType === "string" && tripType.trim()
                ? tripType.trim().toLowerCase()
                : null;

        if (cityId && safeTripType) {
            await ensureLocationsForTripType({
                cityId,
                tripTypeSlug: safeTripType,
                radiusMeters: 8000,
                maxTotalPlaces: 220,
                batchSize: 15,
            });
        }

        const lang = (req.query.lang || "en").toLowerCase() === "ar" ? "ar" : "en";

        const rows = await listLocations({
            cityId: cityId || null,
            tripType: safeTripType,
            limit: safeLimit,
            offset: safeOffset,
            lang,
        });

        return res.status(200).json(rows);
    } catch (error) {
        console.error("Error getting locations:", {
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