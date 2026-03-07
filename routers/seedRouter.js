import express from "express";
import { refreshSeed, ensureSeed, ensureAllSeed } from "../controllers/seedController.js";

const router = express.Router();

router.get("/refresh", refreshSeed);
router.get("/ensure", ensureSeed);
router.get("/ensure-all", ensureAllSeed);

console.log("✅ seedRouter loaded");

export default router;