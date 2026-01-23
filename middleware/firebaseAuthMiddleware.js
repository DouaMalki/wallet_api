// import { sql } from "../config/db.js";

// export async function requireAuth(req, res, next) {
//   try {
//     const firebaseUid = req.headers["firebase-uid"] || req.body.firebase_uid;

//     // Not logged in / not registered in app session
//     if (!firebaseUid) {
//       return res.status(401).json({
//         message: "You need to have an account to be able to save locations.",
//       });
//     }

//     const result = await sql`
//       SELECT user_id, name, email, role
//       FROM users
//       WHERE firebase_uid = ${firebaseUid}
//       LIMIT 1
//     `;

//     // Firebase UID not found in DB (not registered)
//     if (result.length === 0) {
//       return res.status(401).json({
//         message: "You need to have an account to be able to save locations.",
//       });
//     }

//     req.user = result[0];
//     req.userId = result[0].user_id;

//     next();
//   } catch (err) {
//     console.error("requireAuth error:", err);
//     return res.status(500).json({ message: "Auth middleware error" });
//   }
// }


import { sql } from "../config/db.js";

export async function requireAuth(req, res, next) {
  try {
    const firebaseUid = req.headers["firebase-uid"] || req.body.firebase_uid || null;
    const userIdHeader = req.headers["user-id"] || null;

    // لازم يكون في واحد على الأقل
    if (!firebaseUid && !userIdHeader) {
      return res.status(401).json({
        message: "You need to login first.",
      });
    }

    // ✅ إذا وصل user-id: جيبي المستخدم من DB حسب user_id
    if (userIdHeader) {
      const userId = String(userIdHeader);

      const rows = await sql`
        SELECT user_id, name, email, role, firebase_uid
        FROM users
        WHERE user_id = ${userId}
        LIMIT 1
      `;

      if (!rows?.length) {
        return res.status(401).json({ message: "Invalid user-id." });
      }

      // ✅ لو وصل firebase-uid كمان: لازم يطابق اللي بالـ DB
      if (firebaseUid && rows[0].firebase_uid && String(rows[0].firebase_uid) !== String(firebaseUid)) {
        return res.status(401).json({ message: "Auth mismatch." });
      }

      req.user = rows[0];
      req.userId = rows[0].user_id; // ✅ هسا فعليًا اعتمدتي userId
      return next();
    }

    // ✅ fallback: السلوك القديم (firebase_uid فقط)
    const result = await sql`
      SELECT user_id, name, email, role, firebase_uid
      FROM users
      WHERE firebase_uid = ${String(firebaseUid)}
      LIMIT 1
    `;

    if (!result?.length) {
      return res.status(401).json({
        message: "You need to login first.",
      });
    }

    req.user = result[0];
    req.userId = result[0].user_id;
    return next();
  } catch (err) {
    console.error("requireAuth error:", err);
    return res.status(500).json({ message: "Auth middleware error" });
  }
}
