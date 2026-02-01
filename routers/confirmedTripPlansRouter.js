import express from "express";
import { requireAuth } from "../middleware/firebaseAuthMiddleware.js";
import { getConfirmedTripPlans } from "../controllers/saveController.js";

const router = express.Router();

router.get("/", requireAuth, getConfirmedTripPlans);

export default router;
