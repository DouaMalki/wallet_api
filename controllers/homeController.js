import { sql } from "../config/db.js";

export async function getPublishedTripPlans(req, res) {
  const { user_id } = req.query;

  try {
    const result = await sql`
      SELECT
        p.id AS plan_id,
        p.title,
        p.city_id,
        p.trip_type_slug,
        p.created_at,

        /* Global rating (from users) */
        stats.rating,
        stats.total_ratings,

        /* User rating (NULL if guest) */
        ur.rating AS user_rating,

        /* First location image ONLY */
        first_img.photo_url,
        first_img.photo_reference,
        first_img.source

      FROM saved_trip_plans p

      /* Global stats */
      LEFT JOIN LATERAL (
        SELECT
          ROUND(AVG(r.rating)::numeric, 2) AS rating,
          COUNT(*) AS total_ratings
        FROM trip_plan_ratings r
        WHERE r.plan_id = p.id
      ) stats ON TRUE

      /* User rating (optional) */
      LEFT JOIN trip_plan_ratings ur
        ON ur.plan_id = p.id
       AND ur.user_id = ${user_id ?? null}

      /* First location IMAGE ONLY */
      LEFT JOIN LATERAL (
        SELECT
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
      ) first_img ON TRUE

      WHERE p.published = TRUE
      ORDER BY p.created_at DESC
    `;

    res.json(result);
  } catch (err) {
    console.error("Get published trip plans error:", err);
    res.status(500).json({
      message: "Failed to fetch published trip plans",
    });
  }
}

/*
  Insert or update rating for a published trip plan
  - First time → INSERT
  - Next times → UPDATE
*/
export async function ratePublishedTripPlan(req, res) {
  const { plan_id, rating, user_id } = req.body;

  if (!plan_id || !rating || !user_id) {
    return res.status(400).json({
      message: "plan_id, rating and user_id are required",
    });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      message: "Rating must be between 1 and 5",
    });
  }

  try {
    /* Ensure plan is published */
    const plan = await sql`
      SELECT id
      FROM saved_trip_plans
      WHERE id = ${plan_id}
        AND published = TRUE
    `;

    if (plan.length === 0) {
      return res.status(404).json({
        message: "Published trip plan not found",
      });
    }

    /* Insert or update user rating */
    await sql`
      INSERT INTO trip_plan_ratings (plan_id, user_id, rating)
      VALUES (${plan_id}, ${user_id}, ${rating})
      ON CONFLICT (plan_id, user_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        updated_at = now()
    `;

    /* Compute updated global rating */
    const stats = await sql`
      SELECT
        ROUND(AVG(rating)::numeric, 2) AS rating,
        COUNT(*) AS total_ratings
      FROM trip_plan_ratings
      WHERE plan_id = ${plan_id}
    `;

    res.status(200).json(stats[0]);
  } catch (err) {
    console.error("Rate published trip plan error:", err);
    res.status(500).json({
      message: "Failed to rate published trip plan",
    });
  }
}


/*
  Get global rating and total_ratings for a trip plan
*/
export async function getTripPlanRating(req, res) {
  const { plan_id } = req.query;

  if (!plan_id) {
    return res.status(400).json({
      message: "Missing plan_id",
    });
  }

  try {
    const result = await sql`
      SELECT
        ROUND(AVG(rating)::numeric, 2) AS rating,
        COUNT(*) AS total_ratings
      FROM trip_plan_ratings
      WHERE plan_id = ${plan_id}
    `;

    res.json(result[0]);
  } catch (err) {
    console.error("Get trip plan rating error:", err);
    res.status(500).json({
      message: "Failed to fetch trip plan rating",
    });
  }
}



/**
 * Get today's trip plan for a user
 * - Returns city_id, trip_type_slug, rating, total_ratings, number_of_seens, dates
 * - Includes image of the FIRST location in the plan
 */
export async function getTodayTripPlan(req, res) {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ message: "Missing user_id" });
  }

  try {
    /**
     * 1️⃣ Find a trip plan for today
     */
    const plans = await sql`
      SELECT
        p.id                AS plan_id,
        p.city_id,
        p.trip_type_slug,
        p.rating,
        p.total_ratings,
        p.number_of_seens,
        p.start_date,
        p.end_date
      FROM saved_trip_plans p
      WHERE p.user_id = ${user_id}
        AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
      ORDER BY p.start_date DESC
      LIMIT 1
    `;

    if (plans.length === 0) {
      return res.status(404).json({ message: "No trip today" });
    }

    const plan = plans[0];

    /**
     * 2️⃣ Get FIRST location image
     */
    const locations = await sql`
      SELECT
        lp.photo_url,
        lp.photo_reference,
        lp.photo_source
      FROM saved_trip_plan_days d
      JOIN saved_trip_plan_items i ON i.plan_day_id = d.id
      JOIN locations l ON l.id = i.location_id
      LEFT JOIN location_photos lp ON lp.location_id = l.id
      WHERE d.plan_id = ${plan.plan_id}
      ORDER BY d.day_key ASC, i.position ASC
      LIMIT 1
    `;

    let photo_url = null;

    if (locations.length > 0) {
      const photo = locations[0];

      if (photo.photo_source === "admin" && photo.photo_url) {
        photo_url = photo.photo_url;
      }

      if (photo.photo_source === "google" && photo.photo_reference) {
        photo_url = photo.photo_reference; // frontend builds Google URL
      }
    }

    /**
     * 3️⃣ Increase number_of_seens
     */
    await sql`
      UPDATE saved_trip_plans
      SET number_of_seens = number_of_seens + 1
      WHERE id = ${plan.plan_id}
    `;

    /**
     * 4️⃣ Response
     */
    res.json({
      plan_id: plan.plan_id,
      city_id: plan.city_id,
      trip_type_slug: plan.trip_type_slug,
      rating: plan.rating,
      total_ratings: plan.total_ratings,
      number_of_seens: plan.number_of_seens + 1,
      dates: {
        start_date: plan.start_date,
        end_date: plan.end_date,
      },
      photo_url,
    });
  } catch (err) {
    console.error("getTodayTripPlan error:", err);
    res.status(500).json({ message: "Failed to fetch today's trip plan" });
  }
}
