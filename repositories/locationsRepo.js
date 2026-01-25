// wallet_api/repositories/locationsRepo.js
import { sql } from "../config/db.js";
import { mapLocationRow } from "../mappers/locationMapper.js";

export async function listLocations({ cityId = null, tripType = null, limit = null, offset = null }) {
  const rows = await sql`
    SELECT
      l.id,
      l.city_id,
      l.name,

      -- category
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

      COALESCE(tt.trip_types, ARRAY[]::text[]) AS trip_types,

      -- ✅ cover photo (one per location)
      cp.photo_reference AS cover_photo_reference,
      cp.photo_url       AS cover_photo_url,
      cp.is_primary      AS cover_photo_is_primary

    FROM locations l
    LEFT JOIN categories c ON c.id = l.category_id

    -- trip types aggregation
    LEFT JOIN LATERAL (
      SELECT
        ARRAY_AGG(DISTINCT tt.slug) FILTER (WHERE tt.slug IS NOT NULL) AS trip_types
      FROM location_trip_types ltt
      JOIN trip_types tt ON tt.id = ltt.trip_type_id
      WHERE ltt.location_id = l.id
    ) tt ON TRUE

    -- cover photo (single row)
    LEFT JOIN LATERAL (
      SELECT photo_reference, photo_url, is_primary
      FROM location_photos
      WHERE location_id = l.id
      ORDER BY is_primary DESC, created_at DESC
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

  return rows.map(mapLocationRow);
}

// import { sql } from "../config/db.js";
// import { mapLocationRow } from "../mappers/locationMapper.js";

// export async function listLocations({ cityId = null, tripType = null, limit = null, offset = null }) {
//   const rows = await sql`
//     SELECT
//       l.id,
//       l.city_id,
//       l.name,

//       -- category
//       l.category_id,
//       c.slug    AS category_slug,
//       c.name    AS category_name,
//       c.name_ar AS category_name_ar,

//       l.google_place_id,
//       l.lat,
//       l.lng,
//       l.estimated_time,
//       l.max_cost,
//       l.rating,
//       l.open_hours,
//       l.closed_days,
//       l.recommended_for,

//       COALESCE(tt.trip_types, ARRAY[]::text[]) AS trip_types,
      


//       -- ✅ cover photo (one per location)
//       cp.photo_reference AS cover_photo_reference,
//       cp.photo_url       AS cover_photo_url,
//       cp.is_primary      AS cover_photo_is_primary

//     FROM locations l
//     LEFT JOIN categories c ON c.id = l.category_id

//     -- trip types aggregation
//     LEFT JOIN LATERAL (
//       SELECT
//         ARRAY_AGG(DISTINCT tt.slug) FILTER (WHERE tt.slug IS NOT NULL) AS trip_types
//       FROM location_trip_types ltt
//       JOIN trip_types tt ON tt.id = ltt.trip_type_id
//       WHERE ltt.location_id = l.id
//     ) tt ON TRUE

//     -- cover photo (single row)
//     LEFT JOIN LATERAL (
//       SELECT photo_reference, photo_url, is_primary
//       FROM location_photos
//       WHERE location_id = l.id
//       ORDER BY is_primary DESC, created_at DESC
//       LIMIT 1
//     ) cp ON TRUE

//     WHERE 1=1
//       ${cityId ? sql`AND l.city_id = ${cityId}` : sql``}

//       ${tripType ? sql`
//         AND EXISTS (
//           SELECT 1
//           FROM location_trip_types ltt2
//           JOIN trip_types tt2 ON tt2.id = ltt2.trip_type_id
//           WHERE ltt2.location_id = l.id
//             AND tt2.slug = ${tripType}
//         )
//       ` : sql``}

//     ORDER BY l.created_at DESC
//     ${limit ? sql`LIMIT ${limit}` : sql``}
//     ${offset !== null && offset !== undefined ? sql`OFFSET ${offset}` : sql``}

//   `;

//   return rows.map(mapLocationRow);
// }


