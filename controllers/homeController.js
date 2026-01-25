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

// controllers/tripsController.js
import { sql } from "../config/db.js";

/*
  Rate a published trip plan
  Formula:
  new_rating = (old_rating * total_ratings + user_rating) / (total_ratings + 1)
*/
export async function ratePublishedTripPlan(req, res) {
  const { plan_id, rating } = req.body;

  if (!plan_id || !rating) {
    return res.status(400).json({
      message: "plan_id and rating are required",
    });
  }

  const userRating = Number(rating);
  if (userRating < 1 || userRating > 5) {
    return res.status(400).json({
      message: "Rating must be between 1 and 5",
    });
  }

  try {
    /* Get current rating data */
    const result = await sql`
      SELECT
        COALESCE(rating, 0) AS rating,
        COALESCE(total_ratings, 0) AS total_ratings
      FROM saved_trip_plans
      WHERE id = ${plan_id}
        AND published = true
    `;

    if (result.length === 0) {
      return res.status(404).json({
        message: "Published trip plan not found",
      });
    }

    const { rating: oldRating, total_ratings } = result[0];

    const newRating = Number(
      (
        (oldRating * total_ratings + userRating) /
        (total_ratings + 1)
      ).toFixed(2)
    );

    /* Update trip plan */
    await sql`
      UPDATE saved_trip_plans
      SET
        rating = ${newRating},
        total_ratings = ${total_ratings + 1},
        updated_at = now()
      WHERE id = ${plan_id}
    `;

    res.status(200).json({
      rating: newRating,
      total_ratings: total_ratings + 1,
    });

  } catch (err) {
    console.error("Rate trip plan error:", err);
    res.status(500).json({
      message: "Failed to rate trip plan",
    });
  }
}

