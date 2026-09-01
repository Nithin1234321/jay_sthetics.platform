import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { programsRouter } from "./routes/programs.js";
import { leadsRouter } from "./routes/leads.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { messagesRouter } from "./routes/messages.js";
import { adminRouter } from "./routes/admin.js";
import { paymentsRouter, razorpayWebhookHandler } from "./routes/payments.js";
import { healthRouter } from "./routes/health.js";
import { clientRouter } from "./routes/client.js";
import { mediaRouter } from "./routes/media.js";

export const app = express();

app.disable("x-powered-by");
if(config.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(helmet({crossOriginResourcePolicy:{policy:"same-site"}}));
const origins=config.WEB_ORIGIN.split(",").map(x=>x.trim()).filter(Boolean);
app.use(cors({origin:(origin,cb)=>!origin||origins.includes(origin)?cb(null,true):cb(new Error("Origin not allowed by CORS")),credentials:false}));
app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }), razorpayWebhookHandler);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));
app.use("/api", rateLimit({windowMs:60_000,limit:300,standardHeaders:"draft-7",legacyHeaders:false}));

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/programs", programsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/client", clientRouter);
app.use("/api/media", mediaRouter);
app.use("/api/payments", paymentsRouter);
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
