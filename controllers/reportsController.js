import { sql } from "../config/db.js";

/* SurveyRelatedReports */
export async function getSurveyReports(req, res) {
  try {
    const report = (await sql`
      SELECT answered_surveys, finished_trips, main_problem
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    res.json({
      answered: report.answered_surveys,
      finished: report.finished_trips,
      problems: report.main_problem
    });
  } catch (err) {
    console.error("Survey report error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/* TripRelatedReports (USES cities & trip_types) */
export async function getTripReports(req, res) {
  try {
    // Members distribution
    const report = (await sql`
      SELECT members
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    // Cities popularity
    const citiesRows = await sql`
      SELECT id, name, number_of_triggers
      FROM cities
      ORDER BY number_of_triggers DESC
    `;

    // Trip types popularity
    const tripTypesRows = await sql`
      SELECT id, name, number_of_triggers
      FROM trip_types
      ORDER BY number_of_triggers DESC
    `;

    res.json({
      travelerTypes: report.members,

      destinations: citiesRows.map(c => ({
        id: c.id,
        label: c.name,
        value: c.number_of_triggers
      })),

      tripTypes: tripTypesRows.map(t => ({
        id: t.id,
        label: t.name,
        value: t.number_of_triggers
      }))
    });
  } catch (err) {
    console.error("Trip report error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/* SystemGrowthReports */
export async function getSystemGrowth(req, res) {
  try {
    const monthly = await sql`
      SELECT
        TO_CHAR(created_at, 'Mon') AS label,
        COUNT(*)::int AS value,
        DATE_TRUNC('month', created_at) AS order_date
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY label, order_date
      ORDER BY order_date
    `;

    const totalUsers = (await sql`
      SELECT COUNT(*)::int AS total FROM users
    `)[0].total;

    const lastYearUsers = (await sql`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE created_at >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'
        AND created_at < DATE_TRUNC('year', CURRENT_DATE)
    `)[0].total;

    const lastMonthUsers = (await sql`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
        AND created_at < DATE_TRUNC('month', CURRENT_DATE)
    `)[0].total;

    res.json({
      growth: monthly.map(r => ({ label: r.label, value: r.value })),
      totalUsers,
      lastYearUsers,
      lastMonthUsers
    });
  } catch (err) {
    console.error("System growth error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/* UsersActivityReports */
export async function getUsersActivity(req, res) {
  try {
    const rows = await sql`
      SELECT
        TO_CHAR(last_login, 'Mon') AS label,
        COUNT(*)::int AS value,
        DATE_TRUNC('month', last_login) AS order_date
      FROM users
      WHERE last_login >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY label, order_date
      ORDER BY order_date
    `;

    res.json(rows.map(r => ({
      label: r.label,
      value: r.value
    })));
  } catch (err) {
    console.error("Users activity error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/* After System Settings Update */
export async function updateReportAfterSystemSettingsUpdate(req, res) {
  try {
    const settings = (await sql`
      SELECT problem_types
      FROM system_settings
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    const prev = (await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    const syncArrayToJson = (oldJson = {}, arr = []) => {
      const obj = {};
      arr.forEach(v => {
        obj[v] = oldJson[v] ?? 0;
      });
      return obj;
    };

    await sql`
      INSERT INTO reports (
        members,
        main_problem,
        finished_trips,
        answered_surveys
      )
      VALUES (
        ${prev.members},
        ${syncArrayToJson(prev.main_problem, settings.problem_types)},
        ${prev.finished_trips},
        ${prev.answered_surveys}
      )
    `;

    res.json({ message: "New report created successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create report" });
  }
}

/* After Survey Submission */
export async function updateReportAfterSurvey(req, res) {
  try {
    const answered = req.body.answered ?? false;
    const finished = req.body.finished ?? false;
    const problems = req.body.problems ?? [];

    const report = (await sql`
      SELECT *
      FROM reports
      ORDER BY created_at DESC
      LIMIT 1
    `)[0];

    const answeredSurveys = { ...report.answered_surveys };
    const finishedTrips = { ...report.finished_trips };
    const mainProblem = { ...report.main_problem };

    answeredSurveys[answered ? "yes" : "no"] =
      (answeredSurveys[answered ? "yes" : "no"] || 0) + 1;

    if (answered) {
      finishedTrips[finished ? "yes" : "no"] =
        (finishedTrips[finished ? "yes" : "no"] || 0) + 1;

      problems.forEach(p => {
        mainProblem[p] = (mainProblem[p] || 0) + 1;
      });
    }

    await sql`
      UPDATE reports
      SET
        answered_surveys = ${answeredSurveys},
        finished_trips = ${finishedTrips},
        main_problem = ${mainProblem}
      WHERE report_id = ${report.report_id}
    `;

    res.json({ message: "Report updated after survey" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update survey report" });
  }
}


import { sql } from "../config/db.js";

/* After Trip Form Submission */
export async function updateReportAfterSubmittingTripForm(req, res) {
  try {
    // ===== MEMBERS =====
    let members = req.body.members;
    if (typeof members === "string") {
      members = JSON.parse(members);
    }
    if (!members || typeof members !== "object") {
      members = {};
    }

    // ===== CITY ID (TEXT) =====
    const cityId = req.body.cityId;

    // 1. Get latest report
    const report = (await sql`
      SELECT report_id, members
      FROM reports
      ORDER BY report_id DESC
      LIMIT 1
    `)[0];

    if (!report) {
      return res.status(404).json({ message: "No report found" });
    }

    // 2. Update members
    const updatedMembers = { ...(report.members || {}) };

    for (const key in members) {
      updatedMembers[key] =
        (updatedMembers[key] || 0) + Number(members[key]);
    }

    await sql`
      UPDATE reports
      SET members = ${updatedMembers}
      WHERE report_id = ${report.report_id}
    `;

    // 3. Update city trigger (TEXT id)
    if (cityId) {
      const cityUpdate = await sql`
        UPDATE cities
        SET number_of_triggers = number_of_triggers + 1
        WHERE id = ${cityId}
        RETURNING id, name, number_of_triggers;
      `;

      if (cityUpdate.length === 0) {
        return res.status(404).json({
          message: "City not found",
          members: updatedMembers
        });
      }

      return res.json({
        message: "Members and city trigger updated successfully",
        members: updatedMembers,
        city: cityUpdate[0]
      });
    }

    // If no cityId provided
    res.json({
      message: "Members updated successfully",
      members: updatedMembers
    });

  } catch (err) {
    console.error("Trip form update error:", err);
    res.status(500).json({ message: "Failed to update trip form data" });
  }
}
