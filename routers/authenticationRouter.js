import express from "express";
import {
  signUp,
  login
} from "../controllers/authenticationController.js";


const router = express.Router();

router.post("/authentication/signup", signUp);
router.post("/authentication/login", login);

export default router;