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
