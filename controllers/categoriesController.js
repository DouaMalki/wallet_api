// import { listCategories } from "../repositories/categoriesRepo.js";

// export async function getCategories(req, res) {
//     try {
//         const { slug } = req.query;
//         const rows = await listCategories({ slug });

//         if (slug) return res.status(200).json(rows[0] || null);
//         return res.status(200).json(rows);
//     } catch (err) {
//         console.error("getCategories error:", err);
//         return res.status(500).json({ message: "Failed to fetch categories" });
//     }
// }

import { listCategories } from "../repositories/categoriesRepo.js";
import { mapCategoryRow } from "../mappers/categoryMapper.js";

export async function getCategories(req, res) {
    try {
        const rows = await listCategories();
        return res.status(200).json(rows.map(mapCategoryRow));
    } catch (err) {
        console.error("Error getting categories:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
}
