import { Router } from "express";
import { addToHistory, getUserHistory, login, register } from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.route("/login").post(login);
router.route("/register").post(register);

// Protected routes using JWT auth middleware
router.route("/add_to_activity").post(authMiddleware, addToHistory);
router.route("/get_all_activity").get(authMiddleware, getUserHistory);

export default router;