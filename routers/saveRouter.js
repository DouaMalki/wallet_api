import express from "express";
import {
  saveLocation,
  unsaveLocation,
  getSavedLocations,
  isLocationSaved,
} from "../controllers/saveController.js";

// Use your existing auth middleware here:
import { protect } from "../middleware/authMiddleware.js"; 
// ^ rename this import to whatever you actually use (e.g. verifyToken, authenticate, requireAuth)

const router = express.Router();

/**
 * Base path suggestion: /api/saved-locations
 *
 * GET    /api/saved-locations
 * POST   /api/saved-locations/:locationId
 * DELETE /api/saved-locations/:locationId
 * GET    /api/saved-locations/check/:locationId
 */
router.get("/", protect, getSavedLocations);
router.post("/:locationId", protect, saveLocation);
router.delete("/:locationId", protect, unsaveLocation);
router.get("/check/:locationId", protect, isLocationSaved);

export default router;
