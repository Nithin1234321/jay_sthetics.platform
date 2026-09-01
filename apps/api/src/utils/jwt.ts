import jwt from "jsonwebtoken";
import { config } from "../config.js";

export type TokenPayload = { sub: string; role: "ADMIN" | "CLIENT"; email: string };

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
}
