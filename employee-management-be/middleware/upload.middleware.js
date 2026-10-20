import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel's filesystem is READ-ONLY everywhere except /tmp.
// Trying to mkdir anywhere else (like the project folder) crashes
// the entire serverless function on startup.
// process.env.VERCEL is automatically set to "1" on Vercel's runtime.
const uploadDir = process.env.VERCEL
    ? "/tmp/uploads"
    : path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}-${file.originalname.replace(/\s+/g, "_")}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export default upload;