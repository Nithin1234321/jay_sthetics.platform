import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { uploadDir, safeUploadPath } from "../utils/uploads.js";
import { JAY_DIET_LIBRARY } from "../data/dietLibrary.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);


const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();

    const allowedMimeTypes = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-m4v",
      "video/m4v",
      "application/octet-stream"
    ];

    const allowedExtensions = [
      ".mp4",
      ".mov",
      ".m4v",
      ".webm"
    ];

    const validMime =
      file.mimetype.startsWith("video/") ||
      allowedMimeTypes.includes(file.mimetype);

    const validExtension = allowedExtensions.includes(extension);

    cb(null, validMime && validExtension);
  }
});

const pdfUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "application/pdf");
  }
});


async function convertExerciseVideo(inputPath: string) {
  const ffmpegPath =
    typeof ffmpegStatic === "string"
      ? ffmpegStatic
      : (ffmpegStatic as any)?.default;

  if (!ffmpegPath || typeof ffmpegPath !== "string") {
    throw new Error("FFmpeg binary unavailable");
  }

  const outputFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
  const outputPath = path.join(uploadDir, outputFilename);

  await new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,

      // Keep aspect ratio, cap at 1080p, never upscale.
      "-vf",
      "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease,fps=30,format=yuv420p",

      // Browser-safe H.264 video.
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-profile:v", "high",
      "-level:v", "4.1",
      "-pix_fmt", "yuv420p",

      // Browser-safe AAC audio.
      "-c:a", "aac",
      "-b:a", "192k",

      // Improves web/mobile startup.
      "-movflags", "+faststart",

      outputPath
    ];

    const proc = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

    let errorText = "";

    proc.stderr?.on("data", (chunk: Buffer) => {
      errorText += chunk.toString();
    });

    proc.on("error", reject);

    proc.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Video conversion failed with code ${code}: ${errorText.slice(-2000)}`
          )
        );
      }
    });
  });

  return {
    filename: outputFilename,
    path: outputPath,
    size: fs.statSync(outputPath).size
  };
}

async function audit(adminId: string, action: string, entityType: string, entityId?: string, metadata?: object) {
  await prisma.adminAuditLog.create({
    data: { adminId, action, entityType, entityId, metadata }
  });
}

// OVERVIEW
adminRouter.get("/overview", async (_req, res) => {
  const [
    clients,
    leads,
    calls,
    checkIns,
    revenue,
    exercises,
    manualCreateLogs
  ] = await Promise.all([
    prisma.user.count({
      where:{
        role:"CLIENT",
        isActive:true
      }
    }),

    prisma.lead.count({
      where:{status:"NEW"}
    }),

    prisma.appointment.count({
      where:{
        status:{
          in:["REQUESTED","CONFIRMED"]
        }
      }
    }),

    prisma.checkIn.count({
      where:{
        createdAt:{
          gte:new Date(
            Date.now()-7*86400000
          )
        }
      }
    }),

    prisma.payment.aggregate({
      where:{status:"SUCCESS"},
      _sum:{amountPaise:true}
    }),

    prisma.exercise.count({
      where:{isActive:true}
    }),

    prisma.adminAuditLog.findMany({
      where:{
        action:"CREATE",
        entityType:"CLIENT",
        entityId:{
          not:null
        }
      },

      select:{
        entityId:true
      }
    })
  ]);


  const manualClientIds=[
    ...new Set(
      manualCreateLogs
        .map(x=>x.entityId)
        .filter(
          (id):id is string=>!!id
        )
    )
  ];


  const manualClients=manualClientIds.length
    ?await prisma.user.findMany({
        where:{
          id:{
            in:manualClientIds
          },

          role:"CLIENT",

          payments:{
            none:{
              status:"SUCCESS"
            }
          }
        },

        select:{
          id:true,
          fullName:true,
          email:true,
          createdAt:true,
          isActive:true
        },

        orderBy:{
          createdAt:"desc"
        }
      })
    :[];


  const manualUnpaidClientIds=
    manualClients.map(client=>client.id);


  const subscriptionCandidates=
    await prisma.user.findMany({
      where:{
        role:"CLIENT",
        isActive:true,

        ...(manualUnpaidClientIds.length
          ?{
              id:{
                notIn:manualUnpaidClientIds
              }
            }
          :{}
        )
      },

      select:{
        id:true,

        subscriptions:{
          orderBy:{
            createdAt:"desc"
          },

          take:1,

          select:{
            status:true,
            endsAt:true
          }
        }
      }
    });


  const now=new Date();

  const activeSubscriptions=
    subscriptionCandidates.filter(client=>{
      const latest=client.subscriptions[0];

      if(!latest){
        return false;
      }

      if(latest.status!=="ACTIVE"){
        return false;
      }

      if(
        latest.endsAt &&
        latest.endsAt<=now
      ){
        return false;
      }

      return true;
    }).length;


  res.json({
    clients,
    activeSubscriptions,
    newLeads:leads,
    upcomingAppointments:calls,
    recentCheckIns:checkIns,
    revenuePaise:
      revenue._sum.amountPaise??0,
    exercises,

    manualClientsCount:
      manualClients.length,

    manualClients
  });
});

function currentWeekStart(){
  const now=new Date();

  const day=now.getUTCDay();
  const diff=day===0?-6:1-day;

  const monday=new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()+diff,
    0,0,0,0
  ));

  return monday;
}

// CLIENTS
adminRouter.get("/clients", async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 500);
  const showAll = String(req.query.all ?? "") === "1";

  const q = String(req.query.q ?? "").trim();

  const skip = showAll
    ? undefined
    : (page - 1) * limit;

  const take = showAll
    ? undefined
    : limit;

  const weekStart=currentWeekStart();

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
        id: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,

        clientProfile: true,

        subscriptions: {
          include: { program: true },
          orderBy: { createdAt: "desc" },
          take: 1
        },

        weeklyCalls:{
          where:{weekStart},
          orderBy:{updatedAt:"desc"},
          take:1
        }
      },

      orderBy: { createdAt: "desc" },

      ...(skip!==undefined?{skip}:{}),
      ...(take!==undefined?{take}:{})
    }),

    prisma.user.count({ where })
  ]);

  res.json({
    items,
    total,
    page,
    pages:showAll?1:Math.ceil(total/limit),
    weekStart
  });
});


adminRouter.put("/clients/:id/weekly-call", async (req,res)=>{
  const input=z.object({
    status:z.enum(["CALLED","NO_ANSWER"]).nullable().optional(),
    contactedAt:z.string().datetime().nullable().optional(),
    note:z.string().max(2000).optional()
  }).safeParse(req.body);

  if(!input.success){
    return res.status(400).json({
      error:"Invalid weekly call update."
    });
  }

  const client=await prisma.user.findFirst({
    where:{
      id:req.params.id,
      role:"CLIENT"
    },
    select:{id:true}
  });

  if(!client){
    return res.status(404).json({
      error:"Client not found."
    });
  }

  const weekStart=currentWeekStart();

  const existing=await prisma.clientWeeklyCall.findUnique({
    where:{
      userId_weekStart:{
        userId:client.id,
        weekStart
      }
    }
  });

  const status=
    input.data.status!==undefined
      ?input.data.status
      :existing?.status??null;

  const contactedAt=
    input.data.contactedAt!==undefined
      ?input.data.contactedAt
        ?new Date(input.data.contactedAt)
        :null
      :existing?.contactedAt??null;

  const note=
    input.data.note!==undefined
      ?input.data.note.trim()
      :existing?.note??null;

  const record=await prisma.clientWeeklyCall.upsert({
    where:{
      userId_weekStart:{
        userId:client.id,
        weekStart
      }
    },

    update:{
      status,
      contactedAt,
      note:note||null
    },

    create:{
      userId:client.id,
      weekStart,
      status,
      contactedAt,
      note:note||null
    }
  });

  res.json(record);
});

adminRouter.get("/clients/:id", async (req, res) => {
  const client = await prisma.user.findFirst({
    where: { id: req.params.id, role: "CLIENT" },
    select: {
      id: true, fullName: true, email: true, phone: true, isActive: true, createdAt: true,
      clientProfile: true,
      subscriptions: { include: { program: true, payments: true }, orderBy: { createdAt: "desc" } },
      checkIns:{
        include:{
          strengthRecords:{
            orderBy:{performedAt:"asc"}
          },
          measurements:{
            orderBy:{createdAt:"asc"}
          }
        },
        orderBy:{createdAt:"desc"},
        take:20
      }
    }
  });
  if (!client) return res.status(404).json({ error: "Client not found" });

  const [workouts, nutrition, measurements, strength, payments, appointments, notes, customOffers] = await Promise.all([
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
    prisma.coachNote.findMany({ where:{userId:client.id}, orderBy:{createdAt:"desc"}, take:100 }),
    prisma.program.findMany({
      where:{
        slug:{
          startsWith:`custom-${client.id}-`
        }
      },
      orderBy:{createdAt:"desc"}
    })
  ]);

  res.json({
    ...client,
    workouts,
    nutrition,
    measurements,
    strength,
    payments,
    appointments,
    notes,
    customOffers
  });
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
      emailVerifiedAt: new Date(),
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

// ADMIN DELETE CONTROLS

adminRouter.delete("/clients/:id", async (req,res) => {
  const clientId=String(req.params.id);

  const force=
    String(req.query.force||"").toLowerCase()==="true";

  const client=await prisma.user.findFirst({
    where:{
      id:clientId,
      role:"CLIENT"
    },
    select:{
      id:true,
      fullName:true,
      email:true
    }
  });

  if(!client){
    return res.status(404).json({
      error:"Client not found"
    });
  }

  const successfulPayments=await prisma.payment.count({
    where:{
      userId:clientId,
      status:"SUCCESS"
    }
  });

  if(successfulPayments>0&&!force){
    return res.status(409).json({
      error:"This client has successful payment history and cannot be permanently deleted with normal delete. Use Force Delete only if you intentionally want to remove the client and their financial records."
    });
  }

  await prisma.$transaction(async tx=>{

    // Force delete explicitly removes financial history first
    // so paid/cancelled clients can be deleted safely.
    if(force){
      await tx.payment.deleteMany({
        where:{userId:clientId}
      });

      await tx.subscription.deleteMany({
        where:{userId:clientId}
      });
    }

    await tx.workoutAssignment.deleteMany({
      where:{userId:clientId}
    });

    await tx.nutritionAssignment.deleteMany({
      where:{userId:clientId}
    });

    await tx.progressMeasurement.deleteMany({
      where:{userId:clientId}
    });

    await tx.strengthRecord.deleteMany({
      where:{userId:clientId}
    });

    await tx.checkIn.deleteMany({
      where:{userId:clientId}
    });

    await tx.appointment.deleteMany({
      where:{userId:clientId}
    });

    await tx.message.deleteMany({
      where:{
        OR:[
          {senderId:clientId},
          {receiverId:clientId}
        ]
      }
    });

    await tx.coachNote.deleteMany({
      where:{userId:clientId}
    });

    await tx.clientWeeklyCall.deleteMany({
      where:{userId:clientId}
    });

    // Normal unpaid/demo deletion can rely on cascade for
    // subscriptions/payments if there is no protected history.
    await tx.user.delete({
      where:{id:clientId}
    });

    await tx.program.deleteMany({
      where:{
        slug:{
          startsWith:`custom-${clientId}-`
        }
      }
    });
  });

  await audit(
    req.auth!.sub,
    force?"FORCE_DELETE":"DELETE",
    "CLIENT",
    clientId,
    {
      name:client.fullName,
      email:client.email,
      successfulPayments,
      force
    }
  );

  res.json({
    ok:true,
    force
  });
});

adminRouter.delete("/check-ins/:id", async (req,res) => {
  const item=await prisma.checkIn.findUnique({
    where:{id:req.params.id}
  });

  if(!item){
    return res.status(404).json({
      error:"Check-in not found"
    });
  }

  await prisma.checkIn.delete({
    where:{id:item.id}
  });

  for(const url of item.photoUrls){
    if(!url.startsWith("/api/media/"))continue;

    const filename=url.split("/").pop();

    if(filename){
      const filePath=safeUploadPath(filename);

      if(fs.existsSync(filePath)){
        try{
          fs.unlinkSync(filePath);
        }catch{}
      }
    }
  }

  await audit(
    req.auth!.sub,
    "DELETE",
    "CHECK_IN",
    item.id,
    {
      clientId:item.userId
    }
  );

  res.json({ok:true});
});

adminRouter.delete("/leads/:id", async (req,res) => {
  const existing=await prisma.lead.findUnique({
    where:{id:req.params.id}
  });

  if(!existing){
    return res.status(404).json({
      error:"Lead not found"
    });
  }

  await prisma.lead.delete({
    where:{id:existing.id}
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "LEAD",
    existing.id,
    {
      email:existing.email
    }
  );

  res.json({ok:true});
});

adminRouter.delete("/appointments/:id", async (req,res) => {
  const existing=await prisma.appointment.findUnique({
    where:{id:req.params.id}
  });

  if(!existing){
    return res.status(404).json({
      error:"Call record not found"
    });
  }

  await prisma.appointment.delete({
    where:{id:existing.id}
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "APPOINTMENT",
    existing.id,
    {
      email:existing.email
    }
  );

  res.json({ok:true});
});

adminRouter.delete("/clients/:clientId/notes/:noteId", async (req,res) => {
  const note=await prisma.coachNote.findFirst({
    where:{
      id:req.params.noteId,
      userId:req.params.clientId
    }
  });

  if(!note){
    return res.status(404).json({
      error:"Note not found"
    });
  }

  await prisma.coachNote.delete({
    where:{id:note.id}
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "COACH_NOTE",
    note.id,
    {
      clientId:req.params.clientId
    }
  );

  res.json({ok:true});
});

adminRouter.delete("/clients/:clientId/workouts/:assignmentId", async (req,res) => {
  const item=await prisma.workoutAssignment.findFirst({
    where:{
      id:req.params.assignmentId,
      userId:req.params.clientId
    }
  });

  if(!item){
    return res.status(404).json({
      error:"Workout assignment not found"
    });
  }

  await prisma.workoutAssignment.delete({
    where:{id:item.id}
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "WORKOUT_ASSIGNMENT",
    item.id,
    {
      clientId:req.params.clientId
    }
  );

  res.json({ok:true});
});

adminRouter.delete("/clients/:clientId/nutrition/:assignmentId", async (req,res) => {
  const item=await prisma.nutritionAssignment.findFirst({
    where:{
      id:req.params.assignmentId,
      userId:req.params.clientId
    }
  });

  if(!item){
    return res.status(404).json({
      error:"Nutrition assignment not found"
    });
  }

  await prisma.nutritionAssignment.delete({
    where:{id:item.id}
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "NUTRITION_ASSIGNMENT",
    item.id,
    {
      clientId:req.params.clientId
    }
  );

  res.json({ok:true});
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

adminRouter.delete("/programs/:id", async (req,res) => {
  const programId=String(req.params.id);

  const program=await prisma.program.findUnique({
    where:{id:programId}
  });

  if(!program){
    return res.status(404).json({
      error:"Programme not found"
    });
  }

  if(program.slug.startsWith("custom-")){
    return res.status(400).json({
      error:"Use the custom offer delete action for private offers."
    });
  }

  const subscriptionCount=await prisma.subscription.count({
    where:{programId}
  });

  if(subscriptionCount>0){
    return res.status(409).json({
      error:"This programme already has client subscription history and cannot be permanently deleted. Hide it instead."
    });
  }

  await prisma.program.delete({
    where:{id:programId}
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "PROGRAM",
    programId,
    {
      name:program.name
    }
  );

  res.json({ok:true});
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

// PRIVATE CUSTOM COACHING OFFERS
adminRouter.post("/clients/:id/custom-plan", async (req, res) => {
  const parsed = z.object({
    coachingType: z.enum(["NATURAL","ENHANCED"]),
    durationMonths: z.number().int().min(1).max(24),
    priceRupees: z.number().int().positive(),
    description: z.string().max(3000).optional()
  }).safeParse(req.body);

  if(!parsed.success){
    return res.status(400).json({
      error:"Invalid custom plan details"
    });
  }

  const client = await prisma.user.findFirst({
    where:{
      id:req.params.id,
      role:"CLIENT"
    },
    select:{
      id:true,
      fullName:true
    }
  });

  if(!client){
    return res.status(404).json({error:"Client not found"});
  }

  const months=parsed.data.durationMonths;

  const typeLabel=
    parsed.data.coachingType==="ENHANCED"
      ?"Enhanced"
      :"Natural";

  const item=await prisma.program.create({
    data:{
      slug:`custom-${client.id}-${Date.now()}`,
      name:`Custom ${typeLabel} Coaching — ${months} ${months===1?"Month":"Months"}`,
      description:
        parsed.data.description?.trim() ||
        `Private ${months}-month custom coaching offer prepared by Jay for ${client.fullName}.`,
      pricePaise:parsed.data.priceRupees*100,
      durationDays:months*30,
      isActive:true
    }
  });

  await audit(
    req.auth!.sub,
    "CREATE_CUSTOM_OFFER",
    "PROGRAM",
    item.id,
    {
      clientId:client.id,
      durationMonths:months,
      pricePaise:item.pricePaise
    }
  );

  res.status(201).json({
    ...item,
    checkoutPath:`/checkout?programId=${item.id}`
  });
});

adminRouter.delete("/custom-plans/:id", async (req,res) => {
  const offerId=String(req.params.id);

  const offer=await prisma.program.findUnique({
    where:{id:offerId}
  });

  if(!offer || !offer.slug.startsWith("custom-")){
    return res.status(404).json({
      error:"Custom offer not found"
    });
  }

  const subscriptionCount=await prisma.subscription.count({
    where:{programId:offerId}
  });

  if(subscriptionCount>0){
    return res.status(409).json({
      error:"This custom offer has already been used and cannot be permanently deleted. Disable it instead."
    });
  }

  await prisma.program.delete({
    where:{id:offerId}
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "CUSTOM_PROGRAM",
    offerId,
    {
      name:offer.name
    }
  );

  res.json({ok:true});
});

adminRouter.patch("/custom-plans/:id", async (req,res) => {
  const parsed=z.object({
    durationMonths:z.number().int().min(1).max(24).optional(),
    priceRupees:z.number().int().positive().optional(),
    description:z.string().max(3000).optional(),
    isActive:z.boolean().optional()
  }).safeParse(req.body);

  if(!parsed.success){
    return res.status(400).json({
      error:"Invalid custom plan details"
    });
  }

  const existing=await prisma.program.findUnique({
    where:{id:req.params.id}
  });

  if(!existing || !existing.slug.startsWith("custom-")){
    return res.status(404).json({
      error:"Custom offer not found"
    });
  }

  const update:any={};

  if(parsed.data.durationMonths!==undefined){
    update.durationDays=parsed.data.durationMonths*30;

    const typeLabel=
      existing.name.toLowerCase().includes("enhanced")
        ?"Enhanced"
        :"Natural";

    update.name=`Custom ${typeLabel} Coaching — ${parsed.data.durationMonths} ${
      parsed.data.durationMonths===1?"Month":"Months"
    }`;
  }

  if(parsed.data.priceRupees!==undefined){
    update.pricePaise=parsed.data.priceRupees*100;
  }

  if(parsed.data.description!==undefined){
    update.description=parsed.data.description.trim();
  }

  if(parsed.data.isActive!==undefined){
    update.isActive=parsed.data.isActive;
  }

  const item=await prisma.program.update({
    where:{id:existing.id},
    data:update
  });

  await audit(
    req.auth!.sub,
    "UPDATE_CUSTOM_OFFER",
    "PROGRAM",
    item.id,
    update
  );

  res.json({
    ...item,
    checkoutPath:`/checkout?programId=${item.id}`
  });
});

// SUBSCRIPTIONS / ASSIGNMENT
adminRouter.post("/clients/:id/subscription", async (req, res) => {
  const parsed = z.object({
    programId: z.string().min(1),
    status: z.enum(["PENDING", "ACTIVE", "PAUSED", "EXPIRED", "CANCELLED"]).default("ACTIVE"),
    startsAt: z.string().optional(),
    endsAt: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const clientId = String(req.params.id);

  const program = await prisma.program.findUnique({
    where: { id: parsed.data.programId }
  });

  if (!program) {
    return res.status(404).json({ error: "Programme not found" });
  }

  const startsAt = parsed.data.startsAt
    ? new Date(`${parsed.data.startsAt}T00:00:00.000Z`)
    : parsed.data.status === "ACTIVE"
      ? new Date()
      : null;

  const endsAt = parsed.data.endsAt
    ? new Date(`${parsed.data.endsAt}T23:59:59.999Z`)
    : startsAt && program.durationDays
      ? new Date(startsAt.getTime() + program.durationDays * 86400000)
      : null;

  if (
    startsAt &&
    endsAt &&
    endsAt.getTime() <= startsAt.getTime()
  ) {
    return res.status(400).json({
      error: "End date must be after start date."
    });
  }

  const sub = await prisma.$transaction(async tx => {
    if (parsed.data.status === "ACTIVE") {
      await tx.subscription.updateMany({
        where: {
          userId: clientId,
          status: "ACTIVE"
        },
        data: {
          status: "CANCELLED"
        }
      });
    }

    return tx.subscription.create({
      data: {
        userId: clientId,
        programId: program.id,
        status: parsed.data.status,
        startsAt,
        endsAt
      },
      include: { program: true }
    });
  });

  await audit(
    req.auth!.sub,
    "ASSIGN",
    "SUBSCRIPTION",
    sub.id,
    {
      clientId,
      source: parsed.data.startsAt || parsed.data.endsAt
        ? "MANUAL_EXISTING_CLIENT"
        : "ADMIN_DEFAULT"
    }
  );

  res.status(201).json(sub);
});

adminRouter.patch("/subscriptions/:id/dates", async (req, res) => {
  const subscriptionId = String(req.params.id);

  const parsed = z.object({
    startsAt: z.string().min(1),
    endsAt: z.string().min(1)
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid dates" });
  }

  const existing = await prisma.subscription.findUnique({
    where: { id: subscriptionId }
  });

  if (!existing) {
    return res.status(404).json({ error: "Subscription not found" });
  }

  if (existing.status !== "ACTIVE") {
    return res.status(400).json({
      error: "Only the current active subscription can be edited."
    });
  }

  const startsAt = new Date(`${parsed.data.startsAt}T00:00:00.000Z`);
  const endsAt = new Date(`${parsed.data.endsAt}T23:59:59.999Z`);

  if (endsAt.getTime() <= startsAt.getTime()) {
    return res.status(400).json({
      error: "End date must be after start date."
    });
  }

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      startsAt,
      endsAt
    },
    include: {
      program: true
    }
  });

  await audit(
    req.auth!.sub,
    "UPDATE_DATES",
    "SUBSCRIPTION",
    updated.id,
    {
      startsAt: updated.startsAt,
      endsAt: updated.endsAt
    }
  );

  res.json(updated);
});

// EXERCISE LIBRARY + LOCAL DEV VIDEO UPLOAD
adminRouter.get("/exercises", async (_req, res) => {
  res.json(await prisma.exercise.findMany({
    include: { alternatives: { include: { alternativeExercise: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  }));
});

adminRouter.post("/exercise-video", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Video file required (.mp4/.mov/.webm)"
    });
  }

  try {
    const converted = await convertExerciseVideo(req.file.path);

    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const publicUrl = `/api/media/${converted.filename}`;

    res.status(201).json({
      videoUrl: publicUrl,
      originalName: req.file.originalname,
      size: converted.size
    });
  } catch (error) {
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error("Exercise video conversion failed:", error);

    res.status(500).json({
      error: "Video conversion failed"
    });
  }
});

adminRouter.post("/exercises", async (req, res) => {
  const parsed = z.object({
    name: z.string().default("Untitled Exercise"),
    muscleGroup: z.string().default("General"),
    instructions: z.string().default("No instructions added yet."),
    formCues: z.array(z.string()).default([]),
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    audience: z.enum(["NATURAL","ENHANCED","BOTH"]).default("BOTH")
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
    audience: z.enum(["NATURAL","ENHANCED","BOTH"]).optional(),
    isActive: z.boolean().optional()
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const item = await prisma.exercise.update({ where: { id: req.params.id }, data: parsed.data });
  await audit(req.auth!.sub, "UPDATE", "EXERCISE", item.id);
  res.json(item);
});

adminRouter.post("/exercises/:id/video", upload.single("video"), async (req, res) => {
  const exerciseId = String(req.params.id);

  if(!req.file){
    return res.status(400).json({error:"Video file required (.mp4/.mov/.webm)"});
  }

  const exercise = await prisma.exercise.findUnique({
    where:{id:exerciseId},
    select:{id:true,videoUrl:true}
  });

  if(!exercise){
    if(fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(404).json({error:"Exercise not found"});
  }

  let converted;

  try {
    converted = await convertExerciseVideo(req.file.path);

    if(fs.existsSync(req.file.path)){
      fs.unlinkSync(req.file.path);
    }
  } catch (error) {
    if(fs.existsSync(req.file.path)){
      fs.unlinkSync(req.file.path);
    }

    console.error("Exercise replacement conversion failed:", error);

    return res.status(500).json({
      error:"Video conversion failed"
    });
  }

  const newVideoUrl = `/api/media/${converted.filename}`;

  const updated = await prisma.exercise.update({
    where:{id:exercise.id},
    data:{videoUrl:newVideoUrl}
  });

  if(exercise.videoUrl?.startsWith("/api/media/")){
    const oldFilename = exercise.videoUrl.split("/").pop();

    if(oldFilename){
      const oldPath = safeUploadPath(oldFilename);
      if(fs.existsSync(oldPath)){
        fs.unlinkSync(oldPath);
      }
    }
  }

  await audit(
    req.auth!.sub,
    "REPLACE_VIDEO",
    "EXERCISE",
    exercise.id
  );

  res.json(updated);
});

adminRouter.delete("/exercises/:id", async (req, res) => {
  const exerciseId = String(req.params.id);

  const exercise = await prisma.exercise.findUnique({
    where:{id:exerciseId},
    select:{id:true,videoUrl:true}
  });

  if(!exercise){
    return res.status(404).json({error:"Exercise not found"});
  }

  await prisma.$transaction(async tx=>{
    await tx.workoutExercise.deleteMany({
      where:{exerciseId:exercise.id}
    });

    await tx.exerciseAlternative.deleteMany({
      where:{
        OR:[
          {exerciseId:exercise.id},
          {alternativeExerciseId:exercise.id}
        ]
      }
    });

    await tx.exercise.delete({
      where:{id:exercise.id}
    });
  });

  if(exercise.videoUrl?.startsWith("/api/media/")){
    const filename = exercise.videoUrl.split("/").pop();

    if(filename){
      const fullPath = safeUploadPath(filename);

      if(fs.existsSync(fullPath)){
        fs.unlinkSync(fullPath);
      }
    }
  }

  await audit(
    req.auth!.sub,
    "DELETE",
    "EXERCISE",
    exercise.id
  );

  res.json({ok:true});
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


adminRouter.patch("/workout-plans/:id", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    description: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const item = await prisma.workoutPlan.update({
    where: { id: req.params.id },
    data: parsed.data
  });

  await audit(
    req.auth!.sub,
    "UPDATE",
    "WORKOUT_PLAN",
    item.id
  );

  res.json(item);
});

adminRouter.post("/workout-plans/:id/exercises", async (req, res) => {
  const parsed = z.object({
    exerciseId: z.string(),
    dayLabel: z.string().min(1),
    position: z.number().int().positive(),
    sets: z.string().max(250).optional(),
    reps: z.string().max(250).optional(),
    restSeconds: z.string().max(250).optional(),
    notes: z.string().max(4000).optional()
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

adminRouter.patch("/workout-plans/:planId/exercises/:itemId", async (req, res) => {
  const parsed = z.object({
    exerciseId: z.string(),
    dayLabel: z.string().min(1),
    position: z.number().int().positive(),
    sets: z.string().max(250).optional(),
    reps: z.string().max(250).optional(),
    restSeconds: z.string().max(250).optional(),
    notes: z.string().max(4000).optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const existing = await prisma.workoutExercise.findFirst({
    where: {
      id: req.params.itemId,
      workoutPlanId: req.params.planId
    }
  });

  if (!existing) {
    return res.status(404).json({
      error: "Workout exercise not found"
    });
  }

  const item = await prisma.workoutExercise.update({
    where: { id: existing.id },
    data: parsed.data
  });

  await audit(
    req.auth!.sub,
    "UPDATE_EXERCISE_IN_WORKOUT",
    "WORKOUT_PLAN",
    req.params.planId,
    { workoutExerciseId: item.id }
  );

  res.json(item);
});

adminRouter.delete("/workout-plans/:planId/exercises/:itemId", async (req, res) => {
  const planId = String(req.params.planId);
  const itemId = String(req.params.itemId);

  const item = await prisma.workoutExercise.findFirst({
    where: {
      id: itemId,
      workoutPlanId: planId
    }
  });

  if (!item) {
    return res.status(404).json({ error: "Workout exercise not found" });
  }

  await prisma.workoutExercise.delete({
    where: { id: item.id }
  });

  await audit(
    req.auth!.sub,
    "DELETE_EXERCISE_FROM_WORKOUT",
    "WORKOUT_PLAN",
    planId,
    { workoutExerciseId: item.id }
  );

  res.json({ ok: true });
});

adminRouter.delete("/workout-plans/:id", async (req, res) => {
  const planId = String(req.params.id);

  const plan = await prisma.workoutPlan.findUnique({
    where: { id: planId }
  });

  if (!plan) {
    return res.status(404).json({ error: "Workout plan not found" });
  }

  await prisma.workoutPlan.delete({
    where: { id: planId }
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "WORKOUT_PLAN",
    planId
  );

  res.json({ ok: true });
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
// Bulk import Jay's source diet library. Safe to run repeatedly.
adminRouter.post("/nutrition-plans/import-library", async (req,res)=>{
  const existingCount=
    await prisma.nutritionPlan.count();

  if(existingCount>0){
    return res.status(409).json({
      error:
        "Nutrition is not empty. Delete all existing nutrition plans before importing the new library."
    });
  }

  let created=0;

  await prisma.$transaction(async tx=>{
    for(const source of JAY_DIET_LIBRARY){
      const name=
        `${source.ffm}FFM · ${Math.round(source.carbsG)}C`;

      const plan=
        await tx.nutritionPlan.create({
          data:{
            name,
            calories:source.calories,
            proteinG:source.proteinG,
            carbsG:source.carbsG,
            fatsG:source.fatsG,

            content:{
              notes:"Imported from Jay diet library",
              source:"JAY_DIET_LIBRARY",
              ffm:source.ffm,
              sourceFoods:source.dailyFoods
            }
          }
        });

      created++;

      for(const meal of source.meals){
        await tx.mealOption.create({
          data:{
            nutritionPlanId:plan.id,
            mealLabel:meal.mealLabel,
            optionLabel:meal.optionLabel,
            calories:meal.calories,
            proteinG:meal.proteinG,
            carbsG:meal.carbsG,
            fatsG:meal.fatsG,
            foods:[...meal.foods]
          }
        });
      }
    }
  });

  res.json({
    created,
    total:JAY_DIET_LIBRARY.length
  });
});

adminRouter.get("/nutrition-plans", async (_req, res) => {
  res.json(await prisma.nutritionPlan.findMany({
    include: { mealOptions: true },
    orderBy: { updatedAt: "desc" }
  }));
});

adminRouter.post("/nutrition-plans/paste", async (req,res)=>{
  const parsed=z.object({
    rawText:z.string().min(20),
    planId:z.string().optional()
  }).safeParse(req.body);

  if(!parsed.success){
    return res.status(400).json({
      error:"Paste the complete diet plan."
    });
  }

  const text=parsed.data.rawText
    .replace(/\r/g,"")
    .trim();

  // -------------------------------------------------------
  // PLAN HEADER
  // -------------------------------------------------------

  const ffmMatch=
    text.match(/(?:^|\n)\s*(\d+)\s*FFM\s*,?/i);

  if(!ffmMatch){
    return res.status(400).json({
      error:"Could not find FFM. Example: 35FFM,"
    });
  }

  const ffm=Number(ffmMatch[1]);

  const macroPattern=
    /\(\s*PROTEIN\s*-\s*([\d.]+)\s*,\s*FAT\s*-\s*([\d.]+)\s*,\s*CARBS\s*-\s*([\d.]+)\s*\)/gi;

  const macroMatches=
    [...text.matchAll(macroPattern)];

  if(!macroMatches.length){
    return res.status(400).json({
      error:
        "Could not find plan macros. Expected format: (PROTEIN -88,FAT-35,CARBS-100)"
    });
  }

  const proteinG=Number(macroMatches[0][1]);
  const fatsG=Number(macroMatches[0][2]);
  const carbsG=Number(macroMatches[0][3]);

  const caloriesMatch=
    text.match(/\(\s*calories\s*-\s*([\d.]+)\s*\)/i);

  if(!caloriesMatch){
    return res.status(400).json({
      error:
        "Could not find plan calories. Expected format: (calories-1070)"
    });
  }

  const calories=Number(caloriesMatch[1]);

  const name=
    `${ffm}FFM · ${Math.round(carbsG)}C`;


  // -------------------------------------------------------
  // DAILY FOOD TOTALS
  // -------------------------------------------------------

  const firstCaloriesIndex=
    caloriesMatch.index??0;

  const firstCaloriesEnd=
    firstCaloriesIndex+caloriesMatch[0].length;

  const secondMacroIndex=
    macroMatches.length>1
      ?macroMatches[1].index
      :undefined;

  const firstMealMatch=
    text.match(/(?:^|\n)\s*Meal-\d+\s*(?:\n|$)/i);

  const firstMealIndex=
    firstMealMatch?.index??text.length;

  const dailyEnd=
    secondMacroIndex!==undefined
      ?secondMacroIndex
      :firstMealIndex;

  const dailyBlock=
    text.slice(
      firstCaloriesEnd,
      dailyEnd
    );

  const sourceFoods=
    dailyBlock
      .split("\n")
      .map(line=>line.trim())
      .filter(Boolean)
      .map(line=>{
        const match=
          line.match(/^(.+?)\s*-\s*([\d.]+)\s*(g)?$/i);

        if(!match)return null;

        const foodName=
          match[1].trim();

        return{
          name:foodName,
          amount:Number(match[2]),
          unit:/^eggs?$/i.test(foodName)
            ?"count"
            :"g"
        };
      })
      .filter(
        (
          food
        ):food is {
          name:string;
          amount:number;
          unit:string;
        }=>Boolean(food)
      );


  // -------------------------------------------------------
  // MEALS
  // -------------------------------------------------------

  const mealHeadingPattern=
    /(?:^|\n)\s*(Meal-\d+)\s*(?:\n|$)/gi;

  const mealHeadings=
    [...text.matchAll(mealHeadingPattern)];

  if(!mealHeadings.length){
    return res.status(400).json({
      error:
        "No meals found. Use full labels such as Meal-1, Meal-2, Meal-3, Meal-4."
    });
  }


  const meals=mealHeadings.map(
    (heading,index)=>{

      // KEEP EXACT FULL MEAL LABEL.
      // Meal-1 stays Meal-1.
      const mealLabel=
        heading[1];

      const blockStart=
        (heading.index??0)+
        heading[0].length;

      const blockEnd=
        index+1<mealHeadings.length
          ?mealHeadings[index+1].index??text.length
          :text.length;

      const block=
        text.slice(
          blockStart,
          blockEnd
        ).trim();


      const mealMacro=
        block.match(
          /\(\s*P\s*-\s*([\d.]+)\s*,\s*F\s*-\s*([\d.]+)\s*,\s*C\s*-\s*([\d.]+)\s*\)/i
        );

      if(!mealMacro){
        throw new Error(
          `${mealLabel}: macros not found. Expected (P-5,F-3,C-26)`
        );
      }


      const mealCalories=
        block.match(
          /\(\s*calories\s*-\s*([\d.]+)\s*\)/i
        );

      if(!mealCalories){
        throw new Error(
          `${mealLabel}: calories not found. Expected (calories-151)`
        );
      }


      const foods=
        block
          .split("\n")
          .map(line=>line.trim())
          .filter(Boolean)
          .filter(line=>
            !/^\(\s*P\s*-/i.test(line) &&
            !/^\(\s*calories\s*-/i.test(line)
          );


      if(!foods.length){
        throw new Error(
          `${mealLabel}: no food items found.`
        );
      }


      return{
        mealLabel,
        optionLabel:"Standard",
        calories:Number(mealCalories[1]),
        proteinG:Number(mealMacro[1]),
        fatsG:Number(mealMacro[2]),
        carbsG:Number(mealMacro[3]),
        foods
      };
    }
  );


  let result:{
    planId:string;
    created:boolean;
  };

  try{
    result=
      await prisma.$transaction(
        async tx=>{

          const existing=
            parsed.data.planId
              ?await tx.nutritionPlan.findUnique({
                  where:{id:parsed.data.planId},
                  select:{id:true}
                })
              :await tx.nutritionPlan.findFirst({
                  where:{name},
                  select:{id:true}
                });


          let planId:string;


          if(existing){

            await tx.nutritionPlan.update({
              where:{
                id:existing.id
              },

              data:{
                name,
                calories,
                proteinG,
                carbsG,
                fatsG,

                content:{
                  notes:
                    "Created from admin pasted diet plan",
                  source:
                    "ADMIN_PASTE",
                  ffm,
                  sourceFoods
                }
              }
            });


            await tx.mealOption.deleteMany({
              where:{
                nutritionPlanId:
                  existing.id
              }
            });


            planId=
              existing.id;

          }else{

            const plan=
              await tx.nutritionPlan.create({
                data:{
                  name,
                  calories,
                  proteinG,
                  carbsG,
                  fatsG,

                  content:{
                    notes:
                      "Created from admin pasted diet plan",
                    source:
                      "ADMIN_PASTE",
                    ffm,
                    sourceFoods
                  }
                }
              });

            planId=
              plan.id;
          }


          for(const meal of meals){

            await tx.mealOption.create({
              data:{
                nutritionPlanId:
                  planId,

                mealLabel:
                  meal.mealLabel,

                optionLabel:
                  meal.optionLabel,

                calories:
                  meal.calories,

                proteinG:
                  meal.proteinG,

                carbsG:
                  meal.carbsG,

                fatsG:
                  meal.fatsG,

                foods:
                  meal.foods
              }
            });
          }


          return{
            planId,
            created:!existing
          };
        }
      );

  }catch(error:any){

    return res.status(400).json({
      error:
        error?.message||
        "Could not parse diet plan."
    });
  }


  await audit(
    req.auth!.sub,
    result.created
      ?"CREATE_PASTED_NUTRITION_PLAN"
      :"REPLACE_PASTED_NUTRITION_PLAN",
    "NUTRITION_PLAN",
    result.planId,
    {
      name,
      meals:meals.length
    }
  );


  res.json({
    ok:true,
    id:result.planId,
    name,
    created:result.created,
    meals:meals.length
  });
});


adminRouter.post("/nutrition-plans", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    calories: z.number().positive().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatsG: z.number().nonnegative().optional(),
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

adminRouter.patch("/nutrition-plans/:id", async (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    calories: z.number().positive().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatsG: z.number().nonnegative().optional(),
    notes: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const item = await prisma.nutritionPlan.update({
    where: { id: req.params.id },
    data: {
      name: parsed.data.name,
      calories: parsed.data.calories,
      proteinG: parsed.data.proteinG,
      carbsG: parsed.data.carbsG,
      fatsG: parsed.data.fatsG,
      content: {
        notes: parsed.data.notes ?? ""
      }
    }
  });

  await audit(
    req.auth!.sub,
    "UPDATE",
    "NUTRITION_PLAN",
    item.id
  );

  res.json(item);
});

adminRouter.delete("/nutrition-plans", async (req,res)=>{
  const plans=
    await prisma.nutritionPlan.findMany({
      select:{
        id:true,
        pdfUrl:true
      }
    });

  const beforeCount=plans.length;

  const deleted=
    await prisma.$transaction(async tx=>{
      const assignments=
        await tx.nutritionAssignment.deleteMany({});

      const mealOptions=
        await tx.mealOption.deleteMany({});

      const nutritionPlans=
        await tx.nutritionPlan.deleteMany({});

      return {
        assignments:assignments.count,
        mealOptions:mealOptions.count,
        nutritionPlans:nutritionPlans.count
      };
    });


  // Remove uploaded nutrition PDFs from disk.
  for(const plan of plans){
    if(plan.pdfUrl?.startsWith("/api/media/")){
      const filename=
        plan.pdfUrl.split("/").pop();

      if(filename){
        const fullPath=
          safeUploadPath(filename);

        if(fs.existsSync(fullPath)){
          fs.unlinkSync(fullPath);
        }
      }
    }
  }


  const remaining=
    await prisma.nutritionPlan.count();


  if(remaining!==0){
    return res.status(500).json({
      error:
        `Nutrition deletion incomplete. ${remaining} plans still remain.`,
      beforeCount,
      deleted,
      remaining
    });
  }


  await audit(
    req.auth!.sub,
    "DELETE_ALL",
    "NUTRITION_PLAN",
    undefined,
    {
      beforeCount,
      deletedAssignments:deleted.assignments,
      deletedMealOptions:deleted.mealOptions,
      deletedNutritionPlans:deleted.nutritionPlans
    }
  );


  res.json({
    ok:true,
    deletedCount:deleted.nutritionPlans,
    deletedAssignments:deleted.assignments,
    deletedMealOptions:deleted.mealOptions,
    remaining
  });
});


adminRouter.delete("/nutrition-plans/:id", async (req, res) => {
  const plan = await prisma.nutritionPlan.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      pdfUrl: true
    }
  });

  if (!plan) {
    return res.status(404).json({
      error: "Nutrition plan not found"
    });
  }

  if (plan.pdfUrl?.startsWith("/api/media/")) {
    const filename = plan.pdfUrl.split("/").pop();

    if (filename) {
      const fullPath = safeUploadPath(filename);

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
  }

  await prisma.nutritionPlan.delete({
    where: { id: plan.id }
  });

  await audit(
    req.auth!.sub,
    "DELETE",
    "NUTRITION_PLAN",
    plan.id
  );

  res.json({ ok: true });
});

adminRouter.post("/nutrition-plans/:id/pdf", pdfUpload.single("pdf"), async (req, res) => {
  const planId = String(req.params.id);

  if (!req.file) {
    return res.status(400).json({ error: "PDF file required" });
  }

  const plan = await prisma.nutritionPlan.findUnique({
    where: { id: planId },
    select: { id: true, pdfUrl: true }
  });

  if (!plan) {
    const uploadedPath = safeUploadPath(req.file.filename);
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    return res.status(404).json({ error: "Nutrition plan not found" });
  }

  const pdfUrl = `/api/media/${req.file.filename}`;

  const updated = await prisma.nutritionPlan.update({
    where: { id: planId },
    data: { pdfUrl }
  });

  // Replacing an existing PDF should also clean up the old file.
  if (plan.pdfUrl?.startsWith("/api/media/")) {
    const oldFilename = plan.pdfUrl.split("/").pop();

    if (oldFilename) {
      const oldPath = safeUploadPath(oldFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
  }

  await audit(
    req.auth!.sub,
    "UPLOAD_PDF",
    "NUTRITION_PLAN",
    planId
  );

  res.json(updated);
});

adminRouter.delete("/nutrition-plans/:id/pdf", async (req, res) => {
  const planId = String(req.params.id);

  const plan = await prisma.nutritionPlan.findUnique({
    where: { id: planId },
    select: { id: true, pdfUrl: true }
  });

  if (!plan) {
    return res.status(404).json({ error: "Nutrition plan not found" });
  }

  if (plan.pdfUrl?.startsWith("/api/media/")) {
    const filename = plan.pdfUrl.split("/").pop();

    if (filename) {
      const fullPath = safeUploadPath(filename);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
  }

  await prisma.nutritionPlan.update({
    where: { id: planId },
    data: { pdfUrl: null }
  });

  await audit(
    req.auth!.sub,
    "REMOVE_PDF",
    "NUTRITION_PLAN",
    planId
  );

  res.json({ ok: true });
});

adminRouter.post("/nutrition-plans/:id/meal-options", async (req, res) => {
  const parsed = z.object({
    mealLabel: z.string().min(1),
    optionLabel: z.string().min(1),
    calories: z.number().nonnegative().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatsG: z.number().nonnegative().optional(),
    foods: z.array(z.string()).min(1)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { foods, ...rest } = parsed.data;
  const item = await prisma.mealOption.create({
    data: { nutritionPlanId: req.params.id, ...rest, foods }
  });
  res.status(201).json(item);
});

adminRouter.patch("/nutrition-plans/:planId/meal-options/:mealId", async (req, res) => {
  const parsed = z.object({
    mealLabel: z.string().min(1),
    optionLabel: z.string().min(1),
    calories: z.number().nonnegative().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatsG: z.number().nonnegative().optional(),
    foods: z.array(z.string()).min(1)
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const existing = await prisma.mealOption.findFirst({
    where: {
      id: req.params.mealId,
      nutritionPlanId: req.params.planId
    }
  });

  if (!existing) {
    return res.status(404).json({
      error: "Meal option not found"
    });
  }

  const item = await prisma.mealOption.update({
    where: { id: existing.id },
    data: parsed.data
  });

  await audit(
    req.auth!.sub,
    "UPDATE_MEAL_OPTION",
    "NUTRITION_PLAN",
    req.params.planId,
    { mealOptionId: item.id }
  );

  res.json(item);
});

adminRouter.delete("/nutrition-plans/:planId/meal-options/:mealId", async (req, res) => {
  const existing = await prisma.mealOption.findFirst({
    where: {
      id: req.params.mealId,
      nutritionPlanId: req.params.planId
    }
  });

  if (!existing) {
    return res.status(404).json({
      error: "Meal option not found"
    });
  }

  await prisma.mealOption.delete({
    where: { id: existing.id }
  });

  await audit(
    req.auth!.sub,
    "DELETE_MEAL_OPTION",
    "NUTRITION_PLAN",
    req.params.planId,
    { mealOptionId: existing.id }
  );

  res.json({ ok: true });
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
    include:{
      user:{
        select:{
          id:true,
          fullName:true,
          email:true
        }
      },

      strengthRecords:{
        orderBy:{performedAt:"asc"}
      },

      measurements:{
        orderBy:{createdAt:"asc"}
      }
    },
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
adminRouter.get("/conversations", async (req, res) => {
  const adminId=req.auth!.sub;

  const clients=await prisma.user.findMany({
    where:{
      role:"CLIENT"
    },

    select:{
      id:true,
      fullName:true,
      email:true,

      clientProfile:{
        select:{
          profilePhotoUrl:true
        }
      }
    }
  });

  const clientIds=clients.map(c=>c.id);

  if(!clientIds.length){
    return res.json([]);
  }

  const messages=await prisma.message.findMany({
    where:{
      OR:[
        {
          senderId:adminId,
          receiverId:{
            in:clientIds
          }
        },
        {
          senderId:{
            in:clientIds
          },
          receiverId:adminId
        }
      ]
    },

    orderBy:{
      createdAt:"desc"
    },

    select:{
      id:true,
      senderId:true,
      receiverId:true,
      body:true,
      readAt:true,
      createdAt:true
    }
  });


  const latestMap=new Map<string,typeof messages[number]>();
  const unreadMap=new Map<string,number>();

  for(const message of messages){
    const clientId=
      message.senderId===adminId
        ?message.receiverId
        :message.senderId;

    if(!latestMap.has(clientId)){
      latestMap.set(clientId,message);
    }

    if(
      message.senderId===clientId &&
      message.receiverId===adminId &&
      !message.readAt
    ){
      unreadMap.set(
        clientId,
        (unreadMap.get(clientId)||0)+1
      );
    }
  }


  const rows=clients.map(client=>{
    const latest=latestMap.get(client.id);

    return{
      ...client,

      unreadCount:
        unreadMap.get(client.id)||0,

      lastMessage:latest
        ?{
            id:latest.id,
            body:latest.body,
            senderId:latest.senderId,
            receiverId:latest.receiverId,
            createdAt:latest.createdAt
          }
        :null
    };
  });


  rows.sort((a,b)=>{
    if(
      (b.unreadCount>0)!==
      (a.unreadCount>0)
    ){
      return b.unreadCount>0?1:-1;
    }

    const aTime=a.lastMessage
      ?new Date(a.lastMessage.createdAt).getTime()
      :0;

    const bTime=b.lastMessage
      ?new Date(b.lastMessage.createdAt).getTime()
      :0;

    if(aTime!==bTime){
      return bTime-aTime;
    }

    return a.fullName.localeCompare(b.fullName);
  });


  res.json(rows);
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
