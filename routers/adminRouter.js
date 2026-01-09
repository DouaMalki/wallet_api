import express from "express";
import {
//   addTripType,
//   deleteTripType,
//   getAllTripTypes,
//   addLocation,
//   deleteLocation,
//   getAllLocations,
  updateSystemSettings,
} from "../controllers/adminController.js";

const router = express.Router();

router.post("/system-settings", updateSystemSettings);


// // Admin routes
// router.post("/trip-types", addTripType);
// router.delete("/trip-types/:id", deleteTripType);

// // Public (used by trip plan form)
// router.get("/trip-types", getAllTripTypes);

// // Locations management
// router.post("/locations", addLocation);
// router.get("/locations", getAllLocations);
// router.delete("/locations/:id", deleteLocation);

export default router;
