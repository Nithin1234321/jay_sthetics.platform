import path from "path";
import fs from "fs";
import { config } from "../config.js";

export const uploadDir = path.resolve(config.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
fs.mkdirSync(uploadDir, { recursive: true });

export function safeUploadPath(filename: string) {
  return path.join(uploadDir, path.basename(filename));
}
