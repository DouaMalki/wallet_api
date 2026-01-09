import express from "express";
import { getAllUsers, getUserById, getUsersWithHighTripCreation, deleteUser, blockUser } from "../controllers/usersController.js";

const router = express.Router();

router.get("/", getAllUsers);
router.get("/:id", getUserById);
router.get("/high-trip-creation", getUsersWithHighTripCreation);
router.patch("/:id/block", blockUser);
router.delete("/:id", deleteUser);


export default router;
