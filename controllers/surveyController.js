import { sql } from "../config/db.js";

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
        COALESCE(title, 'Untitled Trip') AS name,
        city_id,
        trip_type_slug
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
        l.id AS location_id,
        l.name,
        l.google_place_id,
        l.rating,
        l.user_ratings_total,
        i.position
      FROM saved_trip_plan_items i
      JOIN saved_trip_plan_days d
        ON d.id = i.plan_day_id
      JOIN locations l
        ON l.id = i.location_id
      WHERE d.plan_id = ${plan_id}
      ORDER BY i.position
    `;

    res.status(200).json(locations);
  } catch (err) {
    console.error("Get survey locations error:", err);
    res.status(500).json({
      message: "Failed to fetch survey locations",
    });
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
        title = ${title},
        updated_at = now()
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
