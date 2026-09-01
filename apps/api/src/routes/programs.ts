import { Router } from "express";
import { prisma } from "../db.js";

export const programsRouter = Router();

programsRouter.get("/", async (_req, res) => {
  const programs = await prisma.program.findMany({
    where: { isActive: true },
    orderBy: { pricePaise: "asc" }
  });
  res.json(programs);
});
