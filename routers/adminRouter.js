import express from "express";
import {
  addTripType,
  deleteTripType,
  getAllTripTypes,
  addProblemType,
  deleteProblemType,
  getProblemTypes,
//   addLocation,
//   deleteLocation,
//   getAllLocations,
  updateSystemLimits,
} from "../controllers/adminController.js";

const router = express.Router();

// Admin routes
router.post("/trip-types", addTripType);
router.delete("/trip-types/:id", deleteTripType);

// Public (used by trip plan form)
router.get("/trip-types", getAllTripTypes);

// Problem Types JSON CRUD (system_settings.problem_types)
router.post("/system-settings/problem-types", addProblemType);
router.delete("/system-settings/problem-types/:key", deleteProblemType);
router.get("/system-settings/problem-types", getProblemTypes);


// Limits (only 2 fields)
router.post("/system-settings/limits", updateSystemLimits);

// // Locations management
// router.post("/locations", addLocation);
// router.get("/locations", getAllLocations);
// router.delete("/locations/:id", deleteLocation);

export default router;
