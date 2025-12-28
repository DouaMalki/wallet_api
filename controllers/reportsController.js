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

export async function updateReportsAfterSystemChange(req, res) {
  try {
    const {
      membersTypes,        // ['Children', 'Adults', ...]
      tripTypes,           // ['Historical', 'Entertainment']
      destinations,        // ['Nablus', 'Jerusalem']
      problemTypes         // ['Payment', 'Crashes']
    } = req.body;

    // 1. get latest report
    const latestResult = await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (latestResult.length === 0) {
      return res.status(400).json({ message: "No base report exists" });
    }

    const latest = latestResult[0];

    // 2. merge json fields
    const newMembers = mergeReportJSON(latest.members, membersTypes);
    const newTripTypes = mergeReportJSON(latest.trip_type, tripTypes);
    const newDestinations = mergeReportJSON(
      latest.visited_destinations,
      destinations
    );
    const newProblems = mergeReportJSON(
      latest.main_problem,
      problemTypes
    );

    // answered_surveys & finished_trips remain the same structure
    const answeredSurveys = latest.answered_surveys;
    const finishedTrips = latest.finished_trips;

    // 3. insert new report
    await sql`
      INSERT INTO reports (
        members,
        trip_type,
        visited_destinations,
        finished_trips,
        main_problem,
        answered_surveys
      )
      VALUES (
        ${newMembers}::jsonb,
        ${newTripTypes}::jsonb,
        ${newDestinations}::jsonb,
        ${finishedTrips}::jsonb,
        ${newProblems}::jsonb,
        ${answeredSurveys}::jsonb
      )
    `;

    res.status(201).json({
      message: "Report updated after system settings change"
    });

  } catch (err) {
    console.log("Update reports error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

function mergeReportJSON(oldData = {}, newKeys = []) {
  const merged = {};

  // keep existing values
  for (const key of newKeys) {
    merged[key] = oldData[key] ?? 0;
  }

  return merged;
}
