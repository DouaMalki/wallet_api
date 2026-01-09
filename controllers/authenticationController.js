import { sql } from "../config/db.js";
import { getAuth } from "firebase-admin/auth";

/* =========================================================
   SIGN UP USER
   - Firebase is the source of truth
   - UID is extracted from verified ID token
========================================================= */
export async function signUpUser(req, res) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing or invalid auth token" });
    }

    const idToken = authHeader.split(" ")[1];

    // Verify Firebase token
    const decoded = await getAuth().verifyIdToken(idToken);

    const firebase_uid = decoded.uid;
    const email = decoded.email;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Insert user if not exists
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
      )`;

    // If user already exists, return existing user
    if (inserted.length === 0) {
      const existing = await sql`
        SELECT
          user_id,
          role,
          name,
          email,
          theme,
          language,
          points,
          level
        FROM users
        WHERE firebase_uid = ${firebase_uid}
      `;
      return res.json(existing[0]);
    }

    res.json(inserted[0]);
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Signup failed" });
  }
}

/* =========================================================
   LOGIN USER
   - Firebase token verification
   - Correct blocked-user handling
   - Correct RETURNING logic
========================================================= */
export async function loginUser(req, res) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing or invalid auth token" });
    }

    const idToken = authHeader.split(" ")[1];

    // Verify Firebase token
    const decoded = await getAuth().verifyIdToken(idToken);
    const firebase_uid = decoded.uid;

    // Unblock user if block expired
    await sql`
      UPDATE users
      SET
        is_blocked = false,
        blocked_until = NULL
      WHERE firebase_uid = ${firebase_uid}
        AND is_blocked = true
        AND blocked_until IS NOT NULL
        AND blocked_until < NOW()
    `;

    // Check block status
    const blockedCheck = await sql`
      SELECT is_blocked, blocked_until
      FROM users
      WHERE firebase_uid = ${firebase_uid}
    `;

    if (blockedCheck.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    if (blockedCheck[0].is_blocked) {
      return res.status(403).json({
        message: "User is temporarily blocked",
        blocked_until: blockedCheck[0].blocked_until,
      });
    }

    // Update last login and return user
    const updated = await sql`
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

    if (updated.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(updated[0]);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
}
