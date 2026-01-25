import express from "express";
import {
  getPublishedTripPlans,
  ratePublishedTripPlan,
  getTripPlanRating,
  getTodayTripPlan
} from "../controllers/homeController.js";

const router = express.Router();

router.get("/home/published", getPublishedTripPlans);
router.post("/home/rating", ratePublishedTripPlan);
router.get("/home/rating", getTripPlanRating);
router.get("/home/todayTripPlan", getTodayTripPlan);

export default router;