import express from "express";
import {
    getProblemTypes,
    getPendingSurveys
} from "../controllers/surveyController.js";


const router = express.Router();

router.get("/survey/problems", getProblemTypes);
router.post("/survey/pending", getPendingSurveys);

export default router;