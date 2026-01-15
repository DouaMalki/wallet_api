import { sql } from "../config/db.js";

// Sign Up controller
export async function signUp(req, res) {
  const { firebase_uid, name, email } = req.body;
  if (!firebase_uid || !name || !email) {
    return res.status(400).json({
      message: "Missing required fields"
    });
  }

  try {
    const result = await sql`
      INSERT INTO users (
        firebase_uid,
        role,
        name,
        email
      )
      VALUES (
        ${firebase_uid},
        'user',
        ${name},
        ${email}
      )
      RETURNING *
    `;
    const user = result[0];
    res.status(201).json(user);
  } catch (err) {
    console.error("Sign up controller error:", err);
    res.status(500).json({
      message: "Sign up controller error"
    });
  }
}


// Login controller
export async function login(req, res) {
  const { firebase_uid } = req.body;
  if (!firebase_uid) {
    return res.status(400).json({
      message: "Missing firebase_uid",
    });
  }

  try {
    const result = await sql`
      SELECT *
      FROM users
      WHERE firebase_uid = ${firebase_uid}
    `;
    if (result.length === 0) {
      return res.status(404).json({
        message: "User not found in database",
      });
    }
    const user = result[0];
    res.json(user);
  } catch (err) {
    console.error("Login controller error:", err);
    res.status(500).json({
      message: "Login controller error",
    });
  }
}