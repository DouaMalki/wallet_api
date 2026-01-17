import express from "express";
import {
  getSurveyReports,
  getTripReports,
  getSystemGrowth,
  getUsersActivity,
  updateReportAfterSystemSettingsUpdate,
  updateReportAfterSurvey,
  updateReportAfterSubmittingTripForm
} from "../controllers/reportsController.js";

const router = express.Router();

// Survey-related reports
router.get("/surveyReport", getSurveyReports);
// Trip-related reports
router.get("/tripsReport", getTripReports);
// System growth reports
router.get("/growthReport", getSystemGrowth);
// Users activity reports
router.get("/activityReport", getUsersActivity);
// After submitting a trip form
router.post("/trip-form", updateReportAfterSubmittingTripForm);
// After updating system settings
router.post("/system-settings", updateReportAfterSystemSettingsUpdate);
// After answering / not answering a survey
router.post("/survey", updateReportAfterSurvey);

export default router;
