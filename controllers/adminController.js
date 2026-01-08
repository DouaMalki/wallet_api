import { sql } from "../config/db.js";

// Admin: Add a new trip type
export async function addTripType(req, res) {
  try {
    const { slug, name, name_ar } = req.body;

    if (!slug || !name) {
      return res.status(400).json({
        message: "slug and name are required",
      });
    }

    const result = await sql`
      INSERT INTO trip_types (slug, name, name_ar)
      VALUES (${slug}, ${name}, ${name_ar})
      RETURNING id, slug, name, name_ar
    `;

    res.status(201).json({
      message: "Trip type added successfully",
      tripType: result[0],
    });
  } catch (err) {
    console.error("Add trip type error:", err);

    // Handle unique slug error nicely
    if (err.code === "23505") {
      return res.status(409).json({
        message: "Trip type with this slug already exists",
      });
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

// Admin: Remove a trip type
export async function deleteTripType(req, res) {
  try {
    const { id } = req.params;

    const result = await sql`
      DELETE FROM trip_types
      WHERE id = ${id}
      RETURNING id, slug, name
    `;

    if (result.length === 0) {
      return res.status(404).json({
        message: "Trip type not found",
      });
    }

    res.json({
      message: "Trip type deleted successfully",
      deletedTripType: result[0],
    });
  } catch (err) {
    console.error("Delete trip type error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Get all trip types (used by trip plan form)
export async function getAllTripTypes(req, res) {
  try {
    const tripTypes = await sql`
      SELECT
        id,
        slug,
        name,
        name_ar
      FROM trip_types
      ORDER BY created_at ASC
    `;

    res.json(tripTypes);
  } catch (err) {
    console.error("Get trip types error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
