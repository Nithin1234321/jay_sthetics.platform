import type { Request, Response } from "express";
import { Router } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

export const paymentsRouter = Router();

function getRazorpay() {
  if (!config.RAZORPAY_KEY_ID || !config.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: config.RAZORPAY_KEY_ID, key_secret: config.RAZORPAY_KEY_SECRET });
}

async function activatePayment(orderId:string,paymentId:string) {
  const payment=await prisma.payment.findUnique({where:{razorpayOrderId:orderId}});
  if(!payment)return null;
  if(payment.status==="SUCCESS")return payment;

  const subscription=payment.subscriptionId
    ? await prisma.subscription.findUnique({where:{id:payment.subscriptionId},include:{program:true}})
    : null;
  const startsAt=new Date();
  const endsAt=subscription?.program.durationDays
    ? new Date(startsAt.getTime()+subscription.program.durationDays*86400000)
    : null;

  await prisma.$transaction([
    prisma.payment.update({
      where:{id:payment.id},
      data:{status:"SUCCESS",razorpayPaymentId:paymentId}
    }),
    ...(payment.subscriptionId ? [prisma.subscription.update({
      where:{id:payment.subscriptionId},
      data:{status:"ACTIVE",startsAt,endsAt}
    })] : [])
  ]);
  return payment;
}

paymentsRouter.post("/create-order", requireAuth, async (req,res) => {
  if(req.auth!.role!=="CLIENT")return res.status(403).json({error:"Client account required"});
  const parsed=z.object({programId:z.string().min(1)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid programme"});

  const program=await prisma.program.findFirst({where:{id:parsed.data.programId,isActive:true}});
  if(!program)return res.status(404).json({error:"Programme not found"});

  const alreadyActive=await prisma.subscription.findFirst({
    where:{userId:req.auth!.sub,programId:program.id,status:"ACTIVE",OR:[{endsAt:null},{endsAt:{gt:new Date()}}]}
  });
  if(alreadyActive)return res.status(409).json({error:"This programme is already active on your account."});

  const razorpay=getRazorpay();
  if(!razorpay)return res.status(503).json({error:"Razorpay keys are not configured"});

  const recent=new Date(Date.now()-30*60*1000);
  const existing=await prisma.payment.findFirst({
    where:{
      userId:req.auth!.sub,status:"CREATED",amountPaise:program.pricePaise,createdAt:{gte:recent},
      subscription:{programId:program.id}
    },
    include:{subscription:true},
    orderBy:{createdAt:"desc"}
  });
  if(existing?.razorpayOrderId){
    return res.json({
      keyId:config.RAZORPAY_KEY_ID,
      order:{id:existing.razorpayOrderId,amount:existing.amountPaise,currency:existing.currency},
      localPaymentId:existing.id,
      subscriptionId:existing.subscriptionId
    });
  }

  const subscription=await prisma.subscription.create({
    data:{userId:req.auth!.sub,programId:program.id,status:"PENDING"}
  });
  const order=await razorpay.orders.create({
    amount:program.pricePaise,currency:"INR",receipt:subscription.id
  });
  const payment=await prisma.payment.create({
    data:{
      userId:req.auth!.sub,subscriptionId:subscription.id,amountPaise:program.pricePaise,
      razorpayOrderId:order.id,status:"CREATED"
    }
  });
  res.status(201).json({
    keyId:config.RAZORPAY_KEY_ID,order,localPaymentId:payment.id,subscriptionId:subscription.id
  });
});

paymentsRouter.post("/verify", requireAuth, async (req,res) => {
  const parsed=z.object({
    razorpay_order_id:z.string(),razorpay_payment_id:z.string(),razorpay_signature:z.string()
  }).safeParse(req.body);
  if(!parsed.success||!config.RAZORPAY_KEY_SECRET)return res.status(400).json({error:"Invalid payment payload"});

  const payment=await prisma.payment.findUnique({where:{razorpayOrderId:parsed.data.razorpay_order_id}});
  if(!payment||payment.userId!==req.auth!.sub)return res.status(404).json({error:"Payment not found"});

  const expected=crypto.createHmac("sha256",config.RAZORPAY_KEY_SECRET)
    .update(`${parsed.data.razorpay_order_id}|${parsed.data.razorpay_payment_id}`).digest("hex");
  const a=Buffer.from(expected,"utf8"), b=Buffer.from(parsed.data.razorpay_signature,"utf8");
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)){
    return res.status(400).json({error:"Payment signature verification failed"});
  }

  await activatePayment(parsed.data.razorpay_order_id,parsed.data.razorpay_payment_id);
  res.json({ok:true});
});


paymentsRouter.post("/mock-success", requireAuth, async (req,res) => {
  if (process.env.NODE_ENV === "production" || config.DEV_MOCK_PAYMENTS !== "true") {
    return res.status(404).json({ error: "Not available" });
  }
  if (req.auth!.role !== "CLIENT") return res.status(403).json({ error: "Client account required" });

  const parsed=z.object({programId:z.string().min(1)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid programme"});

  const program=await prisma.program.findFirst({where:{id:parsed.data.programId,isActive:true}});
  if(!program)return res.status(404).json({error:"Programme not found"});

  const existing=await prisma.subscription.findFirst({
    where:{userId:req.auth!.sub,programId:program.id,status:"ACTIVE",OR:[{endsAt:null},{endsAt:{gt:new Date()}}]}
  });
  if(existing)return res.json({ok:true,alreadyActive:true});

  const startsAt=new Date();
  const endsAt=program.durationDays?new Date(startsAt.getTime()+program.durationDays*86400000):null;

  const result=await prisma.$transaction(async tx=>{
    const subscription=await tx.subscription.create({
      data:{userId:req.auth!.sub,programId:program.id,status:"ACTIVE",startsAt,endsAt}
    });
    const payment=await tx.payment.create({
      data:{
        userId:req.auth!.sub,subscriptionId:subscription.id,amountPaise:program.pricePaise,currency:"INR",
        status:"SUCCESS",razorpayOrderId:`mock_order_${Date.now()}`,razorpayPaymentId:`mock_payment_${Date.now()}`
      }
    });
    return {subscription,payment};
  });

  res.status(201).json({ok:true,mock:true,...result});
});

export async function razorpayWebhookHandler(req:Request,res:Response) {
  if(!config.RAZORPAY_WEBHOOK_SECRET)return res.status(503).json({error:"Webhook secret not configured"});
  const signature=String(req.headers["x-razorpay-signature"] ?? "");
  const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from("");
  const expected=crypto.createHmac("sha256",config.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
  const a=Buffer.from(expected,"utf8"), b=Buffer.from(signature,"utf8");
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(400).json({error:"Invalid webhook signature"});

  const event=JSON.parse(raw.toString("utf8"));
  if(event.event==="payment.captured"){
    const entity=event.payload?.payment?.entity;
    if(entity?.order_id&&entity?.id)await activatePayment(entity.order_id,entity.id);
  } else if(event.event==="payment.failed"){
    const entity=event.payload?.payment?.entity;
    if(entity?.order_id){
      await prisma.payment.updateMany({where:{razorpayOrderId:entity.order_id},data:{status:"FAILED"}});
    }
  }
  res.json({ok:true});
}
