import { sql } from "../config/db.js";
import { mapCityRow } from "../mappers/cityMapper.js";

export async function listCities() {
    const rows = await sql`
    SELECT id, name, name_ar, center_lat, center_lng
    FROM cities
    ORDER BY name ASC;
  `;
    return rows.map(mapCityRow);
}
