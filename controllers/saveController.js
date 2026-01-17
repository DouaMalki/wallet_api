/*import { sql } from "../config/db.js";

/* Helper: get logged-in user id from whatever your auth middleware sets */
/*function getAuthUserId(req) {
  return req.user?.id ?? req.user?.user_id ?? req.userId ?? null;
}*/

/**
 * POST /api/saved-locations/:locationId
 * Save a location for the logged-in user
 */
/*export async function saveLocation(req, res) {
  try {
    const userId = getAuthUserId(req);
    const locationId = Number(req.params.locationId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!locationId || Number.isNaN(locationId)) {
      return res.status(400).json({ message: "Invalid locationId" });
    }

    // Prevent duplicates (since table doesn't show a unique(user_id, location_id))
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
}*/

/**
 * DELETE /api/saved-locations/:locationId
 * Unsave a location for the logged-in user
 */
/*export async function unsaveLocation(req, res) {
  try {
    const userId = getAuthUserId(req);
    const locationId = Number(req.params.locationId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!locationId || Number.isNaN(locationId)) {
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
}*/

/**
 * GET /api/saved-locations
 * Get all saved locations for the logged-in user
 *
 * Option A: only returns saved_location rows (location_id + saved_at)
 * Option B: join with locations table (if you have it) to return details
 *
 * Below = Option A (safe, won't break if you don't have locations table name/fields yet)
 */
/*export async function getSavedLocations(req, res) {
  try {
    const userId = getAuthUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

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
}*/

/**
 * GET /api/saved-locations/check/:locationId
 * Check if a location is saved by the logged-in user (for bookmark icon state)
 */
/*export async function isLocationSaved(req, res) {
  try {
    const userId = getAuthUserId(req);
    const locationId = Number(req.params.locationId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!locationId || Number.isNaN(locationId)) {
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
}*/
