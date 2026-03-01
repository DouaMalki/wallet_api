import express from "express";
import { requireAuth } from "../middleware/firebaseAuthMiddleware.js";
import { getSavedTripPlans, unsaveTripPlan } from "../controllers/saveController.js";

const router = express.Router();

router.get("/", requireAuth, getSavedTripPlans);
router.patch("/:planId/unsave", requireAuth, unsaveTripPlan);

export default router;
