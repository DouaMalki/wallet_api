import express from "express";
import {
  getSurveyReports,
  getTripReports,
  getSystemGrowth,
  getUsersActivity,
  getUsersLevelsSummary,
  getUsersByLevel,
  updateReportsAfterSystemChange
} from "../controllers/reportsController.js";


const router = express.Router();

// Survey related reports
router.get("/survey", getSurveyReports);
// Trip related reports
router.get("/trips", getTripReports);
// System growth reports
router.get("/growth", getSystemGrowth);
// Users activity reports
router.get("/activity", getUsersActivity);
// Users levels reports
router.get("/levels", getUsersLevelsSummary);
router.get("/levels/:level", getUsersByLevel);
// Update the reports table after changing the system settings
router.post("/updated_settings", updateReportsAfterSystemChange);

export default router;