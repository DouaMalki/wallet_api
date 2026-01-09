import { listTripTypes } from "../repositories/tripTypesRepo.js";
import { sql } from "../config/db.js";

// export async function getTripTypes(req, res) {
//     try {
//         const rows = await listTripTypes();
//         res.status(200).json(rows);
//     } catch (error) {
//         console.log("Error getting trip types:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// }


export async function getTripTypes(req, res) {
    try {
        const { rows } = await sql.query(
            `SELECT id, slug, name_en, name_ar
       FROM trip_types
       ORDER BY id ASC`
        );

        res.json(rows);
    } catch (err) {
        console.error("getTripTypes error:", err);
        res.status(500).json({ message: "Failed to fetch trip types" });
    }
}

