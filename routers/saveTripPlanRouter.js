// wallet_api/routers/saveTripPlanRouter.js
import express from "express";
import { requireAuth } from "../middleware/firebaseAuthMiddleware.js";
import { createSavedTripPlan } from "../repositories/savedTripPlansRepo.js";

const router = express.Router();

/**
 * POST /api/saved_trip_plans
 * Headers:
 *   firebase-uid: <uid>
 * Body:
 * {
 *   title?: string,
 *   answeredSurvey?: boolean,
 *   published?: boolean,
 *   tripRequest: {...},
 *   finalPlan: {...}
 * }
 */
router.post("/", requireAuth, async (req, res) => {
    try {
        const userId = req.userId;

        const {
            title = null,
            answeredSurvey = false,
            published = false,
            tripRequest,
            finalPlan,
        } = req.body || {};

        const out = await createSavedTripPlan({
            userId,
            title,
            answeredSurvey,
            published,
            tripRequest,
            finalPlan,
        });

        return res.status(201).json({
            message: "Trip plan saved",
            planId: out.planId,
        });
    } catch (err) {
        console.error("saveTripPlan error:", err);
        return res.status(500).json({
            message: err?.message || "Internal server error",
        });
    }
});

export default router;
