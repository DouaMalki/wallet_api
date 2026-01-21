import express from "express";
import {
    getProblemTypes,
    getPendingSurveys,
    getSurveyLocations,
    updateLocationsRating
} from "../controllers/surveyController.js";


const router = express.Router();

router.get("/survey/problems", getProblemTypes);
router.post("/survey/pending", getPendingSurveys);
router.post("/survey/locations", getSurveyLocations);
router.post("/survey/locations/rate", updateLocationsRating);

export default router;