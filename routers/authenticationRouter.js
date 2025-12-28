import express from "express";
import {
  signUpUser,
  loginUser
} from "../controllers/authenticationController.js";


const router = express.Router();

// sync the user after authentication (login or sign up)
router.post("/authentication/signup", signUpUser);
router.post("/authentication/login", loginUser);

export default router;