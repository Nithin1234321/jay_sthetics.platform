import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const isProd = process.env.NODE_ENV === "production";

async function main() {
  const adminEmail=(process.env.ADMIN_EMAIL || "admin@jayaesthetics.com").toLowerCase();
  const adminPassword=process.env.ADMIN_INITIAL_PASSWORD || "ChangeMe123!";
  if(isProd && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_INITIAL_PASSWORD)){
    throw new Error("Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD before production seeding.");
  }
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where:{email:adminEmail},
    update:{role:Role.ADMIN,emailVerifiedAt:new Date(),isActive:true,...(isProd?{passwordHash}:{})},
    create:{email:adminEmail,fullName:"Jay",passwordHash,role:Role.ADMIN,emailVerifiedAt:new Date()}
  });

  if(!isProd){
    const demoHash=await bcrypt.hash("ChangeMe123!",12);
    await prisma.user.upsert({
      where:{email:"client@example.com"},update:{emailVerifiedAt:new Date()},
      create:{email:"client@example.com",fullName:"Demo Client",passwordHash:demoHash,role:Role.CLIENT,emailVerifiedAt:new Date(),clientProfile:{create:{fitnessGoal:"Build lean muscle"}}}
    });
  }

  const programs = [
    {slug:"natural-3-months",name:"Natural Training — 3 Months",pricePaise:900000,durationDays:90,description:"Structured natural training coaching with training, nutrition and progress support."},
    {slug:"natural-6-months",name:"Natural Training — 6 Months",pricePaise:1500000,durationDays:180,description:"Long-term natural coaching with structured progression and accountability."},
    {slug:"enhanced-3-months",name:"Enhanced Training — 3 Months",pricePaise:1200000,durationDays:90,description:"Enhanced coaching with detailed training, nutrition and progress management."},
    {slug:"enhanced-6-months",name:"Enhanced Training — 6 Months",pricePaise:2000000,durationDays:180,description:"Six-month enhanced coaching with complete progress support."}
  ];
  for (const p of programs) await prisma.program.upsert({where:{slug:p.slug},update:p,create:p});

  const availability=[1,2,3,4,5].map(dayOfWeek=>({dayOfWeek,startTime:"10:00",endTime:"18:00",timezone:"Asia/Kolkata"}));
  const count=await prisma.coachAvailability.count();
  if(count===0) await prisma.coachAvailability.createMany({data:availability});
}

main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
