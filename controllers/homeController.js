import { sql } from "../config/db.js";

/*
  Get published trip plans with:
  - title
  - city
  - trip type
  - rating
  - total_ratings
  - first location image
*/
export async function getPublishedTripPlans(req, res) {
  try {
    const result = await sql`
      SELECT
        p.id                AS plan_id,
        p.title,
        p.city_id,
        p.trip_type_slug,
        p.rating,
        COALESCE(p.total_ratings, 0) AS total_ratings,
        p.created_at,

        first_loc.location_id,
        first_loc.location_name,
        first_loc.photo_url,
        first_loc.photo_reference,
        first_loc.source

      FROM saved_trip_plans p

      /* Get FIRST location of the plan */
      LEFT JOIN LATERAL (
        SELECT
          l.id   AS location_id,
          l.name AS location_name,
          lp.photo_url,
          lp.photo_reference,
          lp.source
        FROM saved_trip_plan_days d
        JOIN saved_trip_plan_items i
          ON i.plan_day_id = d.id
        JOIN locations l
          ON l.id = i.location_id
        LEFT JOIN LATERAL (
          SELECT photo_url, photo_reference, source
          FROM location_photos
          WHERE location_id = l.id
          ORDER BY is_primary DESC, created_at ASC
          LIMIT 1
        ) lp ON TRUE
        WHERE d.plan_id = p.id
        ORDER BY d.day_key ASC, i.position ASC
        LIMIT 1
      ) first_loc ON TRUE

      WHERE p.published = TRUE
      ORDER BY p.created_at DESC
    `;

    res.status(200).json(result);

  } catch (err) {
    console.error("Get published trip plans error:", err);
    res.status(500).json({
      message: "Failed to fetch published trip plans",
    });
  }
}
