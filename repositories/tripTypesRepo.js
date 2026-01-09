// import { sql } from "../config/db.js";
// import { mapTripTypeRow } from "../mappers/tripTypeMapper.js";

// export async function listTripTypes() {
//     const rows = await sql`
//     SELECT id, slug, name, name_ar
//     FROM trip_types
//     ORDER BY name ASC;
//   `;
//     return rows.map(mapTripTypeRow);
// }


// repositories/tripTypesRepo.js
import { sql } from "../config/db.js";
import { mapTripTypeRow } from "../mappers/tripTypeMapper.js";

export async function listTripTypes({ slug } = {}) {
  const rows = slug
    ? await sql`
        SELECT id, slug, name, name_ar
        FROM trip_types
        WHERE slug = ${slug}
        LIMIT 1;
      `
    : await sql`
        SELECT id, slug, name, name_ar
        FROM trip_types
        ORDER BY name ASC;
      `;

  return rows.map(mapTripTypeRow);
}
