// import { sql } from "../config/db.js";

// export async function getRulesBySlug(req, res) {
//     try {
//         const { slug } = req.params;

//         const { rows } = await sql.query(
//             `
//       SELECT tt.slug, tr.rule_json
//       FROM trip_types tt
//       JOIN trip_type_rules tr ON tr.trip_type_id = tt.id
//       WHERE tt.slug = $1
//         AND tr.is_active = true
//       ORDER BY tr.updated_at DESC
//       LIMIT 1
//       `,
//             [slug]
//         );

//         // لو ما في rule فعّال
//         if (!rows.length) {
//             return res.json({ slug, dayPattern: [] });
//         }

//         const ruleJson = rows[0].rule_json || {};
//         const dayPattern = Array.isArray(ruleJson.dayPattern) ? ruleJson.dayPattern : [];

//         return res.json({
//             slug: rows[0].slug,
//             dayPattern,
//             // لو بتحبي ترجّعي كمان كل القاعدة:
//             // rule: ruleJson,
//         });
//     } catch (err) {
//         console.error("getRulesBySlug error:", err);
//         return res.status(500).json({ message: "Failed to fetch trip type rules" });
//     }
// }

import { getActiveRuleByTripTypeSlug } from "../repositories/tripTypeRulesRepo.js";

export async function getRulesBySlug(req, res) {
    try {
        const slug = (req.query.slug || "").trim(); // ✅ لأنك بتستعملي ?slug=

        if (!slug) {
            return res.status(400).json({ message: "slug is required" });
        }

        const row = await getActiveRuleByTripTypeSlug(slug);

        if (!row) {
            return res.json({ slug, dayPattern: [] });
        }

        const ruleJson = row.rule_json || {};
        const dayPattern = Array.isArray(ruleJson.dayPattern) ? ruleJson.dayPattern : [];

        return res.json({
            slug: row.trip_type_slug,
            dayPattern,
            // rule: ruleJson, // إذا بدك ترجعي القاعدة كاملة
            // updatedAt: row.updated_at,
        });
    } catch (err) {
        console.error("getRulesBySlug error:", err);
        return res.status(500).json({ message: "Failed to fetch trip type rules" });
    }
}
