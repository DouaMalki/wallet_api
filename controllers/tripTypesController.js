// controllers/tripTypesController.js
import { listTripTypes } from "../repositories/tripTypesRepo.js";

export async function getTripTypes(req, res) {
    try {
        const { slug } = req.query;
        const lang = (req.query.lang || "en").toLowerCase() === "ar" ? "ar" : "en";

        const rows = await listTripTypes({ slug, lang });

        if (slug) {
            return res.status(200).json(rows[0] || null);
        }

        return res.status(200).json(rows);
    } catch (err) {
        console.error("getTripTypes error:", err);
        return res.status(500).json({ message: "Failed to fetch trip types" });
    }
}
