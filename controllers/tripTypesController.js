import { listTripTypes } from "../repositories/tripTypesRepo.js";

export async function getTripTypes(req, res) {
    try {
        const rows = await listTripTypes();
        res.status(200).json(rows);
    } catch (error) {
        console.log("Error getting trip types:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}
