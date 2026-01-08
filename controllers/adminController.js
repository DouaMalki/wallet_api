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

// Admin: Add a new location
export async function addLocation(req, res) {
  try {
    const {
      city_id,
      name,
      category,
      google_place_id,
      lat,
      lng,
      estimated_time,
      max_cost,
      rating,
      open_hours = {},
      closed_days = [],
      recommended_for = [],
    } = req.body;

    if (!city_id || !name || !category) {
      return res.status(400).json({
        message: "city_id, name, and category are required",
      });
    }

    const result = await sql`
      INSERT INTO locations (
        city_id,
        name,
        category,
        google_place_id,
        lat,
        lng,
        estimated_time,
        max_cost,
        rating,
        open_hours,
        closed_days,
        recommended_for
      )
      VALUES (
        ${city_id},
        ${name},
        ${category},
        ${google_place_id},
        ${lat},
        ${lng},
        ${estimated_time},
        ${max_cost},
        ${rating},
        ${open_hours},
        ${closed_days},
        ${recommended_for}
      )
      RETURNING *
    `;

    res.status(201).json({
      message: "Location added successfully",
      location: result[0],
    });
  } catch (err) {
    console.error("Add location error:", err);

    if (err.code === "23505") {
      return res.status(409).json({
        message: "Location with this Google Place ID already exists",
      });
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

// Admin: Delete a location
export async function deleteLocation(req, res) {
  try {
    const { id } = req.params;

    const result = await sql`
      DELETE FROM locations
      WHERE id = ${id}
      RETURNING id, name
    `;

    if (result.length === 0) {
      return res.status(404).json({
        message: "Location not found",
      });
    }

    res.json({
      message: "Location deleted successfully",
      deletedLocation: result[0],
    });
  } catch (err) {
    console.error("Delete location error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Admin: Get all locations
export async function getAllLocations(req, res) {
  try {
    const locations = await sql`
      SELECT
        id,
        city_id,
        name,
        category,
        google_place_id,
        lat,
        lng,
        estimated_time,
        max_cost,
        rating,
        open_hours,
        closed_days,
        recommended_for,
        created_at
      FROM locations
      ORDER BY created_at DESC
    `;

    res.json(locations);
  } catch (err) {
    console.error("Get locations error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
