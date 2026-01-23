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

export async function updateTheme(req, res) {
  const { user_id, theme } = req.body;

  if (!user_id || !theme) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const result = await sql`
    UPDATE users
    SET theme = ${theme}
    WHERE user_id = ${user_id}
    RETURNING theme
  `;

  res.json(result[0]);
}

export async function updateLanguage(req, res) {
  const { user_id, language } = req.body;

  if (!user_id || !language) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const result = await sql`
    UPDATE users
    SET language = ${language}
    WHERE user_id = ${user_id}
    RETURNING language
  `;

  res.json(result[0]);
}

export async function updateProfileImage(req, res) {
  const { user_id, profile_image } = req.body;

  if (!user_id || !profile_image) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const result = await sql`
      UPDATE users
      SET profile_image = ${profile_image}
      WHERE user_id = ${user_id}
      RETURNING user_id, profile_image
    `;

    res.status(200).json(result[0]);
  } catch (err) {
    console.error("Update profile image error:", err);
    res.status(500).json({ message: "Failed to update profile image" });
  }
}

