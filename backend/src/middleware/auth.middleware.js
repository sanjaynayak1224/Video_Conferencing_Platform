import jwt from "jsonwebtoken";
import httpStatus from "http-status";
import config from "../config.js";

export const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "No token provided, authorization denied" });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, config.jwtSecret);
        req.userId = decoded.userId;
        req.username = decoded.username;
        next();
    } catch (error) {
        return res.status(httpStatus.UNAUTHORIZED).json({ message: "Token is not valid" });
    }
};
