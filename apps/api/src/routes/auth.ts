import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { signToken } from "../utils/jwt.js";
import { config } from "../config.js";
import { sendAuthCode } from "../services/email.js";

export const authRouter = Router();

type Purpose = "EMAIL_VERIFY" | "PASSWORD_RESET" | "ADMIN_LOGIN";

const registerSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.preprocess(v => v === "" || v == null ? undefined : v, z.string().min(7).max(20).optional()),
  password: z.string().min(8).max(100)
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== "production",
  message: { error: "Too many login attempts. Try again in about 15 minutes." }
});

const codeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== "production",
  message: { error: "Too many verification requests. Try again later." }
});

function hashCode(email:string,purpose:Purpose,code:string){
  return crypto.createHash("sha256").update(`${email.toLowerCase()}|${purpose}|${code}|${config.JWT_SECRET}`).digest("hex");
}

function devCode(code:string){
  return process.env.NODE_ENV === "production" ? undefined : code;
}

async function issueCode(email:string,purpose:Purpose,userId?:string){
  const normalized=email.toLowerCase();
  await prisma.authCode.updateMany({
    where:{email:normalized,purpose,usedAt:null},
    data:{usedAt:new Date()}
  });
  const code=String(crypto.randomInt(100000,1000000));
  await prisma.authCode.create({
    data:{
      email:normalized,
      purpose,
      codeHash:hashCode(normalized,purpose,code),
      expiresAt:new Date(Date.now()+10*60*1000)
    }
  });
  await sendAuthCode(normalized, code, purpose);
  return code;
}

async function consumeCode(email:string,purpose:Purpose,code:string){
  const normalized=email.toLowerCase();
  const record=await prisma.authCode.findFirst({
    where:{email:normalized,purpose,usedAt:null,expiresAt:{gt:new Date()}},
    orderBy:{createdAt:"desc"}
  });
  if(!record)return false;
  if(record.attempts>=5){
    await prisma.authCode.update({where:{id:record.id},data:{usedAt:new Date()}});
    return false;
  }
  const valid=crypto.timingSafeEqual(
    Buffer.from(record.codeHash),
    Buffer.from(hashCode(normalized,purpose,code))
  );
  if(!valid){
    await prisma.authCode.update({where:{id:record.id},data:{attempts:{increment:1}}});
    return false;
  }
  await prisma.authCode.update({where:{id:record.id},data:{usedAt:new Date()}});
  return true;
}

function publicUser(user:{id:string;fullName:string;email:string;role:"ADMIN"|"CLIENT"}){
  return {id:user.id,fullName:user.fullName,email:user.email,role:user.role};
}

authRouter.post("/register", codeLimiter, async (req,res) => {
  const parsed=registerSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid input",details:parsed.error.flatten()});

  const {fullName,email,phone,password}=parsed.data;
  const normalized=email.toLowerCase();
  const exists=await prisma.user.findUnique({where:{email:normalized}});
  if(exists){
    if(!exists.emailVerifiedAt){
      const code=await issueCode(normalized,"EMAIL_VERIFY",exists.id);
      return res.json({
        message:"This email already has an account awaiting verification.",
        requiresVerification:true,
        email:normalized,
        devCode:devCode(code)
      });
    }
    return res.status(409).json({error:"Email already registered"});
  }

  const passwordHash=await bcrypt.hash(password,12);
  const user=await prisma.user.create({
    data:{fullName,email:normalized,phone,passwordHash,clientProfile:{create:{}}},
    select:{id:true,fullName:true,email:true,role:true}
  });
  const code=await issueCode(normalized,"EMAIL_VERIFY",user.id);
  return res.status(201).json({
    requiresVerification:true,
    email:normalized,
    message:"Verify your email to activate the account.",
    devCode:devCode(code)
  });
});

authRouter.post("/register/verify", codeLimiter, async (req,res) => {
  const parsed=z.object({email:z.string().email(),code:z.string().regex(/^\d{6}$/)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a valid 6-digit verification code."});
  const normalized=parsed.data.email.toLowerCase();
  const user=await prisma.user.findUnique({where:{email:normalized}});
  if(!user)return res.status(404).json({error:"Account not found"});
  if(user.emailVerifiedAt){
    const token=signToken({sub:user.id,role:user.role,email:user.email});
    return res.json({token,user:publicUser(user)});
  }
  if(!(await consumeCode(normalized,"EMAIL_VERIFY",parsed.data.code))){
    return res.status(400).json({error:"Verification code is invalid or expired."});
  }
  const verified=await prisma.user.update({where:{id:user.id},data:{emailVerifiedAt:new Date()}});
  const token=signToken({sub:verified.id,role:verified.role,email:verified.email});
  return res.json({token,user:publicUser(verified)});
});

authRouter.post("/verification/resend", codeLimiter, async (req,res) => {
  const parsed=z.object({email:z.string().email()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid email"});
  const normalized=parsed.data.email.toLowerCase();
  const user=await prisma.user.findUnique({where:{email:normalized}});
  if(user && !user.emailVerifiedAt){
    const code=await issueCode(normalized,"EMAIL_VERIFY",user.id);
    return res.json({message:"A new verification code was generated.",devCode:devCode(code)});
  }
  return res.json({message:"If verification is required, a new code will be sent."});
});

authRouter.post("/login", loginLimiter, async (req,res) => {
  const parsed=z.object({
    email:z.string().email(),
    password:z.string().min(1),
    adminCode:z.string().regex(/^\d{6}$/).optional()
  }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid input"});

  const normalized=parsed.data.email.toLowerCase();
  const user=await prisma.user.findUnique({where:{email:normalized}});
  if(!user || !user.isActive || !(await bcrypt.compare(parsed.data.password,user.passwordHash))){
    return res.status(401).json({error:"Invalid credentials"});
  }

  if(!user.emailVerifiedAt){
    const code=await issueCode(user.email,"EMAIL_VERIFY",user.id);
    return res.json({
      message:"Email verification required.",
      requiresEmailVerification:true,
      email:user.email,
      devCode:devCode(code)
    });
  }

  if(user.role==="ADMIN"){
    if(!parsed.data.adminCode){
      const code=await issueCode(user.email,"ADMIN_LOGIN",user.id);
      return res.json({
        requires2FA:true,
        message:"Enter the admin verification code to continue.",
        devCode:devCode(code)
      });
    }
    if(!(await consumeCode(user.email,"ADMIN_LOGIN",parsed.data.adminCode))){
      return res.status(401).json({error:"Admin verification code is invalid or expired."});
    }
  }

  const token=signToken({sub:user.id,role:user.role,email:user.email});
  return res.json({token,user:publicUser(user)});
});

authRouter.post("/password/request", codeLimiter, async (req,res) => {
  const parsed=z.object({email:z.string().email()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid email"});
  const normalized=parsed.data.email.toLowerCase();
  const user=await prisma.user.findUnique({where:{email:normalized}});
  if(!user)return res.json({message:"If the account exists, a reset code will be sent."});
  const code=await issueCode(normalized,"PASSWORD_RESET",user.id);
  return res.json({message:"Password reset code generated.",devCode:devCode(code)});
});

authRouter.post("/password/reset", codeLimiter, async (req,res) => {
  const parsed=z.object({
    email:z.string().email(),code:z.string().regex(/^\d{6}$/),password:z.string().min(8).max(100)
  }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid reset request"});
  const normalized=parsed.data.email.toLowerCase();
  const user=await prisma.user.findUnique({where:{email:normalized}});
  if(!user || !(await consumeCode(normalized,"PASSWORD_RESET",parsed.data.code))){
    return res.status(400).json({error:"Reset code is invalid or expired."});
  }
  const passwordHash=await bcrypt.hash(parsed.data.password,12);
  await prisma.user.update({where:{id:user.id},data:{passwordHash,emailVerifiedAt:user.emailVerifiedAt??new Date()}});
  return res.json({message:"Password updated. You can sign in now."});
});
