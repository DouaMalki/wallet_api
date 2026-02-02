import express from "express";
import { requireAuth } from "../middleware/firebaseAuthMiddleware.js";
import { getConfirmedTripPlans, confirmTripPlan } from "../controllers/saveController.js";

const router = express.Router();

router.get("/", requireAuth, getConfirmedTripPlans);
router.post("/", requireAuth, (req, res, next) => {
  console.log("✅ HIT POST /api/confirmed-trip-plans");
  next();
}, confirmTripPlan); 


export default router;
