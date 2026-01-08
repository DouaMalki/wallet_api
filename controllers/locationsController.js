// // wallet_api/controllers/locationsController.js
// import { getLocationsByCityId } from "../repositories/locationsRepo.js";
// import { mapLocationRow } from "../mappers/locationMapper.js";

// export async function getLocations(req, res) {
//     try {
//         const cityId = req.query.cityId;
//         if (!cityId) {
//             return res.status(400).json({ error: "cityId is required" });
//         }

//         const rows = await getLocationsByCityId(cityId);
//         const locations = rows.map(mapLocationRow);

//         return res.json({ locations });
//     } catch (err) {
//         console.error("❌ getLocations error:", err);
//         return res.status(500).json({ error: "Internal server error" });
//     }
// }

import { listLocations } from "../repositories/locationsRepo.js";

export async function getLocations(req, res) {
    try {
        const { cityId, limit } = req.query;

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

        const rows = await listLocations({
            cityId,
            limit: safeLimit,
        });

        res.status(200).json(rows);
    } catch (error) {
        console.log("Error getting locations:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}
// /api/locations?cityId=ramallah → يرجّع كل رام الله

// /api/locations?cityId=ramallah&limit=50 → يرجّع 50 