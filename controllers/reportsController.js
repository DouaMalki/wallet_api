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






// Create a new report after updating the system settings
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


// Update the latest report after answering or non answering a survey
export async function updateReportAfterSurvey(req, res) {
  try {
    const answered = req.body.answered ?? (req.query.answered === "true");
    const finished = req.body.finished ?? (req.query.finished === "true");
    const problems =
      req.body.problems ??
      (req.query.problems ? req.query.problems.split(",") : []);


    // Get the latest report
    const report = (await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];
    // Copy JSON fields
    const updatedAnswered = { ...report.answered_surveys };
    const updatedFinished = { ...report.finished_trips };
    const updatedProblems = { ...report.main_problem };

    // Update answered surveys
    updatedAnswered[answered ? "yes" : "no"] =
      (updatedAnswered[answered ? "yes" : "no"] || 0) + 1;
    // Update finished trips (ONLY if survey answered)
    if(answered)
    {
      updatedFinished[finished ? "yes" : "no"] =
      (updatedFinished[finished ? "yes" : "no"] || 0) + 1;
    }
    // Update problems (ONLY if survey answered)
    if (answered) {
      problems.forEach(p => {
        updatedProblems[p] = (updatedProblems[p] || 0) + 1;
      });
    }

    // Save updates
    await sql`
      UPDATE reports
      SET
        answered_surveys = ${updatedAnswered},
        finished_trips = ${updatedFinished},
        main_problem = ${updatedProblems}
      WHERE report_id = ${report.report_id}
    `;
    res.json({ message: "Report updated after survey submission" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update report" });
  }
}


// Update the latest report after submitting a trip form
export async function updateReportAfterSubmittingTripForm(req, res) {
  try {
    
    const members =
      req.body.members ||
      (req.query.members ? JSON.parse(req.query.members) : {});
    const trip_type =
      req.body.trip_type || req.query.trip_type;
    const destinations =
      req.body.destinations ||
      (req.query.destinations
        ? req.query.destinations.split(",")
        : []);

    // Get the latest report
    const report = (await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];
    // Clone JSONB fields
    const updatedMembers = { ...report.members };
    const updatedTripTypes = { ...report.trip_type };
    const updatedDestinations = { ...report.visited_destinations };

    // Update members
    for (const type in members) {
      updatedMembers[type] =
        (updatedMembers[type] || 0) + Number(members[type]);
    }
    // Update trip types
    updatedTripTypes[trip_type] =
      (updatedTripTypes[trip_type] || 0) + 1;
    // Update destinations
    destinations.forEach(dest => {
      updatedDestinations[dest] =
        (updatedDestinations[dest] || 0) + 1;
    });

    // Save updates
    await sql`
      UPDATE reports
      SET
        members = ${updatedMembers},
        trip_type = ${updatedTripTypes},
        visited_destinations = ${updatedDestinations}
      WHERE report_id = ${report.report_id}
    `;
    res.json({ message: "Latest report updated after trip form" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update report" });
  }
}
