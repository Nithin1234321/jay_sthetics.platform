import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const leadsRouter = Router();

const schema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  fitnessGoal: z.string().max(500).optional(),
  message: z.string().max(3000).optional()
});

leadsRouter.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const lead = await prisma.lead.create({ data: parsed.data });
  res.status(201).json({ id: lead.id, status: lead.status });
});
