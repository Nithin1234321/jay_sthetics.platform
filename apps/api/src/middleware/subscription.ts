import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
export async function requireActiveSubscription(req:Request,res:Response,next:NextFunction){
  if(!req.auth) return res.status(401).json({error:"Unauthorized"});
  if(req.auth.role==="ADMIN") return next();
  const sub=await prisma.subscription.findFirst({where:{userId:req.auth.sub,status:"ACTIVE",OR:[{endsAt:null},{endsAt:{gt:new Date()}}]}});
  if(!sub) return res.status(403).json({error:"Active coaching subscription required",code:"SUBSCRIPTION_REQUIRED"});
  next();
}
