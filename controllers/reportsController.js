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
    // 1. Monthly growth (last 12 months)
    const monthlyResult = await sql`
      SELECT
        TO_CHAR(created_at, 'Mon') AS label,
        COUNT(*)::int AS value,
        DATE_TRUNC('month', created_at) AS order_date
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY label, order_date
      ORDER BY order_date
    `;

    // 2. Total users
    const totalUsersResult = await sql`
      SELECT COUNT(*)::int AS total
      FROM users
    `;

    // 3. Users registered last year
    const lastYearResult = await sql`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE created_at >= DATE_TRUNC('year', CURRENT_DATE)
        - INTERVAL '1 year'
        AND created_at < DATE_TRUNC('year', CURRENT_DATE)
    `;

    // 4. Users registered last month
    const lastMonthResult = await sql`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND created_at < DATE_TRUNC('month', CURRENT_DATE)
    `;

    res.json({
      growth: monthlyResult.map(r => ({
        label: r.label,
        value: r.value
      })),
      totalUsers: totalUsersResult[0].total,
      lastYearUsers: lastYearResult[0].total,
      lastMonthUsers: lastMonthResult[0].total
    });

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


// UsersLevelsReports controller
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




export async function updateReportAfterSystemSettingsUpdate(req, res) {
  try {
    // Get the latest system settings
    const settings = (await sql`
      SELECT *
      FROM system_settings
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];
    // Get the latest report
    const previousReport = (await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    // Sync function
    const syncJson = (oldJson = {}, settingsJson = {}) => {
      const result = {};
      for (const key of Object.keys(settingsJson)) {
        result[key] = oldJson[key] ?? 0;
      }
      return result;
    };

    // Insert a new report
    await sql`
      INSERT INTO reports (
        members,
        trip_type,
        visited_destinations,
        main_problem,
        finished_trips,
        answered_surveys
      )
      VALUES (
        ${syncJson(previousReport.members, settings.member_types)},
        ${syncJson(previousReport.trip_type, settings.trip_types)},
        ${syncJson(previousReport.visited_destinations, settings.destinations)},
        ${syncJson(previousReport.main_problem, settings.problem_types)},
        ${previousReport.finished_trips},
        ${previousReport.answered_surveys}
      )
    `;

    res.json({ message: "New report created successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create report" });
  }
}