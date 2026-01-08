import express from "express";
import {
  addTripType,
  deleteTripType,
  getAllTripTypes,
} from "../controllers/adminController.js";

const router = express.Router();

// Admin routes
router.post("/trip-types", addTripType);
router.delete("/trip-types/:id", deleteTripType);

// Public (used by trip plan form)
router.get("/trip-types", getAllTripTypes);

export default router;
