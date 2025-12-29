import { sql } from "../config/db.js";

// Get all users (name + email)
export async function getAllUsers(req, res) {
  try {
    const users = await sql`
      SELECT
        user_id AS id,
        name,
        email
      FROM users
      ORDER BY created_at DESC
    `;

    res.json(users);
  } catch (err) {
    console.log("Get users error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Get single user by ID (optional but useful)
export async function getUserById(req, res) {
  try {
    const { id } = req.params;

    const result = await sql`
      SELECT
        user_id AS id,
        name,
        email
      FROM users
      WHERE user_id = ${id}
    `;

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.log("Get user by ID error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Get users who created 5 or more trips in the last 60 seconds
export async function getUsersWithHighTripCreation(req, res) {
  try {
    const users = await sql`
      SELECT
        u.user_id AS id,
        u.name,
        u.email,
        COUNT(tp.trip_plan_id) AS trips_created
      FROM users u
      LEFT JOIN trip_plan tp
        ON u.user_id = tp.user_id
      WHERE tp.creation_date >= NOW() - INTERVAL '60 seconds'
      GROUP BY u.user_id, u.name, u.email
      HAVING COUNT(tp.trip_plan_id) >= 5
      ORDER BY trips_created DESC
    `;

    res.json(users);
  } catch (err) {
    console.log("High trip creation users error", err.message);
    res.status(500).json({ message: err.message });
  }
}

// Block user for a number of days (default: 2 days)
export async function blockUser(req, res) {
  try {
    const { id } = req.params;
    const { days = 2 } = req.body; // optional, defaults to 2 days

    const result = await sql`
      UPDATE users
      SET
        is_blocked = true,
        blocked_until = NOW() + (${days} || ' days')::INTERVAL
      WHERE user_id = ${id}
      RETURNING user_id, is_blocked, blocked_until
    `;

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: `User blocked for ${days} day(s)`,
      user: result[0],
    });
  } catch (err) {
    console.log("Block user error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}


// Delete user by ID (and their trip plans)
export async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    // First delete user's trip plans
    await sql`
      DELETE FROM trip_plan
      WHERE user_id = ${id}
    `;

    // Then delete the user
    const result = await sql`
      DELETE FROM users
      WHERE user_id = ${id}
      RETURNING user_id
    `;

    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.log("Delete user error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}


