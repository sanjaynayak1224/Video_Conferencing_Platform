import dotenv from "dotenv";
dotenv.config();

/**
 * Centralized configuration — single source of truth for all environment-dependent values.
 * Fails fast on startup if required variables are missing, preventing silent misconfiguration.
 */

function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        console.error(`[Config] Missing required environment variable: ${key}`);
        process.exit(1);
    }
    return value;
}

const config = {
    port: parseInt(process.env.PORT, 10) || 8080,
    mongoUrl: requireEnv("MONGO_URL"),
    jwtSecret: requireEnv("JWT_SECRET"),
    corsOrigin: process.env.CORS_ORIGIN || "*",
    bcryptRounds: 10,
    jwtExpiry: "7d",

    // Socket.io room-level message cache limit to prevent unbounded memory growth
    maxMessagesPerRoom: 500,
};

export default config;
