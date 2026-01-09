// import { listTripTypes } from "../repositories/tripTypesRepo.js";


// export async function getTripTypes(req, res) {
//     try {
//         const tripTypes = await listTripTypes();
//         res.status(200).json(tripTypes);
//     } catch (err) {
//         console.error("getTripTypes error:", err);
//         res.status(500).json({ message: "Failed to fetch trip types" });
//     }
// }


// controllers/tripTypesController.js
import { listTripTypes } from "../repositories/tripTypesRepo.js";

export async function getTripTypes(req, res) {
    try {
        const { slug } = req.query;
        const rows = await listTripTypes({ slug });

        // إذا طلب slug واحد
        if (slug) {
            return res.status(200).json(rows[0] || null);
        }

        return res.status(200).json(rows);
    } catch (err) {
        console.error("getTripTypes error:", err);
        return res.status(500).json({ message: "Failed to fetch trip types" });
    }
}
