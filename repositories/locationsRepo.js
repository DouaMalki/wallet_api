// wallet_api/repositories/locationsRepo.js
import { sql } from "../config/db.js";
import { mapLocationRow } from "../mappers/locationMapper.js";

export async function listLocations({ cityId = null, tripType = null, limit = null, offset = null, lang = "en", }) {

  const safeLang = String(lang).toLowerCase() === "ar" ? "ar" : "en";

  const rows = await sql`
    SELECT
      l.id,
      l.city_id,
      l.name,

      l.category_id,
      c.slug AS category_slug,

      CASE
        WHEN ${safeLang} = 'ar' THEN COALESCE(c.name_ar, c.name)
        ELSE COALESCE(c.name, c.name_ar)
      END AS category_name,

      CASE
        WHEN ${safeLang} = 'ar' THEN COALESCE(c.name_ar, c.name)
        ELSE NULL
      END AS category_name_ar,

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

      --  cover photo (one per location)
      cp.photo_reference AS cover_photo_reference,
      cp.photo_url       AS cover_photo_url,
      cp.is_primary      AS cover_photo_is_primary

    FROM locations l
    LEFT JOIN categories c ON c.id = l.category_id

    -- join city so we can enforce boundary filtering safely
    LEFT JOIN cities cy
      ON cy.id = l.city_id
      
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

       -- extra safety: if city boundary exists, only return points covered by it
      ${cityId ? sql`
        AND (
          cy.boundary_geom IS NULL
          OR (
            l.lat IS NOT NULL
            AND l.lng IS NOT NULL
            AND ST_Covers(
              cy.boundary_geom,
              ST_SetSRID(ST_Point(l.lng, l.lat), 4326)
            )
          )
        )
      ` : sql``}

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