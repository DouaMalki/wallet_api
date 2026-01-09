import { sql } from "../config/db.js";
import { getAuth } from "firebase-admin/auth";

export async function editProfile(req, res) {
  const { user_id, name, email, profile_image } = req.body;

  if (!user_id || !name || !email) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    /* Get the current user */
    const users = await sql`
      SELECT email, firebase_uid
      FROM users
      WHERE user_id = ${user_id}
    `;
    const currentUser = users[0];

    /* If the email changed, check uniqueness */
    if (email !== currentUser.email) {
      const emailExists = await sql`
        SELECT user_id FROM users WHERE email = ${email}
      `;
      if (emailExists.length > 0) {
        return res.status(409).json({ message: "Email already in use" });
      }

      /* If the email is unique, update the Firebase email */
      await getAuth().updateUser(currentUser.firebase_uid, {
        email,
      });
    }

    /* Save the updated name, email and profile_image URL in the database */
    await sql`
      UPDATE users
      SET
        name = ${name},
        email = ${email},
        profile_image = ${profile_image}
      WHERE user_id = ${user_id}
    `;
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Edit profile error:", err);
    res.status(500).json({ message: "Profile update failed" });
  }
}
