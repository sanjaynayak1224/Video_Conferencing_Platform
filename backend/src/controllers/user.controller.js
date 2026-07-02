import { User } from "../models/user.model.js";
import httpStatus from "http-status";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Meeting } from "../models/meeting.model.js";

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
        
        if (isPasswordCorrect) {
            const secret = process.env.JWT_SECRET || "apna_video_call_default_secret_key_2026";
            const token = jwt.sign(
                { userId: user._id, username: user.username },
                secret,
                { expiresIn: "7d" }
            );

            user.token = token;
            await user.save();
            return res.status(httpStatus.OK).json({ token, message: "Login done successfully" });
        } else {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid credentials" });
        }
    } catch (e) {
        console.error("Login Error:", e);
        return res.status(500).json({ message: "Something went wrong on the server" });
    }
};

const register = async (req, res) => {
    const { name, username, password } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(httpStatus.FOUND).json({ message: "The User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

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

    try {
        const newMeeting = new Meeting({
            user_id: req.username,
            meetingCode: meeting_code
        });

        await newMeeting.save();
        res.status(httpStatus.CREATED).json({ message: "Added code to history" });
    } catch (e) {
        console.error("addToHistory Error:", e);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Something went wrong on the server" });
    }
};

export { login, register, getUserHistory, addToHistory };