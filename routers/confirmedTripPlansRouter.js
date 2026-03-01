import express from "express";
import { requireAuth } from "../middleware/firebaseAuthMiddleware.js";
import { getConfirmedTripPlans, confirmTripPlan, deleteConfirmedTripPlan,
 } from "../controllers/saveController.js";

const router = express.Router();

router.get("/", requireAuth, getConfirmedTripPlans);
router.post("/", requireAuth, (req, res, next) => {
  console.log("✅HIT confirm router POST /api/confirmed-trip-plans");
  next();
}, confirmTripPlan); 
router.delete("/:planId", requireAuth, deleteConfirmedTripPlan);

export default router;
