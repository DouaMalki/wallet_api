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

    // JSONB ARRAY
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