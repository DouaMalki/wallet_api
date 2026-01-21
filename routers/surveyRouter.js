import express from "express";
import {
    getProblemTypes,
    getPendingSurveys,
    getSurveyLocations,
    updateLocationsRating,
    publishTripPlan
} from "../controllers/surveyController.js";


const router = express.Router();

router.get("/survey/problems", getProblemTypes);
router.post("/survey/pending", getPendingSurveys);
router.post("/survey/locations", getSurveyLocations);
router.post("/survey/locations/rate", updateLocationsRating);
router.post("/survey/publish", publishTripPlan);

export default router;