import express from "express";
import {
  syncUserAfterFirebaseAuth
} from "../controllers/authenticationController.js";


const router = express.Router();

// sync the user after authentication (login or sign up)
router.post("/authentication", syncUserAfterFirebaseAuth);

export default router;