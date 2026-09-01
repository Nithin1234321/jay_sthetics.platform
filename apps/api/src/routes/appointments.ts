import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const appointmentsRouter = Router();

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  preferredAt: z.string().datetime(),
  reason: z.string().max(1500).optional()
});

appointmentsRouter.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const appointment = await prisma.appointment.create({
    data: { ...parsed.data, preferredAt: new Date(parsed.data.preferredAt) }
  });

  res.status(201).json(appointment);
});
