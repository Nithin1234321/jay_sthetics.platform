import { Router } from "express";
import fs from "fs";
import { requireAuth } from "../middleware/auth.js";
import { requireActiveSubscription } from "../middleware/subscription.js";
import { safeUploadPath } from "../utils/uploads.js";

export const mediaRouter = Router();
mediaRouter.use(requireAuth, requireActiveSubscription);

function detectMime(fullPath: string) {
  const fd = fs.openSync(fullPath, "r");
  const buffer = Buffer.alloc(32);

  try {
    fs.readSync(fd, buffer, 0, buffer.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  // JPEG
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // WebP
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  // WebM
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm";
  }

  // MP4 / MOV family
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);

    if (
      brand === "qt  "
    ) {
      return "video/quicktime";
    }

    return "video/mp4";
  }

  // PDF
  if (buffer.toString("ascii", 0, 4) === "%PDF") {
    return "application/pdf";
  }

  return "application/octet-stream";
}

mediaRouter.get("/:filename", async (req, res) => {
  const fullPath = safeUploadPath(req.params.filename);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Media not found" });
  }

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;
  const mime = detectMime(fullPath);
  const range = req.headers.range;

  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", mime);

  if (mime.startsWith("video/")) {
    res.setHeader("Accept-Ranges", "bytes");
  }

  if (range && mime.startsWith("video/")) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);

    if (!match) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    const start = match[1]
      ? Number(match[1])
      : 0;

    const end = match[2]
      ? Math.min(Number(match[2]), fileSize - 1)
      : fileSize - 1;

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start > end ||
      start >= fileSize
    ) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader(
      "Content-Range",
      `bytes ${start}-${end}/${fileSize}`
    );
    res.setHeader("Content-Length", String(chunkSize));

    return fs.createReadStream(fullPath, {
      start,
      end
    }).pipe(res);
  }

  res.setHeader("Content-Length", String(fileSize));

  return fs.createReadStream(fullPath).pipe(res);
});
