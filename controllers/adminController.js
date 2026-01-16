import { sql } from "../config/db.js";

function mergeJson(current, changes) {
  const merged = { ...current };

  for (const key in changes) {
    if (changes[key] === null) {
      delete merged[key]; // remove
    } else {
      merged[key] = changes[key]; // add or update
    }
  }

  return merged;
}

// Admin: Add a new trip type
export async function addTripType(req, res) {
  try {
    const { slug, name, name_ar } = req.body;

    if (!slug || !name) {
      return res.status(400).json({
        message: "slug and name are required",
      });
    }

    const result = await sql`
      INSERT INTO trip_types (slug, name, name_ar)
      VALUES (${slug}, ${name}, ${name_ar})
      RETURNING id, slug, name, name_ar
    `;

    res.status(201).json({
      message: "Trip type added successfully",
      tripType: result[0],
    });
  } catch (err) {
    console.error("Add trip type error:", err);

    // Handle unique slug error nicely
    if (err.code === "23505") {
      return res.status(409).json({
        message: "Trip type with this slug already exists",
      });
    }

    res.status(500).json({ message: "Internal server error" });
  }
}

// Admin: Remove a trip type
export async function deleteTripType(req, res) {
  try {
    const { id } = req.params;

    const result = await sql`
      DELETE FROM trip_types
      WHERE id = ${id}
      RETURNING id, slug, name
    `;

    if (result.length === 0) {
      return res.status(404).json({
        message: "Trip type not found",
      });
    }

    res.json({
      message: "Trip type deleted successfully",
      deletedTripType: result[0],
    });
  } catch (err) {
    console.error("Delete trip type error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Get all trip types (used by trip plan form)
export async function getAllTripTypes(req, res) {
  try {
    const tripTypes = await sql`
      SELECT
        id,
        slug,
        name,
        name_ar
      FROM trip_types
      ORDER BY created_at ASC
    `;

    res.json(tripTypes);
  } catch (err) {
    console.error("Get trip types error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Admin: Add a problem type (stored in system_settings.problem_types JSON)
export async function addProblemType(req, res) {
  try {
    const { key, name_ar } = req.body;

    if (!key) {
      return res.status(400).json({ message: "key is required" });
    }

    const latest = await sql`
      SELECT *
      FROM system_settings
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (latest.length === 0) {
      return res.status(400).json({ message: "System settings not initialized" });
    }

    const current = latest[0];

    const changes = {
      [key]: { label: key, name_ar: name_ar || null }, // you can store any structure you want
    };

    const newProblemTypes = mergeJson(current.problem_types, changes);

    // If no actual changes
    if (JSON.stringify(newProblemTypes) === JSON.stringify(current.problem_types)) {
      return res.json({ message: "No changes detected" });
    }

    const result = await sql`
      INSERT INTO system_settings (
        member_types,
        trip_types,
        problem_types,
        destinations,
        max_trips_per_minute,
        max_locations_per_day
      )
      VALUES (
        ${current.member_types},
        ${current.trip_types},
        ${newProblemTypes},
        ${current.destinations},
        ${current.max_trips_per_minute},
        ${current.max_locations_per_day}
      )
      RETURNING *
    `;

    res.status(201).json({
      message: "Problem type added",
      settings: result[0],
    });
  } catch (err) {
    console.error("Add problem type error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Admin: Delete a problem type by key (stored in system_settings.problem_types JSON)
export async function deleteProblemType(req, res) {
  try {
    const { key } = req.params;

    const latest = await sql`
      SELECT *
      FROM system_settings
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (latest.length === 0) {
      return res.status(400).json({ message: "System settings not initialized" });
    }

    const current = latest[0];

    const changes = { [key]: null }; // mergeJson will remove it
    const newProblemTypes = mergeJson(current.problem_types, changes);

    if (JSON.stringify(newProblemTypes) === JSON.stringify(current.problem_types)) {
      return res.json({ message: "No changes detected" });
    }

    const result = await sql`
      INSERT INTO system_settings (
        member_types,
        trip_types,
        problem_types,
        destinations,
        max_trips_per_minute,
        max_locations_per_day
      )
      VALUES (
        ${current.member_types},
        ${current.trip_types},
        ${newProblemTypes},
        ${current.destinations},
        ${current.max_trips_per_minute},
        ${current.max_locations_per_day}
      )
      RETURNING *
    `;

    res.json({
      message: "Problem type deleted",
      settings: result[0],
    });
  } catch (err) {
    console.error("Delete problem type error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Get the Problem Types
export async function getProblemTypes(req, res) {
  try {
    const result = await sql`
      SELECT problem_types
      FROM system_settings
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return res.json({});
    }

    res.json(result[0].problem_types);
  } catch (err) {
    console.error("Get problem types error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}


// Update the 2 system limits
export async function updateSystemLimits(req, res) {
  try {
    const { max_trips_per_minute, max_locations_per_day } = req.body;

    const latest = await sql`
      SELECT *
      FROM system_settings
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (latest.length === 0) {
      return res.status(400).json({ message: "System settings not initialized" });
    }

    const current = latest[0];

    const newMaxTrips =
      max_trips_per_minute !== undefined && max_trips_per_minute !== null
        ? Number(max_trips_per_minute)
        : current.max_trips_per_minute;

    const newMaxLocations =
      max_locations_per_day !== undefined && max_locations_per_day !== null
        ? Number(max_locations_per_day)
        : current.max_locations_per_day;

    const hasChanges =
      newMaxTrips !== current.max_trips_per_minute ||
      newMaxLocations !== current.max_locations_per_day;

    if (!hasChanges) {
      return res.json({ message: "No changes detected" });
    }

    const result = await sql`
      INSERT INTO system_settings (
        member_types,
        trip_types,
        problem_types,
        destinations,
        max_trips_per_minute,
        max_locations_per_day
      )
      VALUES (
        ${current.member_types},
        ${current.trip_types},
        ${current.problem_types},
        ${current.destinations},
        ${newMaxTrips},
        ${newMaxLocations}
      )
      RETURNING *
    `;

    res.status(201).json({
      message: "System limits updated",
      settings: result[0],
    });
  } catch (err) {
    console.error("Update system limits error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}



// // Admin: Add a new location
// export async function addLocation(req, res) {
//   try {
//     const {
//       city_id,
//       name,
//       category,
//       google_place_id,
//       lat,
//       lng,
//       estimated_time,
//       max_cost,
//       rating,
//       open_hours = {},
//       closed_days = [],
//       recommended_for = [],
//     } = req.body;

//     if (!city_id || !name || !category) {
//       return res.status(400).json({
//         message: "city_id, name, and category are required",
//       });
//     }

//     const result = await sql`
//       INSERT INTO locations (
//         city_id,
//         name,
//         category,
//         google_place_id,
//         lat,
//         lng,
//         estimated_time,
//         max_cost,
//         rating,
//         open_hours,
//         closed_days,
//         recommended_for
//       )
//       VALUES (
//         ${city_id},
//         ${name},
//         ${category},
//         ${google_place_id},
//         ${lat},
//         ${lng},
//         ${estimated_time},
//         ${max_cost},
//         ${rating},
//         ${open_hours},
//         ${closed_days},
//         ${recommended_for}
//       )
//       RETURNING *
//     `;

//     res.status(201).json({
//       message: "Location added successfully",
//       location: result[0],
//     });
//   } catch (err) {
//     console.error("Add location error:", err);

//     if (err.code === "23505") {
//       return res.status(409).json({
//         message: "Location with this Google Place ID already exists",
//       });
//     }

//     res.status(500).json({ message: "Internal server error" });
//   }
// }

// // Admin: Delete a location
// export async function deleteLocation(req, res) {
//   try {
//     const { id } = req.params;

//     const result = await sql`
//       DELETE FROM locations
//       WHERE id = ${id}
//       RETURNING id, name
//     `;

//     if (result.length === 0) {
//       return res.status(404).json({
//         message: "Location not found",
//       });
//     }

//     res.json({
//       message: "Location deleted successfully",
//       deletedLocation: result[0],
//     });
//   } catch (err) {
//     console.error("Delete location error:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// }

// // Admin: Get all locations
// export async function getAllLocations(req, res) {
//   try {
//     const locations = await sql`
//       SELECT
//         id,
//         city_id,
//         name,
//         category,
//         google_place_id,
//         lat,
//         lng,
//         estimated_time,
//         max_cost,
//         rating,
//         open_hours,
//         closed_days,
//         recommended_for,
//         created_at
//       FROM locations
//       ORDER BY created_at DESC
//     `;

//     res.json(locations);
//   } catch (err) {
//     console.error("Get locations error:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// }
