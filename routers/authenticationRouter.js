import express from "express";
import {
  signUpUser,
  login
} from "../controllers/authenticationController.js";


const router = express.Router();

router.post("/authentication/signup", signUpUser);
router.post("/authentication/login", login);

export default router;