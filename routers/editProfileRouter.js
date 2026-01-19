import express from "express";
import {
  updateName,
  updateTheme,
  updateLanguage
} from "../controllers/editProfileController.js";

const router = express.Router();

router.put("/update-name", updateName);
router.put("/update-theme", updateTheme);
router.put("/update-language", updateLanguage);

export default router;
