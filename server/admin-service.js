import { randomUUID } from 'node:crypto';

const actions=[];
export function recordAdminAction({action,targetType,targetId,reason='',metadata={}}){const entry={id:randomUUID(),action:String(action).slice(0,80),targetType:String(targetType).slice(0,40),targetId:String(targetId).slice(0,160),reason:String(reason).slice(0,500),metadata,createdAt:new Date().toISOString()};actions.unshift(entry);return structuredClone(entry);}
export function listAdminActions(limit=100){return actions.slice(0,Math.max(1,Math.min(Number(limit)||100,500))).map(item=>structuredClone(item));}
