import express from "express";
import { getTripTypeRule } from "../controllers/tripTypeRulesController.js";

const router = express.Router();
router.get("/:tripTypeSlug", getTripTypeRule);

console.log("✅ tripTypeRulesRouter loaded");
export default router;
