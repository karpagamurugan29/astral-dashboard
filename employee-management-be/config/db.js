import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

mongoose.set("strictQuery", false);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed");
    console.error(error.message);
    // IMPORTANT: never call process.exit() here.
    // On Vercel's serverless runtime, this kills the whole function process
    // and causes every single request to crash with a 500 error,
    // even ones that don't need the database.
    // Instead, just log the error and let individual requests fail naturally
    // if they try to use a model before the connection is ready.
  }
};

export default connectDB;