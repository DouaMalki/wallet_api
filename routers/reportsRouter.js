import express from "express";
import {
  getSurveyReports,
  getTripReports,
  getSystemGrowth,
  getUsersActivity,
  getUsersLevelsSummary,
  getUsersByLevel,
  updateReportAfterSystemSettingsUpdate,
  updateReportAfterSurvey,
  updateReportAfterSubmittingTripForm
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

// Update the reports table after submitting a trip form, changing system settings, answering or non answering a trip survey
router.post("/trip_form_submit", updateReportAfterSubmittingTripForm);
router.post("/updated_settings", updateReportAfterSystemSettingsUpdate);
router.post("/survey", updateReportAfterSurvey);

export default router;