import express from "express";
import {createServer} from "node:http";
import dotenv from "dotenv"
dotenv.config()

import mongoose from "mongoose";
import {connectToSocket} from "./controllers/socketManager.js"

import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import userRoutes from "./routes/users.routes.js";

const app = express();
const server = createServer(app);
connectToSocket(server);

app.set("port", (process.env.PORT) || 8080);

// Global Security Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// API Rate Limiting for Authentication / Security paths
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many authentication requests, please try again after 15 minutes" }
});

app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

// Apply rate limiter specifically to auth endpoints
app.use("/api/v1/users", authLimiter, userRoutes);


const start=async()=>{
   try {
      const connectionDb=await mongoose.connect(process.env.MONGO_URL)
      console.log(`Database connected successfully: ${connectionDb.connection.host}`);
      server.listen(app.get("port"),()=>{
         console.log(`Server listening on port ${app.get("port")}`);
      })
   } catch (error) {
      console.error(`Database connection error: ${error.message}`);
      process.exit(1);
   }
}

start();
