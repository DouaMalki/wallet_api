import { sql } from "../config/db.js";

// SurveyRelatedReports controller
export async function getSurveyReports(req, res) {
  try {
    const result = await sql`
      SELECT answered_surveys, finished_trips, main_problem
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const report = result[0];

    res.json({
      answered: report.answered_surveys,
      finished: report.finished_trips,
      problems: report.main_problem
    });
  } catch (err) {
    console.log("Internal server error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// TripRelatedReports controller
export async function getTripReports(req, res) {
  try {
    const result = await sql`
      SELECT members, visited_destinations, trip_type
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const report = result[0];

    res.json({
      travelerTypes: report.members,
      destinations: report.visited_destinations,
      tripTypes: report.trip_type
    });
  } catch (err) {
    console.log("Trip report error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// SystemGrowthReports controller
export async function getSystemGrowth(req, res) {
  try {
    const result = await sql`
      SELECT
        TO_CHAR(created_at, 'Mon') AS label,
        COUNT(*)::int AS value,
        DATE_TRUNC('month', created_at) AS order_date
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY label, order_date
      ORDER BY order_date
    `;

    res.json(result.map(r => ({
      label: r.label,
      value: r.value
    })));
  } catch (err) {
    console.log("System growth error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// UsersActivityReports controller
export async function getUsersActivity(req, res) {
  try {
    const result = await sql`
      SELECT
        TO_CHAR(last_login, 'Mon') AS label,
        COUNT(*)::int AS value,
        DATE_TRUNC('month', last_login) AS order_date
      FROM users
      WHERE last_login >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY label, order_date
      ORDER BY order_date
    `;

    res.json(result.map(r => ({
      label: r.label,
      value: r.value
    })));
  } catch (err) {
    console.log("Users activity error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}



export async function getUsersLevelsSummary(req, res) {
  try {
    const result = await sql`
      SELECT level, COUNT(*)::int AS count
      FROM users
      GROUP BY level
    `;

    const summary = {};
    result.forEach(r => {
      summary[r.level] = r.count;
    });

    res.json(summary);
  } catch (err) {
    console.log("Levels summary error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
export async function getUsersByLevel(req, res) {
  try {
    const { level } = req.params;

    const users = await sql`
      SELECT
        user_id AS id,
        name,
        email,
        points,
        level
      FROM users
      WHERE level = ${level}
      ORDER BY points DESC
    `;

    res.json(users);
  } catch (err) {
    console.log("Users by level error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}