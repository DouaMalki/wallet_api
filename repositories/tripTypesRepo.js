// repositories/tripTypesRepo.js
import { sql } from "../config/db.js";
import { mapTripTypeRow } from "../mappers/tripTypeMapper.js";

export async function listTripTypes({ slug, lang = "en" } = {}) {
  const safeLang = String(lang).toLowerCase() === "ar" ? "ar" : "en";

  const rows = slug
    ? await sql`
        SELECT
          id,
          slug,
          CASE
            WHEN ${safeLang} = 'ar' THEN COALESCE(name_ar, name)
            ELSE COALESCE(name, name_ar)
          END AS name,
          CASE
            WHEN ${safeLang} = 'ar' THEN name_ar
            ELSE NULL
          END AS name_ar
        FROM trip_types
        WHERE slug = ${slug}
        LIMIT 1;
      `
    : await sql`
        SELECT
          id,
          slug,
          CASE
            WHEN ${safeLang} = 'ar' THEN COALESCE(name_ar, name)
            ELSE COALESCE(name, name_ar)
          END AS name,
          CASE
            WHEN ${safeLang} = 'ar' THEN name_ar
            ELSE NULL
          END AS name_ar
        FROM trip_types
        ORDER BY name ASC;
      `;

  return rows.map(mapTripTypeRow);
}
