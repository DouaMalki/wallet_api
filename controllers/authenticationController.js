import { sql } from "../config/db.js";

export async function signUpUser(req, res) {
  try {
    const { firebase_uid, name, email } = req.body;

    if (!firebase_uid || !name || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Insert new user
    const inserted = await sql`
      INSERT INTO users (
        firebase_uid,
        role,
        name,
        email,
        last_login
      )
      VALUES (
        ${firebase_uid},
        'user',
        ${name},
        ${email},
        CURRENT_TIMESTAMP
      )
      RETURNING user_id, name, email, points, level
    `;
    res.json(inserted[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Signup failed" });
  }
}

export async function loginUser(req, res) {
  try {
    const { firebase_uid } = req.body;

    if (!firebase_uid) {
      return res.status(400).json({ message: "Missing firebase UID" });
    }

    const result = await sql`
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP
      WHERE firebase_uid = ${firebase_uid}
      RETURNING
        user_id,
        role,
        name,
        email,
        theme,
        language,
        points,
        level,
        is_blocked,
        blocked_until
    `;
    if (result.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result[0]);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
}