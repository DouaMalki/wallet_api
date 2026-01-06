
import express from "express";
import { getLocations } from "../controllers/locationsController.js";

const router = express.Router();

// GET /api/locations?cityId=ramallah
router.get("/", getLocations);
console.log("✅ locationsRouter loaded");

export default router;
