import express from "express";
import { getRulesBySlug } from "../controllers/tripTypeRulesController.js";

const router = express.Router();

router.get("/:slug", getRulesBySlug);

export default router;
