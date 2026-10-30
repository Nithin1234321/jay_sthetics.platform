import { Router } from "express";
import fs from "fs";
import crypto from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import { requireActiveSubscription } from "../middleware/subscription.js";
import { safeUploadPath } from "../utils/uploads.js";

export const mediaRouter = Router();

function createMediaToken(
  filename:string,
  userId:string,
  role:"ADMIN"|"CLIENT"
){
  const exp = Date.now() + 2 * 60 * 60 * 1000;

  const payload = Buffer.from(
    JSON.stringify({
      filename,
      userId,
      role,
      exp
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", config.JWT_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function mediaTokenAuth(req:any,res:any,next:any){
  const token = String(req.query.mt || "");

  if(!token){
    return requireAuth(req,res,next);
  }

  const parts = token.split(".");

  if(parts.length !== 2){
    return res.status(401).json({error:"Invalid media token"});
  }

  const [payload,signature] = parts;

  const expected = crypto
    .createHmac("sha256", config.JWT_SECRET)
    .update(payload)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if(
    a.length !== b.length ||
    !crypto.timingSafeEqual(a,b)
  ){
    return res.status(401).json({error:"Invalid media token"});
  }

  try{
    const parsed = JSON.parse(
      Buffer.from(payload,"base64url").toString("utf8")
    );

    if(
      parsed.filename !== req.params.filename ||
      !parsed.userId ||
      !parsed.role ||
      parsed.exp < Date.now()
    ){
      return res.status(401).json({error:"Expired media token"});
    }

    req.auth = {
      sub: parsed.userId,
      role: parsed.role,
      email: ""
    };

    return next();
  }catch{
    return res.status(401).json({error:"Invalid media token"});
  }
}

mediaRouter.get(
  "/:filename/access",
  requireAuth,
  requireActiveSubscription,
  async (req,res)=>{
    const filename = String(req.params.filename);
    const fullPath = safeUploadPath(filename);

    if(!fs.existsSync(fullPath)){
      return res.status(404).json({error:"Media not found"});
    }

    const token = createMediaToken(
      filename,
      req.auth!.sub,
      req.auth!.role
    );

    return res.json({token});
  }
);

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

mediaRouter.get(
  "/:filename",
  mediaTokenAuth,
  requireActiveSubscription,
  async (req, res) => {
  const filename = String(req.params.filename);
  const fullPath = safeUploadPath(filename);

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
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());

    if (!match) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    let start:number;
    let end:number;

    const startText = match[1];
    const endText = match[2];

    // Safari can request suffix ranges such as: bytes=-500
    if (!startText && endText) {
      const suffixLength = Number(endText);

      if (
        Number.isNaN(suffixLength) ||
        suffixLength <= 0
      ) {
        res.status(416);
        res.setHeader("Content-Range", `bytes */${fileSize}`);
        return res.end();
      }

      start = Math.max(fileSize - suffixLength, 0);
      end = fileSize - 1;
    } else {
      start = startText ? Number(startText) : 0;
      end = endText
        ? Math.min(Number(endText), fileSize - 1)
        : fileSize - 1;
    }

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start < 0 ||
      end < start ||
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
