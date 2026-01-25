import express from "express";
import {
  getPublishedTripPlans,
  ratePublishedTripPlan
} from "../controllers/homeController.js";

const router = express.Router();

router.get("/home/published", getPublishedTripPlans);
router.post("/home/rating", ratePublishedTripPlan);

export default router;