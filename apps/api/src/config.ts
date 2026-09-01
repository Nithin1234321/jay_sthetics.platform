import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  TRUST_PROXY: z.string().optional(),
  UPLOAD_DIR: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_INITIAL_PASSWORD: z.string().min(10).optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  COACH_PHONE_NUMBER: z.string().optional(),
  DEV_MOCK_PAYMENTS: z.string().optional()
});

export const config = schema.parse(process.env);

if (config.NODE_ENV === "production") {
  if (config.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production.");
  }
  if (config.DEV_MOCK_PAYMENTS === "true") {
    throw new Error("DEV_MOCK_PAYMENTS must not be enabled in production.");
  }
}
