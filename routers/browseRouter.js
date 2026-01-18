import express from "express";
import { getAllCities, getLocationsByCityName } from "../controllers/browseController.js";

const router = express.Router();

// List all cities
router.get("/cities", getAllCities);

// Get locations by city name (search)
router.get("/locations", getLocationsByCityName);

export default router;
