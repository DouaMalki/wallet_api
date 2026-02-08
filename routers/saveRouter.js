import express from "express";
import {
  saveLocation,
  unsaveLocation,
  getSavedLocations,
  isLocationSaved,
  getSavedTripPlans,
} from "../controllers/saveController.js";

import { requireAuth } from "../middleware/firebaseAuthMiddleware.js";

const router = express.Router();

/**
 * Base: /api/saved-locations
 */
router.get("/", requireAuth, getSavedLocations);
router.post("/:locationId", requireAuth, saveLocation);
router.delete("/:locationId", requireAuth, unsaveLocation);
router.get("/check/:locationId", requireAuth, isLocationSaved);
router.get("/saved-trip-plans", requireAuth, getSavedTripPlans);



export default router;
