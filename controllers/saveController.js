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

    const rows = await sql`
      SELECT
        sl.saved_location_id AS saved_id,
        sl.saved_at,

        l.id AS location_id,
        l.name,
        l.google_place_id,
        l.lat,
        l.lng,
        l.rating,
        l.user_ratings_total,

        -- photo fields (from location_photos)
        lp.source AS photo_source,
        lp.photo_url,
        lp.photo_reference
      FROM saved_location sl
      JOIN locations l ON l.id = sl.location_id

      -- pick ONE photo per location (primary first, else newest)
      LEFT JOIN LATERAL (
        SELECT source, photo_url, photo_reference
        FROM location_photos
        WHERE location_id = l.id
        ORDER BY is_primary DESC, created_at DESC
        LIMIT 1
      ) lp ON TRUE

      WHERE sl.user_id = ${userId}
      ORDER BY sl.saved_at DESC
    `;

    return res.status(200).json({ saved_locations: rows });
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

// GET /api/saved-trip-plans //work
export async function getSavedTripPlans(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const rows = await sql`
      SELECT
        stp.id,
        stp.city_id,
        stp.trip_type_slug,
        stp.title,
        stp.audience_tag,
        stp.transport_type,
        stp.budget_max,
        stp.start_date,
        stp.end_date,
        stp.trip_start_time,
        stp.trip_end_time,
        stp.trip_day_times,
        stp.places_per_day,
        stp.selected_nights,
        stp.answered_survey,
        stp.published,
        stp.created_at,
        stp.updated_at,
        stp.saved,
        stp.confirmed,
        stp.number_of_seens
      FROM saved_trip_plans stp
      WHERE stp.user_id = ${userId}
        AND stp.saved = true
      ORDER BY stp.created_at DESC
    `;

    return res.status(200).json({ saved_trip_plans: rows });
  } catch (err) {
    console.error("getSavedTripPlans error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

