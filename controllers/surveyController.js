import { sql } from "../config/db.js";

/*
  Get trip plans for a given user_id where:
  - confirmed = TRUE
  - answered_survey = FALSE
  - trip already ended (end_date < today)
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
        COALESCE(title, 'Untitled Trip') AS name,
        city_id,
        trip_type_slug,
        title,
        start_date,
        end_date
      FROM saved_trip_plans
      WHERE user_id = ${user_id}
        AND confirmed = TRUE
        AND answered_survey = FALSE
        AND end_date < CURRENT_DATE
      ORDER BY end_date DESC
    `;

    res.status(200).json(result);

  } catch (err) {
    console.error("Get pending surveys error:", err);
    res.status(500).json({
      message: "Failed to fetch pending surveys",
    });
  }
}


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


/* Get the locations of a trip plan for survey (grouped by day) */
export async function getSurveyLocations(req, res) {
  const { plan_id } = req.body;

  if (!plan_id) {
    return res.status(400).json({ message: "Missing plan_id" });
  }

  try {
    const rows = await sql`
      SELECT
        d.id          AS day_id,
        d.day_key,

        l.id          AS location_id,
        l.name,
        l.rating,
        l.user_ratings_total,
        i.position,

        lp.photo_reference,
        lp.photo_url

      FROM saved_trip_plan_days d
      JOIN saved_trip_plan_items i
        ON i.plan_day_id = d.id
      JOIN locations l
        ON l.id = i.location_id

      LEFT JOIN LATERAL (
        SELECT photo_reference, photo_url
        FROM location_photos
        WHERE location_id = l.id
        ORDER BY is_primary DESC, created_at DESC
        LIMIT 1
      ) lp ON TRUE

      WHERE d.plan_id = ${plan_id}
      ORDER BY d.day_key, i.position
    `;

    /* Group by day */
    const daysMap = {};

    for (const row of rows) {
      if (!daysMap[row.day_id]) {
        daysMap[row.day_id] = {
          day_id: row.day_id,
          day_key: row.day_key,
          locations: [],
        };
      }

      daysMap[row.day_id].locations.push({
        location_id: row.location_id,
        name: row.name,
        rating: row.rating,
        user_ratings_total: row.user_ratings_total,
        position: row.position,
        photo_reference: row.photo_reference,
        photo_url: row.photo_url,
      });
    }

    res.status(200).json(Object.values(daysMap));
  } catch (err) {
    console.error("Get survey locations error:", err);
    res.status(500).json({ message: "Failed to fetch survey locations" });
  }
}


/*
  Update locations rating and user_rating_total
  Formula:
  new_rating = (user_rating_total * rating + given_rating)
  user_rating_total = (user_rating_total + 1)
*/
export async function updateLocationsRating(req, res) {
  const { locationRatings } = req.body;

  if (!locationRatings || typeof locationRatings !== "object") {
    return res.status(400).json({ message: "locationRatings is required" });
  }

  try {
    for (const locationId in locationRatings) {
      const givenRating = Number(locationRatings[locationId]);
      if (givenRating < 1 || givenRating > 5) continue;

      const result = await sql`
        SELECT
          COALESCE(rating, 0) AS rating,
          COALESCE(user_ratings_total, 0) AS user_ratings_total
        FROM locations
        WHERE id = ${locationId}
      `;

      if (result.length === 0) continue;

      const { rating, user_ratings_total } = result[0];

      const newRating = Number(
        (
          (user_ratings_total * rating + givenRating) /
          (user_ratings_total + 1)
        ).toFixed(2)
      );

      await sql`
        UPDATE locations
        SET
          rating = ${newRating},
          user_ratings_total = ${user_ratings_total + 1},
          updated_at = now()
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


export async function publishTripPlan(req, res) {
  const { plan_id, title } = req.body;

  if (!plan_id || !title) {
    return res.status(400).json({
      message: "plan_id and title are required",
    });
  }

  try {
    await sql`
      UPDATE saved_trip_plans
      SET
        published = true,
        title = ${title}
      WHERE id = ${plan_id}
    `;

    res.status(200).json({
      message: "Trip plan published successfully",
    });
  } catch (err) {
    console.error("Publish trip plan error:", err);
    res.status(500).json({
      message: "Failed to publish trip plan",
    });
  }
}


/* After Survey Submission */
/* Update Problems */
export async function updateProblemsInReports(req, res) {
  try {
    const problems = req.body.problems ?? [];

    const report = (await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    const mainProblem = { ...report.main_problem };
    problems.forEach(p => {
      mainProblem[p] = (mainProblem[p] || 0) + 1;
    });

    await sql`
      UPDATE reports
      SET
        main_problem = ${mainProblem}
      WHERE report_id = ${report.report_id}
    `;

    res.json({ message: "Report updated after survey" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update survey report" });
  }
}

/* Update Finished Trips */
export async function updateFinishedTrips(req, res) {
  const { tripCompleted } = req.body;

  if (typeof tripCompleted !== "boolean") {
    return res.status(400).json({
      message: "tripCompleted must be boolean",
    });
  }

  try {
    const report = (await sql`
      SELECT report_id, finished_trips
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    const finishedTrips = {
      ...report.finished_trips,
      [tripCompleted ? "yes" : "no"]:
        (report.finished_trips?.[tripCompleted ? "yes" : "no"] || 0) + 1,
    };

    await sql`
      UPDATE reports
      SET finished_trips = ${finishedTrips}
      WHERE report_id = ${report.report_id}
    `;

    res.json({ message: "finished_trips updated" });
  } catch (err) {
    console.error("Update finished_trips error:", err);
    res.status(500).json({ message: "Failed to update finished_trips" });
  }
}

/* Update Answered Surveys */
export async function updateAnsweredSurveys(req, res) {
  try {
    const report = (await sql`
      SELECT report_id, answered_surveys
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    const answeredSurveys = {
      ...report.answered_surveys,
      yes: (report.answered_surveys?.yes || 0) + 1,
    };

    await sql`
      UPDATE reports
      SET answered_surveys = ${answeredSurveys}
      WHERE report_id = ${report.report_id}
    `;

    res.json({ message: "answered_surveys updated" });
  } catch (err) {
    console.error("Update answered_surveys error:", err);
    res.status(500).json({ message: "Failed to update answered_surveys" });
  }
}

/* Mark survey as answered */
export async function markSurveyAsAnswered(req, res) {
  const { plan_id } = req.body;

  if (!plan_id) {
    return res.status(400).json({
      message: "Missing plan_id",
    });
  }

  try {
    await sql`
      UPDATE saved_trip_plans
      SET
        answered_survey = true
      WHERE id = ${plan_id}
    `;

    res.status(200).json({
      message: "Survey marked as answered",
    });
  } catch (err) {
    console.error("Mark survey answered error:", err);
    res.status(500).json({
      message: "Failed to mark survey as answered",
    });
  }
}


/*
  Compute initial trip rating (before publish)
  and insert it into trip_plan_ratings
*/
export async function computeTripRating(req, res) {
  const {
    plan_id,
    user_id,
    locationRatings = {}, 
    selectedProblems = []  
  } = req.body;

  if (!plan_id || !user_id) {
    return res.status(400).json({
      message: "Missing plan_id or user_id",
    });
  }

  const USER_WEIGHT = 0.6;
  const DB_WEIGHT = 0.4;
  const PROBLEM_PENALTY = 0.2;

  try {
    /* Get all locations in the trip */
    const locations = await sql`
      SELECT
        l.id,
        COALESCE(l.rating, 0) AS db_rating
      FROM saved_trip_plan_items i
      JOIN saved_trip_plan_days d
        ON d.id = i.plan_day_id
      JOIN locations l
        ON l.id = i.location_id
      WHERE d.plan_id = ${plan_id}
    `;

    if (locations.length === 0) {
      return res.status(400).json({
        message: "No locations found for this trip plan",
      });
    }

    /* Average DB rating */
    const avgDbRating =
      locations.reduce(
        (sum, loc) => sum + Number(loc.db_rating),
        0
      ) / locations.length;

    /* Average USER rating */
    let userRatingsSum = 0;
    let ratedCount = 0;

    for (const loc of locations) {
      if (locationRatings[loc.id] !== undefined) {
        userRatingsSum += Number(locationRatings[loc.id]);
        ratedCount++;
      }
    }
    const avgUserRating =
      ratedCount > 0 ? userRatingsSum / ratedCount : 0;

    /* Problems penalty */
    const penalty = selectedProblems.length * PROBLEM_PENALTY;

    /* Final rating */
    let finalRating =
      avgUserRating * USER_WEIGHT +
      avgDbRating * DB_WEIGHT -
      penalty;

    /* Clamp between 1 and 5 */
    finalRating = Math.max(1, Math.min(5, finalRating));

    /* trip_plan_ratings.rating is INTEGER */
    const finalRatingInt = Math.round(finalRating);

    /* Insert rating */
    const insertedRating = await sql`
      INSERT INTO trip_plan_ratings (
        plan_id,
        user_id,
        rating
      )
      VALUES (
        ${plan_id},
        ${user_id},
        ${finalRatingInt}
      )
      RETURNING *
    `;

    res.status(201).json({
      rating: insertedRating[0],
      computed_value: Number(finalRating.toFixed(2)),
    });

  } catch (err) {
    console.error("Compute trip rating error:", err);
    res.status(500).json({
      message: "Failed to compute trip rating",
    });
  }
}
