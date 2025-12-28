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





// after user submits trip form
export async function updateReportsAfterTripSubmit(req, res) {
  try {
    const {
      members,
      tripType,
      destination
    } = req.body;

    // 1. get latest report
    const result = await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    console.log("reports data got...");

    if (result.length === 0) {
      return res.status(400).json({ message: "No report exists" });
    }
    const report = result[0];

    // 2. clone JSON fields
    const updatedMembers = { ...report.members };
    const updatedTripTypes = { ...report.trip_type };
    const updatedDestinations = { ...report.visited_destinations };

    // 3. update members
    for (const [key, value] of Object.entries(members)) {
      updatedMembers[key] = (updatedMembers[key] ?? 0) + value;
    }
    console.log("members updated...");
    // 4. update trip type
    if (tripType) {
      updatedTripTypes[tripType] =
        (updatedTripTypes[tripType] ?? 0) + 1;
    }
    console.log("trip types updated...");
    // 5. update destination
    if (destination) {
      updatedDestinations[destination] =
        (updatedDestinations[destination] ?? 0) + 1;
    }
    console.log("trip destinations updated...");
    
    // 6. update report
    await sql`
      UPDATE reports
      SET
        members = ${updatedMembers}::jsonb,
        trip_type = ${updatedTripTypes}::jsonb,
        visited_destinations = ${updatedDestinations}::jsonb
      WHERE report_id = ${report.report_id}
    `;
    console.log("a new report created...");
    res.status(200).json({
      message: "Report updated after trip submission"
    });

  } catch (error) {
    console.log("Trip submit report error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}



// after admin updates system settings
export async function createReportAfterSystemSettingsUpdate(req, res) {
  try {
    const {
      member_types,
      trip_types,
      problem_types,
      destinations
    } = req.body;

    // helper: convert keys to 0
    const initZeroObject = (obj) =>
      Object.keys(obj).reduce((acc, key) => {
        acc[key] = 0;
        return acc;
      }, {});

    const newMembers = initZeroObject(member_types);
    const newTripTypes = initZeroObject(trip_types);
    const newProblems = initZeroObject(problem_types);
    const newDestinations = initZeroObject(destinations);

    const finishedTrips = { yes: 0, no: 0 };
    const answeredSurveys = { yes: 0, no: 0 };
    const tripsBudget = { less: 0, equal: 0, more: 0 };

    await sql`
      INSERT INTO reports (
        members,
        trip_type,
        visited_destinations,
        finished_trips,
        main_problem,
        trips_budget,
        answered_surveys
      )
      VALUES (
        ${newMembers}::jsonb,
        ${newTripTypes}::jsonb,
        ${newDestinations}::jsonb,
        ${finishedTrips}::jsonb,
        ${newProblems}::jsonb,
        ${tripsBudget}::jsonb,
        ${answeredSurveys}::jsonb
      )
    `;

    res.status(201).json({
      message: "New report created after system settings update"
    });

  } catch (error) {
    console.log("System settings report error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}






// after user submits post trip survey
export async function updateReportsAfterSurveySubmit(req, res) {
  try {
    const {
      finished,     
      main_problems      
    } = req.body;

    // 1. get latest report
    const result = await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return res.status(400).json({ message: "No report exists" });
    }

    const report = result[0];

    // 2. clone JSON fields
    const updatedAnswered = { ...report.answered_surveys };
    const updatedFinished = { ...report.finished_trips };
    const updatedProblems = { ...report.main_problem };

    // 3. answered surveys (every survey submission = answered yes)
    updatedAnswered.yes = (updatedAnswered.yes ?? 0) + 1;

    // 4. finished trips
    if (finished === "yes") {
      updatedFinished.yes = (updatedFinished.yes ?? 0) + 1;
    } else {
      updatedFinished.no = (updatedFinished.no ?? 0) + 1;
    }

    // 5. main problems (checkboxes)
    if (Array.isArray(main_problems)) {
      main_problems.forEach(problem => {
        updatedProblems[problem] =
          (updatedProblems[problem] ?? 0) + 1;
      });
    }

    // 6. update report
    await sql`
      UPDATE reports
      SET
        answered_surveys = ${updatedAnswered}::jsonb,
        finished_trips = ${updatedFinished}::jsonb,
        main_problem = ${updatedProblems}::jsonb
      WHERE report_id = ${report.report_id}
    `;

    res.status(200).json({
      message: "Report updated after survey submission"
    });

  } catch (error) {
    console.log("Survey submit report error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}