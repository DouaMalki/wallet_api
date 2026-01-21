import express from "express";
import {
  getAllCities,
  getAllCategories,
  getFeaturedCategories,
  getLocationsByCity,
  getCitySections,
  getLocationById,
} from "../controllers/browseController.js";

const router = express.Router();

router.get("/cities", getAllCities);

router.get("/categories", getAllCategories);
router.get("/categories/featured", getFeaturedCategories);

router.get("/locations", getLocationsByCity);
router.get("/city-sections", getCitySections);

router.get("/location/:locationId", getLocationById);

export default router;


// import express from "express";
// import { getAllCities, getLocationsByCityName } from "../controllers/browseController.js";

// const router = express.Router();

// // List all cities
// router.get("/cities", getAllCities);

// // Get locations by city name (search)
// router.get("/locations", getLocationsByCityName);

// export default router;
