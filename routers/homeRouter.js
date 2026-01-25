import express from "express";
import {
  getPublishedTripPlans
} from "../controllers/homeController.js";

const router = express.Router();

router.get("/home/published", getPublishedTripPlans);

export default router;