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

        const rows = await listLocations({
            cityId,
            limit: limit ? Number(limit) : 50,
        });

        res.status(200).json(rows);
    } catch (error) {
        console.log("Error getting locations:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}
