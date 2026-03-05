import { sql } from "../config/db.js";

export async function listCategories() {
  const rows = await sql`
    SELECT
      id,
      slug,
      name,
      name_ar,
      COALESCE(google_types, ARRAY[]::text[]) AS google_types,
      COALESCE(weather_profile, 'mixed')       AS weather_profile
    FROM categories
    ORDER BY name ASC;
  `;
  return rows;
}
