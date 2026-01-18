import { sql } from "../config/db.js";

export async function updateName(req, res) {
  const { user_id, name } = req.body;

  if (!user_id || !name?.trim()) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const result = await sql`
      UPDATE users
      SET name = ${name}
      WHERE user_id = ${user_id}
      RETURNING user_id, name
    `;
    res.status(200).json(result[0]);
  } catch (err) {
    console.error("Update name error:", err);
    res.status(500).json({ message: "Failed to update name" });
  }
}

export async function checkEmailUniqueness(req, res) {
  const { user_id, email } = req.body;

  if (!user_id || !email) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const result = await sql`
      SELECT user_id
      FROM users
      WHERE email = ${email}
        AND user_id != ${user_id}
    `;

    res.status(200).json({
      isUnique: result.length === 0,
    });
  } catch (err) {
    console.error("Check email uniqueness error:", err);
    res.status(500).json({ message: "Failed to check email" });
  }
}

export async function updateEmail(req, res) {
  const { user_id, email } = req.body;

  if (!user_id || !email) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const result = await sql`
      UPDATE users
      SET email = ${email}
      WHERE user_id = ${user_id}
      RETURNING user_id, email
    `;

    res.status(200).json(result[0]);
  } catch (err) {
    console.error("Update email error:", err);
    res.status(500).json({ message: "Failed to update email" });
  }
}


