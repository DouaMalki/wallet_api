import express from "express";
import {
    getProblemTypes
} from "../controllers/surveyController.js";


const router = express.Router();

router.get("/survey/problems", getProblemTypes);

export default router;