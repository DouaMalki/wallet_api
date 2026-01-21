import express from "express";
import {
    getProblemTypes,
    getPendingSurveys,
    getSurveyLocations
} from "../controllers/surveyController.js";


const router = express.Router();

router.get("/survey/problems", getProblemTypes);
router.post("/survey/pending", getPendingSurveys);
router.post("/survey/locations", getSurveyLocations);

export default router;