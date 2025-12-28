import { sql } from "../config/db.js";

export async function syncUserAfterFirebaseAuth(req, res) {
  try {
    const { firebase_uid, name, email } = req.body;
    if (!firebase_uid) {
      return res.status(400).json({ message: "Missing required field" });
    }

    // Update the last login date if the user exists
    const updated = await sql`
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP
      WHERE firebase_uid = ${firebase_uid}
      RETURNING user_id, name, email, points, level
    `;
    if (updated.length > 0) {
      return res.json(updated[0]);
    }

    // Insert the user if it is not exist
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
    res.status(500).json({ message: "failed" });
  }
}