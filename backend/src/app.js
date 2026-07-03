import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

import config from "./config.js";
import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";

const app = express();
const server = createServer(app);
connectToSocket(server);

// Security headers
app.use(helmet());

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, postman, server-to-server)
        if (!origin) return callback(null, true);
        
        const isLocalHost = origin.startsWith("http://localhost:") || 
                            origin.startsWith("http://127.0.0.1:") || 
                            origin.startsWith("http://192.168.") || 
                            origin.startsWith("http://10.") || 
                            origin.startsWith("http://172.");
        
        if (isLocalHost || origin === config.corsOrigin) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Rate limiting on auth endpoints to prevent brute-force attacks
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests, please try again after 15 minutes" }
});

app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

app.use("/api/v1/users", authLimiter, userRoutes);

const start = async () => {
    try {
        const connection = await mongoose.connect(config.mongoUrl);
        console.log(`Database connected: ${connection.connection.host}`);

        server.listen(config.port, () => {
            console.log(`Server listening on port ${config.port}`);
        });
    } catch (error) {
        console.error(`Database connection failed: ${error.message}`);
        process.exit(1);
    }
};

// Graceful shutdown on container/process signals
process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
        mongoose.connection.close(false).then(() => process.exit(0));
    });
});

start();
