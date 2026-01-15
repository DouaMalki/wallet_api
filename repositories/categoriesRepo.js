// import { sql } from "../config/db.js";
// import { mapCategoryRow } from "../mappers/categoryMapper.js";

// export async function listCategories({ slug } = {}) {
//     const rows = slug
//         ? await sql`
//         SELECT id, slug, name, name_ar, google_types
//         FROM categories
//         WHERE slug = ${slug}
//         LIMIT 1;
//       `
//         : await sql`
//         SELECT id, slug, name, name_ar, google_types
//         FROM categories
//         ORDER BY name ASC;
//       `;

//     return rows.map(mapCategoryRow);
// }

import { sql } from "../config/db.js";

export async function listCategories() {
    const rows = await sql`
    SELECT id, slug, name, name_ar, COALESCE(google_types, ARRAY[]::text[]) AS google_types
    FROM categories
    ORDER BY name ASC;
  `;
    return rows;
}
