import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { sharedReadCache } from '../boundedCache';
import { evaluateResourceBudget, validResourceSnapshot, type ResourceBudgetSnapshot } from '../resourceBudget';
const PREFIX='resource-budget:v1:';
let retryAfter = 0;
export async function readResourceBudget(now=new Date()) {
  if (+now < retryAfter) throw new Error('RESOURCE_READING_CIRCUIT_OPEN');
  try {
  const rows=await sharedReadCache.read('resource-budget:read',60_000,async()=> {
    const rows=await prisma.apiCache.findMany({where:{key:{startsWith:PREFIX},expiresAt:{gt:now}},select:{payload:true},take:64});
    return rows.map(r=>r.payload).filter(r=>validResourceSnapshot(r,now)) as unknown as ResourceBudgetSnapshot[];
  });
  return evaluateResourceBudget(rows,now);
  } catch (error) {
    retryAfter = +now + 60_000;
    throw error;
  }
}
export async function saveResourceReading(value:unknown,now=new Date()) {
  if(!validResourceSnapshot(value,now)||value.source!=='MANUAL') throw new Error('INVALID_RESOURCE_READING');
  const key=PREFIX+value.metric;
  const payload=JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  const dailyKey=`resource-budget-history:v1:${value.measuredAt.slice(0,10)}:${value.metric}`;
  const historyExpiry=new Date(+now+90*86400_000);
  await prisma.$transaction([
    prisma.apiCache.upsert({where:{key},create:{key,payload,expiresAt:new Date(value.periodEnd)},update:{payload,expiresAt:new Date(value.periodEnd)}}),
    prisma.apiCache.upsert({where:{key:dailyKey},create:{key:dailyKey,payload,expiresAt:historyExpiry},update:{payload,expiresAt:historyExpiry}}),
    // Only this feature's daily summaries; never generic expired cache or prediction history.
    prisma.apiCache.deleteMany({where:{key:{startsWith:'resource-budget-history:v1:'},expiresAt:{lt:now}}}),
  ]);
  sharedReadCache.delete('resource-budget:read');
  retryAfter = 0;
}
