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
        p.start_date,
        p.end_date,
        p.number_of_seens,

        /* ✅ Total days (inclusive) */
        (p.end_date - p.start_date + 1) AS total_days,

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


export async function getTodayTripPlan(req, res) {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ message: "Missing user_id" });
  }

  try {
    /* Get today's trip plan */
    const plans = await sql`
      SELECT
        p.id AS plan_id,
        p.city_id,
        p.trip_type_slug,
        p.start_date,
        p.end_date,
        CURRENT_DATE - p.start_date + 1 AS current_day,
        p.end_date - p.start_date + 1 AS total_days
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

    /* Get FIRST location image */
    const image = await sql`
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
      WHERE d.plan_id = ${plan.plan_id}
      ORDER BY d.day_key ASC, i.position ASC
      LIMIT 1
    `;

    let photo = null;

    if (image.length > 0) {
      const img = image[0];
      photo =
        img.source === "admin"
          ? img.photo_url
          : img.photo_reference; // frontend builds Google URL
    }

    /* Response */
    res.json({
      plan_id: plan.plan_id,
      city_id: plan.city_id,
      trip_type_slug: plan.trip_type_slug,
      dates: {
        start_date: plan.start_date,
        end_date: plan.end_date,
      },
      progress: {
        current_day: Number(plan.current_day),
        total_days: Number(plan.total_days),
      },
      photo,
    });
  } catch (err) {
    console.error("getTodayTripPlan error:", err);
    res.status(500).json({
      message: "Failed to fetch today's trip plan",
    });
  }
}


export async function incrementTripPlanSeens(req, res) {
  const { plan_id } = req.body;

  if (!plan_id) {
    return res.status(400).json({
      message: "Missing plan_id",
    });
  }

  try {
    const updated = await sql`
      UPDATE saved_trip_plans
      SET number_of_seens = number_of_seens + 1
      WHERE id = ${plan_id}
        AND published = TRUE
      RETURNING number_of_seens
    `;

    if (updated.length === 0) {
      return res.status(404).json({
        message: "Published trip plan not found",
      });
    }

    res.json({
      number_of_seens: updated[0].number_of_seens,
    });
  } catch (err) {
    console.error("Increment trip plan seens error:", err);
    res.status(500).json({
      message: "Failed to increment trip plan views",
    });
  }
}
