import { listCategories } from "../repositories/categoriesRepo.js";
import { mapCategoryRow } from "../mappers/categoryMapper.js";

export async function getCategories(req, res) {
    try {
        const rows = await listCategories();
        return res.status(200).json(rows.map(mapCategoryRow));
    } catch (err) {
        console.error("Error getting categories:", err?.message || err);
        return res.status(500).json({ message: "Internal server error" });
    }
}
