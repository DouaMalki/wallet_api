import express from "express";
import {
  getSurveyReports,
  getTripReports,
  getSystemGrowth,
  getUsersActivity,
  getUsersLevelsSummary,
  getUsersByLevel,
  updateReportsAfterTripSubmit,
  createReportAfterSystemSettingsUpdate,
  updateReportsAfterSurveySubmit
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

// Update the reports table after submitting a trip form, changing system settings, answering a trip survey
router.post("/trip_submit", updateReportsAfterTripSubmit);
router.post("/updated_settings", createReportAfterSystemSettingsUpdate);
router.post("/survey_submit", updateReportsAfterSurveySubmit);


export default router;