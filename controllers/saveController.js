import { sql } from "../config/db.js";

function getAuthUserId(req) {
  return req.user?.user_id ?? req.user?.id ?? req.userId ?? null;
}

function isUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// POST /api/saved-locations/:locationId
export async function saveLocation(req, res) {
  try {
    const userId = getAuthUserId(req);
    const locationId = (req.params.locationId || "").trim(); // UUID string

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (!isUUID(locationId)) {
      return res.status(400).json({ message: "Invalid locationId" });
    }

    // Optional (recommended): ensure location exists
    const loc = await sql`
      SELECT id FROM locations WHERE id = ${locationId} LIMIT 1
    `;
    if (loc.length === 0) {
      return res.status(404).json({ message: "Location not found" });
    }

    // If you added UNIQUE(user_id, location_id), this check is still nice for clean response
    const existing = await sql`
      SELECT saved_location_id
      FROM saved_location
      WHERE user_id = ${userId} AND location_id = ${locationId}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return res.status(200).json({
        message: "Location already saved",
        saved_location_id: existing[0].saved_location_id,
      });
    }

    const inserted = await sql`
      INSERT INTO saved_location (user_id, location_id)
      VALUES (${userId}, ${locationId})
      RETURNING saved_location_id, user_id, location_id, saved_at
    `;

    return res.status(201).json({
      message: "Location saved successfully",
      saved: inserted[0],
    });
  } catch (err) {
    console.error("saveLocation error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

// DELETE /api/saved-locations/:locationId
export async function unsaveLocation(req, res) {
  try {
    const userId = getAuthUserId(req);
    const locationId = (req.params.locationId || "").trim();

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (!isUUID(locationId)) {
      return res.status(400).json({ message: "Invalid locationId" });
    }

    const deleted = await sql`
      DELETE FROM saved_location
      WHERE user_id = ${userId} AND location_id = ${locationId}
      RETURNING saved_location_id
    `;

    if (deleted.length === 0) {
      return res.status(404).json({ message: "Saved location not found" });
    }

    return res.status(200).json({ message: "Location removed from saved" });
  } catch (err) {
    console.error("unsaveLocation error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

// GET /api/saved-locations
export async function getSavedLocations(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const saved = await sql`
      SELECT
        saved_location_id AS id,
        location_id,
        saved_at
      FROM saved_location
      WHERE user_id = ${userId}
      ORDER BY saved_at DESC
    `;

    return res.status(200).json({ saved_locations: saved });
  } catch (err) {
    console.error("getSavedLocations error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

// GET /api/saved-locations/check/:locationId
export async function isLocationSaved(req, res) {
  try {
    const userId = getAuthUserId(req);
    const locationId = (req.params.locationId || "").trim();

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (!isUUID(locationId)) {
      return res.status(400).json({ message: "Invalid locationId" });
    }

    const existing = await sql`
      SELECT 1
      FROM saved_location
      WHERE user_id = ${userId} AND location_id = ${locationId}
      LIMIT 1
    `;

    return res.status(200).json({ saved: existing.length > 0 });
  } catch (err) {
    console.error("isLocationSaved error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
