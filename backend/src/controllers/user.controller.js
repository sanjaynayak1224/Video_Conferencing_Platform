import { User } from "../models/user.model.js";
import httpStatus from "http-status";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Meeting } from "../models/meeting.model.js";
import config from "../config.js";

const login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Please provide both username and password" });
    }

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User not found" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);

        if (!isPasswordCorrect) {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user._id, username: user.username },
            config.jwtSecret,
            { expiresIn: config.jwtExpiry }
        );

        return res.status(httpStatus.OK).json({ token, message: "Login done successfully" });
    } catch (e) {
        console.error("Login Error:", e);
        return res.status(500).json({ message: "Something went wrong on the server" });
    }
};

const register = async (req, res) => {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
        return res.status(400).json({ message: "Name, username, and password are required" });
    }

    if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ message: "Username must be between 3 and 30 characters" });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(httpStatus.CONFLICT).json({ message: "Username is already taken" });
        }

        const hashedPassword = await bcrypt.hash(password, config.bcryptRounds);

        const newUser = new User({
            name,
            username,
            password: hashedPassword
        });
        await newUser.save();

        res.status(httpStatus.CREATED).json({ message: "User registered successfully" });
    } catch (e) {
        console.error("Registration Error:", e);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong on the server" });
    }
};

const getUserHistory = async (req, res) => {
    try {
        const meetings = await Meeting.find({ user_id: req.username });
        res.json(meetings);
    } catch (e) {
        console.error("getUserHistory Error:", e);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong on the server" });
    }
};

const addToHistory = async (req, res) => {
    const { meeting_code } = req.body;

    if (!meeting_code || typeof meeting_code !== "string" || !meeting_code.trim()) {
        return res.status(400).json({ message: "A valid meeting code is required" });
    }

    try {
        const newMeeting = new Meeting({
            user_id: req.username,
            meetingCode: meeting_code.trim()
        });

        await newMeeting.save();
        res.status(httpStatus.CREATED).json({ message: "Added code to history" });
    } catch (e) {
        console.error("addToHistory Error:", e);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong on the server" });
    }
};

export { login, register, getUserHistory, addToHistory };