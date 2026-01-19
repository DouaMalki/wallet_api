// wallet_api/repositories/locationsRepo.js
import { sql } from "../config/db.js";
import { mapLocationRow } from "../mappers/locationMapper.js";


export async function listLocations({ cityId = null, tripType = null, limit = null, offset = null }) {
  const rows = await sql`
    SELECT
      l.id,
      l.city_id,
      l.name,

      -- التصنيف عبر categories
      l.category_id,
      c.slug    AS category_slug,
      c.name    AS category_name,
      c.name_ar AS category_name_ar,

      l.google_place_id,
      l.lat,
      l.lng,
      l.estimated_time,
      l.max_cost,
      l.rating,
      l.open_hours,
      l.closed_days,
      l.recommended_for,

      COALESCE(tt.trip_types, ARRAY[]::text[]) AS trip_types

      cp.photo_reference AS cover_photo_reference

    FROM locations l
    LEFT JOIN categories c ON c.id = l.category_id

    LEFT JOIN LATERAL (
      SELECT
        ARRAY_AGG(DISTINCT tt.slug) FILTER (WHERE tt.slug IS NOT NULL) AS trip_types
      FROM location_trip_types ltt
      JOIN trip_types tt ON tt.id = ltt.trip_type_id
      WHERE ltt.location_id = l.id
    ) tt ON TRUE

     --  one photo per location (best for cards/plan)
    LEFT JOIN LATERAL (
  SELECT lp.photo_reference
  FROM location_photos lp
  WHERE lp.location_id = l.id
  ORDER BY lp.is_primary DESC, lp.created_at DESC
  LIMIT 1
) cp ON TRUE


    WHERE 1=1
      ${cityId ? sql`AND l.city_id = ${cityId}` : sql``}

      ${tripType ? sql`
        AND EXISTS (
          SELECT 1
          FROM location_trip_types ltt2
          JOIN trip_types tt2 ON tt2.id = ltt2.trip_type_id
          WHERE ltt2.location_id = l.id
            AND tt2.slug = ${tripType}
        )
      ` : sql``}

    ORDER BY l.created_at DESC
    ${limit ? sql`LIMIT ${limit}` : sql``}
    ${offset ? sql`OFFSET ${offset}` : sql``}
  `;

  console.log('Locations retrieved:', rows);  // طباعة الأماكن التي يتم استرجاعها

  return rows.map(mapLocationRow);
}
