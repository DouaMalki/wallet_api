import { listLocations } from "../repositories/locationsRepo.js";
import { ensureLocationsForTripType } from "../services/seedCityService.js";

export async function getLocations(req, res) {
    try {
        const { cityId, tripType, limit, offset } = req.query;

        // limit اختياري:
        // - إذا المستخدم ما بعته => null (يعني بدون LIMIT)
        // - إذا بعته => رقم
        const parsedLimit =
            limit === undefined || limit === null || limit === ""
                ? null
                : Number(limit);

        // لو بعث قيمة غلط (NaN أو <=0) اعتبريه بدون limit
        const safeLimit =
            Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

        // offset اختياري
        const parsedOffset =
            offset === undefined || offset === null || offset === "" ? null : Number(offset);
        const safeOffset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : null;

        // tripType نخليه slug lower-case (إذا تبعك أصلاً lowercase)
        const safeTripType =
            typeof tripType === "string" && tripType.trim()
                ? tripType.trim().toLowerCase()
                : null;

        // ✅ هنا الربط: ensure قبل ما نرجّع locations
        if (cityId && safeTripType) {
            // مبدئياً synchronous
            await ensureLocationsForTripType({
                cityId,
                tripTypeSlug: safeTripType,
                radiusMeters: 8000,
                maxTotalPlaces: 220,
                batchSize: 15,
            });
        }

        const rows = await listLocations({
            cityId: cityId || null,
            tripType: safeTripType,
            limit: safeLimit,
            offset: safeOffset,
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
// /api/locations?cityId=ramallah → يرجّع كل رام الله

// /api/locations?cityId=ramallah&limit=50 → يرجّع 50 