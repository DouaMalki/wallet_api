import { sql } from "../config/db.js";

export async function getProblemTypes(req, res) {
  try {
    const result = await sql`
      SELECT problem_types
      FROM system_settings
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (result.length === 0) {
      return res.status(404).json({
        message: "System settings not found",
      });
    }
    const problemTypes = result[0].problem_types;

    if (!Array.isArray(problemTypes)) {
      return res.status(400).json({
        message: "problem_types must be an array",
      });
    }
    const problems = problemTypes.map((item) => ({
      id: item,
      label: item.replace(/_/g, " "),
    }));
    return res.status(200).json(problems);
  } catch (err) {
    console.error("Get problem types error:", err);
    return res.status(500).json({
      message: "Failed to fetch problem types",
    });
  }
}

/* Get the trip plans for the given user_id where
   - answered_survey = FALSE
   - saved = TRUE
*/
export async function getPendingSurveys(req, res) {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({
      message: "Missing required field: user_id",
    });
  }

  try {
    const result = await sql`
      SELECT
        id,
        COALESCE(title, 'Untitled Trip') AS name
      FROM saved_trip_plans
      WHERE user_id = ${user_id}
        AND saved = true
        AND answered_survey = false
      ORDER BY created_at DESC
    `;

    res.status(200).json(result);

  } catch (err) {
    console.error("Get pending surveys error:", err);
    res.status(500).json({
      message: "Failed to fetch pending surveys",
    });
  }
}


/* Get the locations of a trip plan for survey */
export async function getSurveyLocations(req, res) {
  const { plan_id } = req.body;

  if (!plan_id) {
    return res.status(400).json({
      message: "Missing plan_id",
    });
  }

  try {
    const locations = await sql`
      SELECT
        l.id            AS location_id,
        l.name          AS name,
        l.google_place_id,
        l.rating,
        l.user_rating_total,
        i.position
      FROM saved_trip_plan_days d
      JOIN saved_trip_plan_items i
        ON i.plan_day_id = d.id
      JOIN locations l
        ON l.id = i.location_id
      WHERE d.plan_id = ${plan_id}
      ORDER BY d.day_key, i.position
    `;

    res.json(locations);
  } catch (err) {
    console.error("Get survey locations error:", err);
    res.status(500).json({
      message: "Failed to fetch survey locations",
    });
  }
}

import { sql } from "../config/db.js";

import { sql } from "../config/db.js";

/*
  Update locations rating and user_rating_total
  Formula:
  new_rating = (user_rating_total * rating + given_rating)
  user_rating_total = (user_rating_total + 1)
*/
export async function updateLocationsRating(req, res) {
  const { locationRatings } = req.body;

  if (
    !locationRatings ||
    typeof locationRatings !== "object" ||
    Object.keys(locationRatings).length === 0
  ) {
    return res.status(400).json({
      message: "locationRatings is required",
    });
  }

  try {
    for (const locationId in locationRatings) {
      const givenRating = Number(locationRatings[locationId]);

      if (givenRating < 1 || givenRating > 5) continue;

      /* Get current rating data */
      const result = await sql`
        SELECT rating, user_rating_total
        FROM locations
        WHERE id = ${locationId}
      `;

      if (result.length === 0) continue;

      const { rating, user_rating_total } = result[0];

      const newRating =
        (user_rating_total * rating + givenRating) /
        (user_rating_total + 1);

      /* Update location */
      await sql`
        UPDATE locations
        SET
          rating = ${newRating},
          user_rating_total = user_rating_total + 1
        WHERE id = ${locationId}
      `;
    }

    res.status(200).json({
      message: "Locations ratings updated successfully",
    });

  } catch (err) {
    console.error("Update location rating error:", err);
    res.status(500).json({
      message: "Failed to update locations rating",
    });
  }
}
