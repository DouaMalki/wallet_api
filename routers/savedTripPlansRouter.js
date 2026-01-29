import express from "express";
import { requireAuth } from "../middleware/firebaseAuthMiddleware.js";
import { getSavedTripPlans } from "../controllers/saveController.js";

const router = express.Router();

router.get("/", requireAuth, getSavedTripPlans);

export default router;
