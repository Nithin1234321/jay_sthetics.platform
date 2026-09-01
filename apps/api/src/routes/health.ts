import { Router } from "express";
import { prisma } from "../db.js";

export const healthRouter = Router();
healthRouter.get("/", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, service: "jay-aesthetics-api", time: new Date().toISOString() });
});
