// wallet_api/repositories/locationsRepo.js
import { sql } from "../config/db.js";
import { mapLocationRow } from "../mappers/locationMapper.js";

export async function getLocationsByCityId(cityId) {
  const rows = await sql`
    SELECT
      l.id,
      l.city_id,
      l.name,
      l.category,
      l.google_place_id,
      l.lat,
      l.lng,
      l.estimated_time,
      l.max_cost,
      l.rating,
      l.open_hours,
      l.closed_days,
      l.recommended_for,

      COALESCE(
        ARRAY_AGG(DISTINCT tt.slug) FILTER (WHERE tt.slug IS NOT NULL),
        '{}'::text[]
      ) AS trip_types

    FROM locations l
    LEFT JOIN location_trip_types ltt ON ltt.location_id = l.id
    LEFT JOIN trip_types tt ON tt.id = ltt.trip_type_id
    WHERE l.city_id = ${cityId}
    GROUP BY l.id
    ORDER BY l.created_at DESC;
  `;

  return rows; // Neon بيرجع array of rows
}

export async function listLocations({ cityId, tripType = null, limit = null, offset = null }) {
  const rows = await sql`
    SELECT
      l.*,
      COALESCE(
        ARRAY_AGG(DISTINCT tt.slug) FILTER (WHERE tt.slug IS NOT NULL),
        ARRAY[]::text[]
      ) AS trip_types
    FROM locations l
    LEFT JOIN location_trip_types ltt ON ltt.location_id = l.id
    LEFT JOIN trip_types tt ON tt.id = ltt.trip_type_id

    WHERE 1=1
    ${cityId ? sql`AND l.city_id = ${cityId}` : sql``}

    ${tripType
      ? sql`AND EXISTS (
                SELECT 1
                FROM location_trip_types ltt2
                JOIN trip_types tt2 ON tt2.id = ltt2.trip_type_id
                WHERE ltt2.location_id = l.id
                  AND tt2.slug = ${tripType}
              )`
      : sql``
    }
      
    GROUP BY l.id
    ORDER BY l.created_at DESC
    ${limit ? sql`LIMIT ${limit}` : sql``};
     ${offset ? sql`OFFSET ${offset}` : sql``}
  `;

  return rows.map(mapLocationRow);
}