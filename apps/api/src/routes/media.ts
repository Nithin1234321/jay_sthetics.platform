import { Router } from "express";
import fs from "fs";
import { requireAuth } from "../middleware/auth.js";
import { requireActiveSubscription } from "../middleware/subscription.js";
import { safeUploadPath } from "../utils/uploads.js";

export const mediaRouter = Router();
mediaRouter.use(requireAuth, requireActiveSubscription);

mediaRouter.get("/:filename", async (req, res) => {
  const fullPath = safeUploadPath(req.params.filename);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Media not found" });
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(fullPath);
});
