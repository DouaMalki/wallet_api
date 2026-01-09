import express from "express";
import { getlocationsByGooglePlaceId } from "../controllers/reportsController.js";


const router = express.Router();

router.get("/:google_place_id", getlocationsByGooglePlaceId);

export default router;