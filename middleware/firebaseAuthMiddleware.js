import { sql } from "../config/db.js";

export async function requireAuth(req, res, next) {
  try {
    const firebaseUid = req.headers["firebase-uid"] || req.body.firebase_uid;

    // Not logged in / not registered in app session
    if (!firebaseUid) {
      return res.status(401).json({
        message: "You need to have an account to be able to save locations.",
      });
    }

    const result = await sql`
      SELECT user_id, name, email, role
      FROM users
      WHERE firebase_uid = ${firebaseUid}
      LIMIT 1
    `;

    // Firebase UID not found in DB (not registered)
    if (result.length === 0) {
      return res.status(401).json({
        message: "You need to have an account to be able to save locations.",
      });
    }

    req.user = result[0];
    req.userId = result[0].user_id;

    next();
  } catch (err) {
    console.error("requireAuth error:", err);
    return res.status(500).json({ message: "Auth middleware error" });
  }
}
