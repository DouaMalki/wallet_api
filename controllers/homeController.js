import { sql } from "../config/db.js";

/*
  Get all published trip plans with:
  - title
  - city
  - trip type
  - rating
  - first location image
*/
export async function getPublishedTripPlans(req, res) {
  try {
    const result = await sql`
      SELECT
        p.id               AS plan_id,
        p.title,
        p.city_id,
        p.trip_type_slug,
        p.rating,
        p.created_at,

        l.id               AS first_location_id,
        l.name             AS first_location_name,

        lp.photo_url,
        lp.photo_reference,
        lp.source

      FROM saved_trip_plans p

      /* Get first day */
      JOIN saved_trip_plan_days d
        ON d.plan_id = p.id

      /* Get first location in that day */
      JOIN saved_trip_plan_items i
        ON i.plan_day_id = d.id

      JOIN locations l
        ON l.id = i.location_id

      /* First photo of that location */
      LEFT JOIN LATERAL (
        SELECT photo_url, photo_reference, source
        FROM location_photos
        WHERE location_id = l.id
        ORDER BY is_primary DESC, created_at ASC
        LIMIT 1
      ) lp ON TRUE

      WHERE p.published = TRUE

      /* Ensure first day + first location */
      ORDER BY
        p.created_at DESC,
        d.day_key ASC,
        i.position ASC
    `;

    res.status(200).json(result);

  } catch (err) {
    console.error("Get published trip plans error:", err);
    res.status(500).json({
      message: "Failed to fetch published trip plans",
    });
  }
}
