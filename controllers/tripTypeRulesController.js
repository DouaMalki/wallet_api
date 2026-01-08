import { getActiveRuleByTripTypeSlug } from "../repositories/tripTypeRulesRepo.js";

export async function getTripTypeRule(req, res) {
    try {
        const { tripTypeSlug } = req.params;

        const row = await getActiveRuleByTripTypeSlug(tripTypeSlug);
        if (!row) {
            return res.status(404).json({ message: "No active rule found for this trip type" });
        }

        res.status(200).json({
            tripTypeSlug: row.trip_type_slug,
            rule: row.rule_json,     // jsonb بيرجع كـ object
            isActive: row.is_active,
            updatedAt: row.updated_at,
        });
    } catch (error) {
        console.log("Error getting trip type rule:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}
