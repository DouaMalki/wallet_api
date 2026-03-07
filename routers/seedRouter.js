import express from "express";
import { refreshSeed, ensureSeed } from "../controllers/seedController.js";

const router = express.Router();

router.get("/refresh", refreshSeed);
router.get("/ensure", ensureSeed);

console.log("✅ seedRouter loaded");

export default router;