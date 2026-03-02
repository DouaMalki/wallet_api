import { sql } from "../config/db.js";
import { mapCityRow } from "../mappers/cityMapper.js";

export async function listCities({ lang = "en" } = {}) {
  const safeLang = String(lang).toLowerCase() === "ar" ? "ar" : "en";

  const rows = await sql`
    SELECT id,  
    CASE
        WHEN ${safeLang} = 'ar' THEN COALESCE(name_ar, name)
        ELSE COALESCE(name, name_ar)
      END AS name,

      CASE
        WHEN ${safeLang} = 'ar' THEN name_ar
        ELSE NULL
      END AS name_ar, 
      center_lat, center_lng
    FROM cities
    ORDER BY name ASC;
  `;
  return rows.map(mapCityRow);
}
