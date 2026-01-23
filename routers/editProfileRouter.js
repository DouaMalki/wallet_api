import express from "express";
import {
  updateName,
  updateTheme,
  updateLanguage,
  updateProfileImage
} from "../controllers/editProfileController.js";

const router = express.Router();

router.put("/update-name", updateName);
router.put("/update-theme", updateTheme);
router.put("/update-language", updateLanguage);
router.put("/update-profile-image", updateProfileImage);

export default router;
