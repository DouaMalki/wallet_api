import express from "express";
import {
    getPendingSurveys,
    getProblemTypes,
    getSurveyLocations,
    updateLocationsRating,
    publishTripPlan,
    updateProblemsInReports,
    updateFinishedTrips,
    updateAnsweredSurveys
} from "../controllers/surveyController.js";


const router = express.Router();

router.post("/survey/pending", getPendingSurveys);

router.get("/survey/problems", getProblemTypes);
router.post("/survey/locations", getSurveyLocations);

/* Updates after survey submission */
router.post("/survey/locations/rate", updateLocationsRating);
router.post("/survey/publish", publishTripPlan);

router.post("/survey/updateProblems", updateProblemsInReports);
router.post("/survey/updateFinished", updateFinishedTrips);
router.post("/survey/updateAnswered", updateAnsweredSurveys);

export default router;