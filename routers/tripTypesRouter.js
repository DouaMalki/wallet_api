import express from "express";
import { getTripTypes } from "../controllers/tripTypesController.js";

const router = express.Router();
router.get("/", getTripTypes);

console.log("tripTypesRouter loaded");
export default router;
