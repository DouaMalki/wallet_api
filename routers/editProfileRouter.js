import express from "express";
import {
    editProfile
} from "../controllers/editProfileController.js";


const router = express.Router();

router.put("/editProfile", editProfile);

export default router;