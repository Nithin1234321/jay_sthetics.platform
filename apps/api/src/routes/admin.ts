import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { uploadDir } from "../utils/uploads.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);


const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/webm"];
    cb(null, allowed.includes(file.mimetype));
  }
});

async function audit(adminId: string, action: string, entityType: string, entityId?: string, metadata?: object) {
  await prisma.adminAuditLog.create({
    data: { adminId, action, entityType, entityId, metadata }
  });
}

// OVERVIEW
adminRouter.get("/overview", async (_req, res) => {
  const [clients, activeSubscriptions, leads, calls, checkIns, revenue, exercises] = await Promise.all([
    prisma.user.count({ where: { role: "CLIENT", isActive: true } }),
    prisma.subscription.count({ where: { status: "ACTIVE", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } }),
    prisma.lead.count({ where: { status: "NEW" } }),
    prisma.appointment.count({ where: { status: { in: ["REQUESTED", "CONFIRMED"] } } }),
    prisma.checkIn.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    prisma.payment.aggregate({ where: { status: "SUCCESS" }, _sum: { amountPaise: true } }),
    prisma.exercise.count({ where: { isActive: true } })
  ]);

  res.json({
    clients,
    activeSubscriptions,
    newLeads: leads,
    upcomingAppointments: calls,
    recentCheckIns: checkIns,
    revenuePaise: revenue._sum.amountPaise ?? 0,
    exercises
  });
});

// CLIENTS
adminRouter.get("/clients", async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const q = String(req.query.q ?? "").trim();
  const skip = (page - 1) * limit;

  const where: any = {
    role: "CLIENT",
    ...(q ? {
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } }
      ]
    } : {})
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, fullName: true, email: true, phone: true, isActive: true, createdAt: true,
        clientProfile: true,
        subscriptions: {
          include: { program: true },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" },
      skip, take: limit
    }),
    prisma.user.count({ where })
  ]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

adminRouter.get("/clients/:id", async (req, res) => {
  const client = await prisma.user.findFirst({
    where: { id: req.params.id, role: "CLIENT" },
    select: {
      id: true, fullName: true, email: true, phone: true, isActive: true, createdAt: true,
      clientProfile: true,
      subscriptions: { include: { program: true, payments: true }, orderBy: { createdAt: "desc" } },
      checkIns: { orderBy: { createdAt: "desc" }, take: 20 }
    }
  });
  if (!client) return res.status(404).json({ error: "Client not found" });

  const [workouts, nutrition, measurements, strength, payments, appointments, notes] = await Promise.all([
    prisma.workoutAssignment.findMany({
      where: { userId: client.id },
      include: { workoutPlan: true },
      orderBy: { assignedAt: "desc" }
    }),
    prisma.nutritionAssignment.findMany({
      where: { userId: client.id },
      include: { nutritionPlan: true },
      orderBy: { assignedAt: "desc" }
    }),
    prisma.progressMeasurement.findMany({
      where: { userId: client.id },
      orderBy: { measuredAt: "desc" },
      take: 100
    }),
    prisma.strengthRecord.findMany({ where: { userId: client.id }, orderBy: { performedAt: "desc" }, take: 100 }),
    prisma.payment.findMany({ where:{userId:client.id}, include:{subscription:{include:{program:true}}}, orderBy:{createdAt:"desc"}, take:100 }),
    prisma.appointment.findMany({ where:{OR:[{userId:client.id},{email:client.email}]}, orderBy:{preferredAt:"desc"}, take:100 }),
    prisma.coachNote.findMany({ where:{userId:client.id}, orderBy:{createdAt:"desc"}, take:100 })
  ]);

  res.json({ ...client, workouts, nutrition, measurements, strength, payments, appointments, notes });
});

adminRouter.post("/clients", async (req, res) => {
  const parsed = z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    phone: z.string().optional(),
    temporaryPassword: z.string().min(8),
    fitnessGoal: z.string().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const passwordHash = await bcrypt.hash(parsed.data.temporaryPassword, 12);
  const user = await prisma.user.create({
    data: {
      fullName: parsed.data.fullName,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone || null,
      passwordHash,
      clientProfile: { create: { fitnessGoal: parsed.data.fitnessGoal } }
    },
    select: { id: true, fullName: true, email: true }
  });

  await audit(req.auth!.sub, "CREATE", "CLIENT", user.id);
  res.status(201).json(user);
});

adminRouter.patch("/clients/:id/status", async (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const user = await prisma.user.update({ where: { id: req.params.id }, data: parsed.data });
  await audit(req.auth!.sub, "UPDATE_STATUS", "CLIENT", user.id, parsed.data);
  res.json({ id: user.id, isActive: user.isActive });
});

// PROGRAMMES / PRICING
adminRouter.get("/programs", async (_req, res) => {
  res.json(await prisma.program.findMany({ orderBy: [{ isActive: "desc" }, { pricePaise: "asc" }] }));
});

adminRouter.post("/programs", async (req, res) => {
  const parsed = z.object({
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    name: z.string().min(2),
    description: z.string().min(2),
    pricePaise: z.number().int().positive(),
    durationDays: z.number().int().positive().nullable().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const item = await prisma.program.create({ data: parsed.data });
  await audit(req.auth!.sub, "CREATE", "PROGRAM", item.id);
  res.status(201).json(item);
});

adminRouter.patch("/programs/:id", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2).optional(),
    description: z.string().min(2).optional(),
    pricePaise: z.number().int().positive().optional(),
    durationDays: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.program.update({ where: { id: req.params.id }, data: parsed.data });
  await audit(req.auth!.sub, "UPDATE", "PROGRAM", item.id, parsed.data);
  res.json(item);
});

// SUBSCRIPTIONS / ASSIGNMENT
adminRouter.post("/clients/:id/subscription", async (req, res) => {
  const parsed = z.object({
    programId: z.string().min(1),
    status: z.enum(["PENDING", "ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"]).default("ACTIVE")
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const program = await prisma.program.findUnique({ where: { id: parsed.data.programId } });
  if (!program) return res.status(404).json({ error: "Programme not found" });

  const startsAt = parsed.data.status === "ACTIVE" ? new Date() : null;
  const endsAt = startsAt && program.durationDays
    ? new Date(startsAt.getTime() + program.durationDays * 86400000)
    : null;

  const sub = await prisma.subscription.create({
    data: {
      userId: req.params.id,
      programId: program.id,
      status: parsed.data.status,
      startsAt,
      endsAt
    },
    include: { program: true }
  });
  await audit(req.auth!.sub, "ASSIGN", "SUBSCRIPTION", sub.id, { clientId: req.params.id });
  res.status(201).json(sub);
});

// EXERCISE LIBRARY + LOCAL DEV VIDEO UPLOAD
adminRouter.get("/exercises", async (_req, res) => {
  res.json(await prisma.exercise.findMany({
    include: { alternatives: { include: { alternativeExercise: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  }));
});

adminRouter.post("/exercise-video", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Video file required (.mp4/.mov/.webm)" });
  const publicUrl = `/api/media/${req.file.filename}`;
  res.status(201).json({
    videoUrl: publicUrl,
    originalName: req.file.originalname,
    size: req.file.size
  });
});

adminRouter.post("/exercises", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    muscleGroup: z.string().min(2),
    instructions: z.string().min(2),
    formCues: z.array(z.string()).default([]),
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  const item = await prisma.exercise.create({ data: parsed.data });
  await audit(req.auth!.sub, "CREATE", "EXERCISE", item.id);
  res.status(201).json(item);
});

adminRouter.patch("/exercises/:id", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2).optional(),
    muscleGroup: z.string().min(2).optional(),
    instructions: z.string().min(2).optional(),
    formCues: z.array(z.string()).optional(),
    videoUrl: z.string().nullable().optional(),
    isActive: z.boolean().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.exercise.update({ where: { id: req.params.id }, data: parsed.data });
  await audit(req.auth!.sub, "UPDATE", "EXERCISE", item.id);
  res.json(item);
});

adminRouter.post("/exercises/:id/alternatives", async (req, res) => {
  const parsed = z.object({ alternativeExerciseId: z.string(), reason: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.exerciseAlternative.upsert({
    where: { exerciseId_alternativeExerciseId: { exerciseId: req.params.id, alternativeExerciseId: parsed.data.alternativeExerciseId } },
    update: { reason: parsed.data.reason },
    create: { exerciseId: req.params.id, alternativeExerciseId: parsed.data.alternativeExerciseId, reason: parsed.data.reason }
  });
  res.status(201).json(item);
});

// WORKOUT PLANS
adminRouter.get("/workout-plans", async (_req, res) => {
  res.json(await prisma.workoutPlan.findMany({
    include: { exercises: { include: { exercise: true }, orderBy: [{ dayLabel: "asc" }, { position: "asc" }] } },
    orderBy: { updatedAt: "desc" }
  }));
});

adminRouter.post("/workout-plans", async (req, res) => {
  const parsed = z.object({ name: z.string().min(2), description: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.workoutPlan.create({ data: parsed.data });
  await audit(req.auth!.sub, "CREATE", "WORKOUT_PLAN", item.id);
  res.status(201).json(item);
});

adminRouter.post("/workout-plans/:id/exercises", async (req, res) => {
  const parsed = z.object({
    exerciseId: z.string(),
    dayLabel: z.string().min(1),
    position: z.number().int().positive(),
    sets: z.number().int().positive().optional(),
    reps: z.string().optional(),
    restSeconds: z.number().int().positive().optional(),
    notes: z.string().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const item = await prisma.workoutExercise.upsert({
    where: {
      workoutPlanId_dayLabel_position: {
        workoutPlanId: req.params.id,
        dayLabel: parsed.data.dayLabel,
        position: parsed.data.position
      }
    },
    update: parsed.data,
    create: { workoutPlanId: req.params.id, ...parsed.data }
  });
  res.status(201).json(item);
});

adminRouter.post("/clients/:id/workout", async (req, res) => {
  const parsed = z.object({ workoutPlanId: z.string(), notes: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.workoutAssignment.create({
    data: { userId: req.params.id, workoutPlanId: parsed.data.workoutPlanId, notes: parsed.data.notes }
  });
  res.status(201).json(item);
});

// NUTRITION
adminRouter.get("/nutrition-plans", async (_req, res) => {
  res.json(await prisma.nutritionPlan.findMany({
    include: { mealOptions: true },
    orderBy: { updatedAt: "desc" }
  }));
});

adminRouter.post("/nutrition-plans", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    calories: z.number().int().positive().optional(),
    proteinG: z.number().int().nonnegative().optional(),
    carbsG: z.number().int().nonnegative().optional(),
    fatsG: z.number().int().nonnegative().optional(),
    notes: z.string().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const item = await prisma.nutritionPlan.create({
    data: {
      name: parsed.data.name,
      calories: parsed.data.calories,
      proteinG: parsed.data.proteinG,
      carbsG: parsed.data.carbsG,
      fatsG: parsed.data.fatsG,
      content: { notes: parsed.data.notes ?? "" }
    }
  });
  res.status(201).json(item);
});

adminRouter.post("/nutrition-plans/:id/meal-options", async (req, res) => {
  const parsed = z.object({
    mealLabel: z.string().min(1),
    optionLabel: z.string().min(1),
    calories: z.number().int().optional(),
    proteinG: z.number().int().optional(),
    carbsG: z.number().int().optional(),
    fatsG: z.number().int().optional(),
    foods: z.array(z.string()).min(1)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { foods, ...rest } = parsed.data;
  const item = await prisma.mealOption.create({
    data: { nutritionPlanId: req.params.id, ...rest, foods }
  });
  res.status(201).json(item);
});

adminRouter.post("/clients/:id/nutrition", async (req, res) => {
  const parsed = z.object({ nutritionPlanId: z.string(), notes: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.nutritionAssignment.create({
    data: { userId: req.params.id, nutritionPlanId: parsed.data.nutritionPlanId, notes: parsed.data.notes }
  });
  res.status(201).json(item);
});

// CHECK-INS
adminRouter.get("/check-ins", async (_req, res) => {
  res.json(await prisma.checkIn.findMany({
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 250
  }));
});

// CALLS
adminRouter.get("/appointments", async (_req, res) => {
  res.json(await prisma.appointment.findMany({ orderBy: { preferredAt: "asc" }, take: 250 }));
});

adminRouter.patch("/appointments/:id", async (req, res) => {
  const parsed = z.object({
    status: z.enum(["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED"]),
    meetingUrl: z.string().url().nullable().optional(),
    preferredAt: z.string().datetime().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.appointment.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      meetingUrl: parsed.data.meetingUrl,
      preferredAt: parsed.data.preferredAt ? new Date(parsed.data.preferredAt) : undefined
    }
  });
  res.json(item);
});

// MESSAGES
adminRouter.get("/conversations", async (_req, res) => {
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" }
  });
  res.json(clients);
});

// PAYMENTS
adminRouter.get("/payments", async (_req, res) => {
  res.json(await prisma.payment.findMany({
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      subscription: { include: { program: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 500
  }));
});

// COACH AVAILABILITY
adminRouter.get("/availability", async (_req, res) => {
  res.json(await prisma.coachAvailability.findMany({ orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }));
});

adminRouter.post("/availability", async (req, res) => {
  const parsed = z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().default("Asia/Kolkata")
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.coachAvailability.create({ data: parsed.data });
  res.status(201).json(item);
});

adminRouter.patch("/availability/:id", async (req, res) => {
  const parsed = z.object({
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    isActive: z.boolean().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  res.json(await prisma.coachAvailability.update({ where: { id: req.params.id }, data: parsed.data }));
});

// V5 — individual client management
adminRouter.patch("/clients/:id/profile", async (req,res)=>{
 const x=z.object({fullName:z.string().min(2),phone:z.string().min(5),dateOfBirth:z.string().min(1),heightCm:z.number().positive(),currentWeightKg:z.number().positive(),fitnessGoal:z.string().min(2),trainingExperience:z.string().min(1)}).safeParse(req.body);
 if(!x.success)return res.status(400).json({error:"Complete all client details."}); const d=x.data;
 const user=await prisma.user.update({where:{id:req.params.id},data:{fullName:d.fullName,phone:d.phone,clientProfile:{upsert:{create:{dateOfBirth:new Date(d.dateOfBirth),heightCm:d.heightCm,currentWeightKg:d.currentWeightKg,fitnessGoal:d.fitnessGoal,trainingExperience:d.trainingExperience,onboardingComplete:true},update:{dateOfBirth:new Date(d.dateOfBirth),heightCm:d.heightCm,currentWeightKg:d.currentWeightKg,fitnessGoal:d.fitnessGoal,trainingExperience:d.trainingExperience,onboardingComplete:true}}}}});
 await audit(req.auth!.sub,"UPDATE_CLIENT_PROFILE","CLIENT",user.id); res.json({ok:true});
});
adminRouter.get("/clients/:id/notes",async(req,res)=>res.json(await prisma.coachNote.findMany({where:{userId:req.params.id},orderBy:{createdAt:"desc"}})));
adminRouter.post("/clients/:id/notes",async(req,res)=>{const x=z.object({body:z.string().min(1).max(5000)}).safeParse(req.body);if(!x.success)return res.status(400).json({error:"Note required"});res.status(201).json(await prisma.coachNote.create({data:{userId:req.params.id,adminId:req.auth!.sub,body:x.data.body}}))});


// LEADS V8
adminRouter.get("/leads", async (_req,res) => {
  res.json(await prisma.lead.findMany({orderBy:{createdAt:"desc"},take:500}));
});
adminRouter.patch("/leads/:id", async (req,res) => {
  const parsed=z.object({status:z.enum(["NEW","CONTACTED","INTERESTED","CONVERTED","NOT_INTERESTED"])}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid lead status"});
  res.json(await prisma.lead.update({where:{id:req.params.id},data:parsed.data}));
});
