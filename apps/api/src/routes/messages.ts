import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

async function canTalk(meId:string, meRole:"ADMIN"|"CLIENT", otherId:string){
  const other=await prisma.user.findUnique({where:{id:otherId},select:{id:true,role:true,isActive:true}});
  if(!other?.isActive)return false;
  if(meRole==="ADMIN")return other.role==="CLIENT";
  if(other.role!=="ADMIN")return false;
  const sub=await prisma.subscription.findFirst({
    where:{userId:meId,status:"ACTIVE",OR:[{endsAt:null},{endsAt:{gt:new Date()}}]},select:{id:true}
  });
  return !!sub;
}

messagesRouter.get("/:otherUserId", async (req, res) => {
  const me = req.auth!.sub;
  const other = req.params.otherUserId;
  if(!(await canTalk(me, req.auth!.role, other))) return res.status(403).json({error:"Messaging is not available for this conversation."});
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: me, receiverId: other }, { senderId: other, receiverId: me }] },
    orderBy: { createdAt: "asc" },
    take: 200
  });
  await prisma.message.updateMany({where:{senderId:other,receiverId:me,readAt:null},data:{readAt:new Date()}});
  res.json(messages);
});

messagesRouter.post("/", async (req, res) => {
  const parsed = z.object({receiverId: z.string().min(1),body: z.string().trim().min(1).max(4000)}).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  if(!(await canTalk(req.auth!.sub, req.auth!.role, parsed.data.receiverId))) return res.status(403).json({error:"Messaging is not available for this conversation."});
  const message = await prisma.message.create({data: { senderId: req.auth!.sub, ...parsed.data }});
  res.status(201).json(message);
});
