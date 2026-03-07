import express from "express";
import { refreshSeed } from "../controllers/seedController.js";

const router = express.Router();

// GET /api/seed/refresh?cityId=ramallah&tripType=cultural
router.get("/refresh", refreshSeed);

console.log("✅ seedRouter loaded");

export default router;