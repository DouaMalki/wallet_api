import express from "express";
import { getAllUsers, getUserById, getUsersWithHighTripCreation, deleteUser, blockUser, updateProfileImage } from "../controllers/usersController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.get("/", getAllUsers);
router.get("/high-trip-creation", getUsersWithHighTripCreation);
router.get("/:id", getUserById);
router.patch("/:id/block", blockUser);
router.delete("/:id", deleteUser);
router.put("/update-profile-image", requireAuth, updateProfileImage);



export default router;
