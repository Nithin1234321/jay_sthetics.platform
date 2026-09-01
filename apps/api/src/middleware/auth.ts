import type { NextFunction, Request, Response } from "express";
import { verifyToken, type TokenPayload } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });

  try {
    req.auth = verifyToken(header.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "ADMIN") return res.status(403).json({ error: "Admin access required" });
  next();
}
