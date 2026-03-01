import { sql } from "../config/db.js";
import { createTripPlan } from "../repositories/savedTripPlansRepo.js";

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

/** GET /api/saved-trip-plans  (plans bookmarked from Home) */
export async function getSavedTripPlans(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const rows = await sql`
      SELECT
        stp.id, stp.city_id, stp.trip_type_slug, stp.title,
        stp.audience_tag, stp.transport_type, stp.budget_max,
        stp.start_date, stp.end_date, stp.trip_start_time, stp.trip_end_time,
        stp.created_at, stp.updated_at, stp.saved, stp.confirmed,

        -- Cover photo from first location in the plan
        cover.photo_url AS cover_photo_url,
        cover.photo_reference AS cover_photo_reference

      FROM saved_trip_plans stp

      LEFT JOIN LATERAL (
        SELECT
          lp.photo_url,
          lp.photo_reference
        FROM saved_trip_plan_days d
        JOIN saved_trip_plan_items i
          ON i.plan_day_id = d.id

        LEFT JOIN LATERAL (
          SELECT photo_url, photo_reference
          FROM location_photos
          WHERE location_id = i.location_id
          ORDER BY is_primary DESC, created_at DESC
          LIMIT 1
        ) lp ON TRUE

        WHERE d.plan_id = stp.id
        ORDER BY d.day_key ASC, i.position ASC
        LIMIT 1
      ) cover ON TRUE

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

/** GET /api/confirmed-trip-plans (plans created & confirmed by the user) */
export async function getConfirmedTripPlans(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const rows = await sql`
      SELECT
        stp.id, stp.city_id, stp.trip_type_slug, stp.title,
        stp.audience_tag, stp.transport_type, stp.budget_max,
        stp.start_date, stp.end_date, stp.trip_start_time, stp.trip_end_time,
        stp.created_at, stp.updated_at, stp.saved, stp.confirmed,

        -- Cover photo from first location in the plan
        cover.photo_url AS cover_photo_url,
        cover.photo_reference AS cover_photo_reference

      FROM saved_trip_plans stp

      LEFT JOIN LATERAL (
        SELECT
          lp.photo_url,
          lp.photo_reference
        FROM saved_trip_plan_days d
        JOIN saved_trip_plan_items i
          ON i.plan_day_id = d.id

        LEFT JOIN LATERAL (
          SELECT photo_url, photo_reference
          FROM location_photos
          WHERE location_id = i.location_id
          ORDER BY is_primary DESC, created_at DESC
          LIMIT 1
        ) lp ON TRUE

        WHERE d.plan_id = stp.id
        ORDER BY d.day_key ASC, i.position ASC
        LIMIT 1
      ) cover ON TRUE

      WHERE stp.user_id = ${userId}
        AND stp.confirmed = true

      ORDER BY stp.created_at DESC
    `;

    return res.status(200).json({ confirmed_trip_plans: rows });
  } catch (err) {
    console.error("getConfirmedTripPlans error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

// POST /api/saved-trip-plans
export async function saveTripPlan(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { title, tripRequest, finalPlan, answeredSurvey, published } = req.body;

    const result = await createTripPlan({
      userId,
      title,
      answeredSurvey,
      published,
      tripRequest,
      finalPlan,
      mode: "saved",
    });

    return res.status(201).json({ message: "Trip plan saved", id: result.planId });
  } catch (err) {
    console.error("saveTripPlan error:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
}

// POST /api/confirmed-trip-plans
export async function confirmTripPlan(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { title, tripRequest, finalPlan, answeredSurvey, published } = req.body;

    const result = await createTripPlan({
      userId,
      title,
      answeredSurvey,
      published,
      tripRequest,
      finalPlan,
      mode: "confirmed",
    });

    return res.status(201).json({ message: "Trip plan confirmed", id: result.planId });
  } catch (err) {
    console.error("confirmTripPlan error:", err);
    return res.status(500).json({ message: err.message || "Internal server error" });
  }
}

// GET /api/trip-plans/:planId
export async function getTripPlanDetails(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const planId = req.params.planId;

    // 1) Make sure this plan belongs to this user
    const planRows = await sql`
      SELECT
        id,
        user_id,
        title,
        city_id,
        trip_type_slug,
        start_date,
        end_date,
        trip_start_time,
        trip_end_time,
        saved,
        confirmed
      FROM saved_trip_plans
      WHERE id = ${planId} AND user_id = ${userId}
      LIMIT 1
    `;

    if (!planRows.length) {
      return res.status(404).json({ message: "Plan not found" });
    }

    const plan = planRows[0];

    // 2) Get days + items + location details (+ one photo)
    const rows = await sql`
      SELECT
        d.id AS day_id,
        d.day_key,
        d.polyline,
        d.distance_text,
        d.duration_text,
        d.leg_durations_min,

        i.position,
        i.location_id,
        i.start_time,
        i.end_time,
        i.duration_min,

        l.name,
        l.lat,
        l.lng,
        l.google_place_id,

        lp.source AS photo_source,
        lp.photo_url,
        lp.photo_reference
      FROM saved_trip_plan_days d
      JOIN saved_trip_plan_items i ON i.plan_day_id = d.id
      JOIN locations l ON l.id = i.location_id
      LEFT JOIN LATERAL (
        SELECT source, photo_url, photo_reference
        FROM location_photos
        WHERE location_id = l.id
        ORDER BY is_primary DESC, created_at DESC
        LIMIT 1
      ) lp ON TRUE
      WHERE d.plan_id = ${planId}
      ORDER BY d.day_key ASC, i.position ASC
    `;

    // 3) Group by day
    const daysMap = {};
    for (const r of rows) {
      if (!daysMap[r.day_id]) {
        daysMap[r.day_id] = {
          day_id: r.day_id,
          day_key: r.day_key,
          polyline: r.polyline || "",
          distance_text: r.distance_text || "",
          duration_text: r.duration_text || "",
          leg_durations_min: r.leg_durations_min || [],
          places: [],
        };
      }

      daysMap[r.day_id].places.push({
        position: r.position,
        location_id: r.location_id,
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        google_place_id: r.google_place_id,
        start_time: r.start_time,
        end_time: r.end_time,
        duration_min: r.duration_min,
        photo_source: r.photo_source,
        photo_url: r.photo_url,
        photo_reference: r.photo_reference,
      });
    }

    return res.status(200).json({
      plan,
      days: Object.values(daysMap),
    });
  } catch (err) {
    console.error("getTripPlanDetails error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

// PATCH /api/saved-trip-plans/:planId/unsave
export async function unsaveTripPlan(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const planId = req.params.planId;

    const updated = await sql`
      UPDATE saved_trip_plans
      SET saved = false, updated_at = NOW()
      WHERE id = ${planId} AND user_id = ${userId} AND saved = true
      RETURNING id
    `;

    if (!updated.length) {
      return res.status(404).json({ message: "Saved plan not found" });
    }

    return res.status(200).json({ message: "Plan unsaved successfully" });
  } catch (err) {
    console.error("unsaveTripPlan error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}

// DELETE /api/confirmed-trip-plans/:planId
export async function deleteConfirmedTripPlan(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const planId = req.params.planId;

    // only allow deleting confirmed plans
    const deleted = await sql`
      DELETE FROM saved_trip_plans
      WHERE id = ${planId} AND user_id = ${userId} AND confirmed = true
      RETURNING id
    `;

    if (!deleted.length) {
      return res.status(404).json({ message: "Confirmed plan not found" });
    }

    return res.status(200).json({ message: "Confirmed plan deleted successfully" });
  } catch (err) {
    console.error("deleteConfirmedTripPlan error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}





