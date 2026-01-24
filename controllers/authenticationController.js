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
  const { firebase_uid, email, name } = req.body;

  if (!firebase_uid) {
    return res.status(400).json({ message: "Missing firebase_uid" });
  }

  // Check if user exists
  const users = await sql`
    SELECT *
    FROM users
    WHERE firebase_uid = ${firebase_uid}
  `;

  // First-time Google login, create user
  if (users.length === 0) {
    const newUser = await sql`
      INSERT INTO users (
        firebase_uid,
        name,
        email,
        role,
        created_at
      )
      VALUES (
        ${firebase_uid},
        ${name ?? "Google User"},
        ${email},
        'user',
        NOW()
      )
      RETURNING *
    `;

    return res.status(201).json(newUser[0]);
  }

  // Existing user
  return res.status(200).json(users[0]);
}