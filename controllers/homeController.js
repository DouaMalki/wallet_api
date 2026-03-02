import { sql } from "../config/db.js";

export async function getPublishedTripPlans(req, res) {
  const { user_id } = req.query;

  try {
    const result = await sql`
      SELECT
        p.id,
        p.title,
        p.city_id,
        p.trip_type_slug,
        p.audience_tag,
        p.budget_max,
        p.number_of_seens,
        p.start_date,
        p.end_date,
        p.saved,

        (p.end_date - p.start_date + 1) AS total_days,

        /* Rating stats */
        COALESCE(stats.rating, 0) AS rating,
        COALESCE(stats.total_ratings, 0) AS total_ratings,

        /* User rating */
        ur.rating AS user_rating,

        /* DAYS + LOCATIONS */
        (
          SELECT json_agg(
            json_build_object(
              'day_id', d.id,
              'date', d.day_key,
              'items', (
                SELECT json_agg(
                  json_build_object(
                    'location_id', l.id,
                    'location_name', l.name,
                    'start_time', i.start_time,
                    'end_time', i.end_time,
                    'position', i.position,
                    'photo_reference', lp.photo_reference,
                    'photo_url', lp.photo_url
                  )
                  ORDER BY i.position
                )
                FROM saved_trip_plan_items i
                JOIN locations l ON l.id = i.location_id
                LEFT JOIN LATERAL (
                  SELECT photo_reference, photo_url
                  FROM location_photos
                  WHERE location_id = l.id
                  ORDER BY is_primary DESC, created_at DESC
                  LIMIT 1
                ) lp ON TRUE
                WHERE i.plan_day_id = d.id
              )
            )
            ORDER BY d.day_key
          )
          FROM saved_trip_plan_days d
          WHERE d.plan_id = p.id
        ) AS days

      FROM saved_trip_plans p

      /* Rating aggregation */
      LEFT JOIN LATERAL (
        SELECT
          ROUND(AVG(r.rating)::numeric, 2) AS rating,
          COUNT(*) AS total_ratings
        FROM trip_plan_ratings r
        WHERE r.plan_id = p.id
      ) stats ON TRUE

      /* User rating */
      LEFT JOIN trip_plan_ratings ur
        ON ur.plan_id = p.id
       AND ur.user_id = ${user_id ?? null}

      WHERE p.published = TRUE

      ORDER BY
      (COALESCE(stats.rating, 0) * COALESCE(stats.total_ratings, 0)) DESC,
      p.number_of_seens DESC,
      p.created_at DESC
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
    const result = await sql`
      SELECT
        p.id,
        p.title,
        p.city_id,
        p.trip_type_slug,
        p.audience_tag,
        p.budget_max,
        p.start_date,
        p.end_date,

        (CURRENT_DATE - p.start_date + 1) AS current_day,
        (p.end_date - p.start_date + 1) AS total_days,

        (
          SELECT json_agg(
            json_build_object(
              'day_id', d.id,
              'date', d.day_key,
              'items', (
                SELECT json_agg(
                  json_build_object(
                    'location_id', l.id,
                    'location_name', l.name,
                    'start_time', i.start_time,
                    'end_time', i.end_time,
                    'position', i.position,
                    'photo_reference', lp.photo_reference,
                    'photo_url', lp.photo_url
                  )
                  ORDER BY i.position
                )
                FROM saved_trip_plan_items i
                JOIN locations l ON l.id = i.location_id
                LEFT JOIN LATERAL (
                  SELECT photo_reference, photo_url
                  FROM location_photos
                  WHERE location_id = l.id
                  ORDER BY is_primary DESC, created_at DESC
                  LIMIT 1
                ) lp ON TRUE
                WHERE i.plan_day_id = d.id
              )
            )
            ORDER BY d.day_key
          )
          FROM saved_trip_plan_days d
          WHERE d.plan_id = p.id
        ) AS days

      FROM saved_trip_plans p
      WHERE p.user_id = ${user_id}
        AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
      ORDER BY p.start_date DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return res.status(404).json({ message: "No trip today" });
    }

    res.json(result[0]);

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

export async function SaveTripPlan(req, res) {
  const { plan_id, user_id } = req.body;

  if (!plan_id || !user_id) {
    return res.status(400).json({
      message: "plan_id and user_id are required",
    });
  }

  try {
    const plan = await sql`
      SELECT id, saved
      FROM saved_trip_plans
      WHERE id = ${plan_id}
        AND user_id = ${user_id}
    `;

    if (plan.length === 0) {
      return res.status(404).json({
        message: "Trip plan not found",
      });
    }

    const currentSaved = plan[0].saved;

    const updated = await sql`
      UPDATE saved_trip_plans
      SET saved = ${!currentSaved}
      WHERE id = ${plan_id}
        AND user_id = ${user_id}
      RETURNING saved
    `;

    res.status(200).json({
      saved: updated[0].saved,
      message: updated[0].saved
        ? "Trip plan saved"
        : "Trip plan unsaved",
    });

  } catch (err) {
    console.error("Toggle save trip plan error:", err);
    res.status(500).json({
      message: "Failed to toggle save trip plan",
    });
  }
}

export async function unConfirmTripPlan(req, res) {
  const { plan_id } = req.body;
  const firebaseUid = req.headers["firebase-uid"];

  if (!plan_id || !firebaseUid) {
    return res.status(400).json({
      message: "plan_id and firebase-uid are required",
    });
  }

  try {
    const user = await sql`
      SELECT id FROM users
      WHERE firebase_uid = ${firebaseUid}
      LIMIT 1
    `;

    if (user.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const userId = user[0].id;

    const plan = await sql`
      SELECT id, confirmed
      FROM saved_trip_plans
      WHERE id = ${plan_id}
      AND user_id = ${userId}
    `;

    if (plan.length === 0) {
      return res.status(404).json({
        message: "Trip plan not found",
      });
    }

    const currentConfirmed = plan[0].confirmed;

    const updated = await sql`
      UPDATE saved_trip_plans
      SET confirmed = ${!currentConfirmed}
      WHERE id = ${plan_id}
      AND user_id = ${userId}
      RETURNING confirmed
    `;

    res.status(200).json({
      confirmed: updated[0].confirmed,
    });

  } catch (err) {
  console.error("FULL ERROR:", err);
  res.status(500).json({
    message: err.message,
  });
}
}
