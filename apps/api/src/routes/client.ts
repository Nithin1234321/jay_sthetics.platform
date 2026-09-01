import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { uploadDir } from "../utils/uploads.js";
import { requireAuth } from "../middleware/auth.js";
import { requireActiveSubscription } from "../middleware/subscription.js";

export const clientRouter = Router();
clientRouter.use(requireAuth);

const photoUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 15 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg","image/png","image/webp"].includes(file.mimetype))
});

clientRouter.get("/dashboard", async (req,res) => {
  const base = await prisma.user.findUnique({
    where:{id:req.auth!.sub},
    select:{id:true,fullName:true,email:true,phone:true,clientProfile:true,checkIns:{orderBy:{createdAt:"desc"},take:5}}
  });
  if (!base) return res.status(404).json({error:"User not found"});

  const active = await prisma.subscription.findFirst({
    where:{userId:req.auth!.sub,status:"ACTIVE",OR:[{endsAt:null},{endsAt:{gt:new Date()}}]},
    include:{program:true},
    orderBy:{createdAt:"desc"}
  });
  const latest = active ?? await prisma.subscription.findFirst({
    where:{userId:req.auth!.sub},
    include:{program:true},
    orderBy:{createdAt:"desc"}
  });
  res.json({...base,subscriptions:latest?[latest]:[]});
});

clientRouter.get("/onboarding", async (req,res) => {
  res.json(await prisma.user.findUnique({
    where:{id:req.auth!.sub},
    select:{id:true,fullName:true,email:true,phone:true,clientProfile:true}
  }));
});

clientRouter.patch("/onboarding", async (req,res) => {
  const x=z.object({
    dateOfBirth:z.string().min(1),
    heightCm:z.number().positive(),
    weightKg:z.number().positive(),
    fitnessGoal:z.string().min(2),
    trainingExperience:z.string().min(1),
    phone:z.string().min(5)
  }).safeParse(req.body);
  if(!x.success)return res.status(400).json({error:"Complete all onboarding details."});
  const d=x.data;
  res.json(await prisma.user.update({
    where:{id:req.auth!.sub},
    data:{
      phone:d.phone,
      clientProfile:{upsert:{
        create:{dateOfBirth:new Date(d.dateOfBirth),heightCm:d.heightCm,currentWeightKg:d.weightKg,fitnessGoal:d.fitnessGoal,trainingExperience:d.trainingExperience,onboardingComplete:true},
        update:{dateOfBirth:new Date(d.dateOfBirth),heightCm:d.heightCm,currentWeightKg:d.weightKg,fitnessGoal:d.fitnessGoal,trainingExperience:d.trainingExperience,onboardingComplete:true}
      }}
    },
    select:{id:true,fullName:true,email:true,phone:true,clientProfile:true}
  }));
});

// All routes below require an active paid/manual coaching subscription.
clientRouter.use(requireActiveSubscription);

clientRouter.get("/training", async (req,res) => {
  res.json(await prisma.workoutAssignment.findMany({
    where:{userId:req.auth!.sub},
    include:{workoutPlan:{include:{exercises:{include:{exercise:{include:{alternatives:{include:{alternativeExercise:true}}}}},orderBy:[{dayLabel:"asc"},{position:"asc"}]}}}},
    orderBy:{assignedAt:"desc"}
  }));
});

clientRouter.get("/nutrition", async (req,res) => {
  res.json(await prisma.nutritionAssignment.findMany({
    where:{userId:req.auth!.sub},
    include:{nutritionPlan:{include:{mealOptions:true}}},
    orderBy:{assignedAt:"desc"}
  }));
});

clientRouter.get("/progress", async (req,res) => {
  const [measurements,strength,checkIns]=await Promise.all([
    prisma.progressMeasurement.findMany({where:{userId:req.auth!.sub},orderBy:{measuredAt:"asc"}}),
    prisma.strengthRecord.findMany({where:{userId:req.auth!.sub},orderBy:{performedAt:"asc"}}),
    prisma.checkIn.findMany({where:{userId:req.auth!.sub},orderBy:{createdAt:"asc"}})
  ]);
  res.json({measurements,strength,checkIns});
});

clientRouter.get("/availability", async (_req,res) => {
  res.json(await prisma.coachAvailability.findMany({where:{isActive:true},orderBy:[{dayOfWeek:"asc"},{startTime:"asc"}]}));
});

clientRouter.get("/coach", async (_req,res) => {
  const coach=await prisma.user.findFirst({
    where:{role:"ADMIN",isActive:true},
    select:{id:true,fullName:true,email:true}
  });
  if(!coach)return res.status(404).json({error:"Coach account not found"});
  res.json(coach);
});

clientRouter.get("/calls", async (req,res) => {
  res.json(await prisma.appointment.findMany({
    where:{userId:req.auth!.sub},
    orderBy:{preferredAt:"desc"},
    take:100
  }));
});

clientRouter.post("/calls", async (req,res) => {
  const parsed=z.object({
    preferredAt:z.string().datetime(),
    reason:z.string().max(1500).optional()
  }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid call request"});

  const preferredAt=new Date(parsed.data.preferredAt);
  const formatter=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false});
  const parts=formatter.formatToParts(preferredAt);
  const weekday=parts.find(p=>p.type==="weekday")?.value;
  const hour=parts.find(p=>p.type==="hour")?.value ?? "00";
  const minute=parts.find(p=>p.type==="minute")?.value ?? "00";
  const dayMap:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const dayOfWeek=dayMap[weekday ?? ""] ?? -1;
  const time=`${hour}:${minute}`;

  const allowed=await prisma.coachAvailability.findFirst({
    where:{dayOfWeek,isActive:true,startTime:{lte:time},endTime:{gte:time}}
  });
  if(!allowed)return res.status(400).json({error:"Choose a time inside Jay's available coaching hours."});

  const user=await prisma.user.findUnique({where:{id:req.auth!.sub}});
  if(!user)return res.status(404).json({error:"User not found"});
  const item=await prisma.appointment.create({
    data:{
      userId:user.id,fullName:user.fullName,email:user.email,phone:user.phone,
      preferredAt,reason:parsed.data.reason,status:"REQUESTED"
    }
  });
  res.status(201).json(item);
});

clientRouter.get("/call-info", async (_req,res) => {
  if(!config.COACH_PHONE_NUMBER)return res.json({availableNow:false,phone:null,reason:"Direct call number is not configured yet."});

  const now=new Date();
  const formatter=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false});
  const parts=formatter.formatToParts(now);
  const weekday=parts.find(p=>p.type==="weekday")?.value;
  const hour=parts.find(p=>p.type==="hour")?.value ?? "00";
  const minute=parts.find(p=>p.type==="minute")?.value ?? "00";
  const dayMap:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const dayOfWeek=dayMap[weekday ?? ""] ?? -1;
  const time=`${hour}:${minute}`;
  const allowed=await prisma.coachAvailability.findFirst({
    where:{dayOfWeek,isActive:true,startTime:{lte:time},endTime:{gte:time}}
  });
  res.json({
    availableNow:!!allowed,
    phone:allowed?config.COACH_PHONE_NUMBER:null,
    reason:allowed?null:"Direct calls are available only during Jay's configured coaching hours."
  });
});

clientRouter.post("/check-in-photos", photoUpload.array("photos",3), async (req,res) => {
  const files=(req.files as Express.Multer.File[]|undefined) ?? [];
  if(!files.length)return res.status(400).json({error:"Choose at least one photo"});
  res.status(201).json({
    photoUrls:files.map(f=>`/api/media/${f.filename}`)
  });
});

clientRouter.post("/check-ins", async (req,res) => {
  const parsed=z.object({
    weightKg:z.number().positive().optional(),
    bodyFat:z.number().positive().optional(),
    sleepHours:z.number().min(0).max(24).optional(),
    energyLevel:z.number().int().min(1).max(10).optional(),
    dietAdherence:z.number().int().min(0).max(100).optional(),
    trainingPerformance:z.enum(["BETTER","SAME","WORSE"]).optional(),
    stepsCardio:z.string().max(500).optional(),
    issues:z.string().max(2000).optional(),
    questions:z.string().max(2000).optional(),
    notes:z.string().max(4000).optional(),
    photoUrls:z.array(z.string()).max(3).default([])
  }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid check-in information"});
  const item=await prisma.checkIn.create({data:{userId:req.auth!.sub,...parsed.data}});
  if(parsed.data.weightKg){
    await prisma.user.update({
      where:{id:req.auth!.sub},
      data:{clientProfile:{upsert:{create:{currentWeightKg:parsed.data.weightKg},update:{currentWeightKg:parsed.data.weightKg}}}}
    });
  }
  res.status(201).json(item);
});
