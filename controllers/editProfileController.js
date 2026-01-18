import { sql } from "../config/db.js";

export async function editProfile(req, res) {
  const { user_id, name, email, profile_image } = req.body;

  if (!user_id || !name || !email) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    /* Check email uniqueness in DB */
    const emailExists = await sql`
      SELECT user_id
      FROM users
      WHERE email = ${email}
        AND user_id != ${user_id}
    `;
    if (emailExists.length > 0) {
      return res.status(409).json({
        message: "Email already in use",
      });
    }

    /* Update DB */
    const result = await sql`
      UPDATE users
      SET
        name = ${name},
        email = ${email},
        profile_image = ${profile_image}
      WHERE user_id = ${user_id}
      RETURNING *
    `;

    res.status(200).json(result[0]);
  } catch (err) {
    console.error("Edit profile error:", err);
    res.status(500).json({ message: "Profile update failed" });
  }
}

