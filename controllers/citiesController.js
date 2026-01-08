import { listCities } from "../repositories/citiesRepo.js";

export async function getCities(req, res) {
    try {
        const rows = await listCities();
        res.status(200).json(rows);
    } catch (error) {
        console.log("Error getting cities:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}
