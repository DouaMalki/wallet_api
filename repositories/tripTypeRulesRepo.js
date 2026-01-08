import { sql } from "../config/db.js";

export async function getActiveRuleByTripTypeSlug(tripTypeSlug) {
    const rows = await sql`
    SELECT
      t.slug AS trip_type_slug,
      r.rule_json,
      r.is_active,
      r.updated_at
    FROM trip_type_rules r
    JOIN trip_types t ON t.id = r.trip_type_id
    WHERE t.slug = ${tripTypeSlug}
      AND r.is_active = true
    ORDER BY r.updated_at DESC
    LIMIT 1;
  `;

    return rows[0] || null;
}
