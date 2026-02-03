import express from "express";
import { requireAuth } from "../middleware/firebaseAuthMiddleware.js";
import { getTripPlanDetails } from "../controllers/saveController.js";

const router = express.Router();

router.get("/:planId", requireAuth, getTripPlanDetails);

export default router;
