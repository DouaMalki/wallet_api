// controllers/systemSettingsController.js
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

    // Convert JSONB object → array
    // { crash:0, other:0 } → [{id:"crash", label:"crash"}]
    const problems = Object.keys(problemTypes).map((key) => ({
      id: key,
      label: key.replace(/_/g, " "),
    }));

    res.json(problems);

  } catch (err) {
    console.error("Get problem types error:", err);
    res.status(500).json({
      message: "Failed to fetch problem types",
    });
  }
}

