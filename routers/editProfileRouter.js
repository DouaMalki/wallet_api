import express from "express";
import {
  updateName,
  checkEmailUniqueness,
  updateEmail,
} from "../controllers/editProfileController.js";

const router = express.Router();

router.put("/update-name", updateName);
router.post("/check-email", checkEmailUniqueness);
router.put("/update-email", updateEmail);

export default router;
