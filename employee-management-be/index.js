import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";
import router from "./routes/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Allow local dev + deployed frontend (set FRONTEND_URL in Vercel env vars)
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
   "http://astral-dashboard-sooty.vercel.app/",
   "https://astral-dashboard-sooty.vercel.app/",
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin (e.g. curl, Postman, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// IMPORTANT: make sure MongoDB is connected before any /api route runs a query.
// On serverless, connectDB() used to be called without awaiting it, so the
// very first request(s) after a cold start would try to query the database
// before the connection was ready, causing "buffering timed out" errors.
// This middleware waits for the connection (only once per cold start,
// since dbReady is cached below) before letting requests reach your routes.
let dbReady = null;
app.use(async (req, res, next) => {
    if (!dbReady) {
        dbReady = connectDB();
    }
    try {
        await dbReady;
        next();
    } catch (err) {
        dbReady = null; // allow retry on the next request if this attempt failed
        res.status(503).json({ success: false, message: "Database connection failed" });
    }
});

app.use("/api", router);

// Only start a listening server locally.
// On Vercel, the exported app is invoked per-request by the serverless runtime.
if (process.env.NODE_ENV !== "production") {
    // Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
    app.listen(PORT, (err) => {
        if (err) {
            console.error(`Failed to start server on port ${PORT}: ${err.message}`);
            process.exit(1);
        }
        console.log(`Server running on port ${PORT}`);
    });
}

export default app;