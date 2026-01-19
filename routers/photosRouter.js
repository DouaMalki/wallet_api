import express from "express";
import { getPlacePhoto } from "../controllers/photosController.js";

const router = express.Router();

// GET /api/photos/:photoReference?maxWidth=800
router.get("/:photoReference", getPlacePhoto);

export default router;
