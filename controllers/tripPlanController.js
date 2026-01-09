import { sql } from "../config/db.js";

export async function getlocationsByGooglePlaceId(req, res) {
    try {
        const { google_place_id } = req.params;

        const locations = await sql`
        SELECT * FROM locations WHERE user_id = ${userId} 
      `;

        res.status(200).json(locations);
    } catch (error) {
        console.log("Error getting the locations", error);
        res.status(500).json({ message: "Internal server error" });
    }
}