import express from "express";
import {
  getPublishedTripPlans,
  ratePublishedTripPlan,
  incrementTripPlanSeens,
  getTodayTripPlan,
  SaveTripPlan
} from "../controllers/homeController.js";

const router = express.Router();

router.get("/home/published", getPublishedTripPlans);
router.post("/home/rating", ratePublishedTripPlan);
router.post("/home/seen", incrementTripPlanSeens);
router.get("/home/todayTripPlan", getTodayTripPlan);
router.post("/home/saveTripPlan", SaveTripPlan);
router.post("/home/unConfirmTripPlan", toggleConfirmTripPlan);

export default router;