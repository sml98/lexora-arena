import { REAL_MONEY_ENABLED } from './config.js';
import { activateReadyFinancialTournaments, reconcilePendingPayments } from './financial-service.js';
import { withDistributedLock } from './redis.js';

export function createPaymentWorker({intervalMs=30_000}={}){
  if(!REAL_MONEY_ENABLED)return {close(){},runOnce:async()=>[]};
  let running=false,closed=false;
  const runOnce=async()=>{if(running||closed)return[];running=true;try{return await withDistributedLock('payment-reconciliation',Math.max(intervalMs,20_000),async()=>({payments:await reconcilePendingPayments(),tournaments:await activateReadyFinancialTournaments()}));}catch(error){if(error.code!=='LOCK_BUSY')console.error(JSON.stringify({level:'error',event:'payment_reconciliation_failed',message:error.message}));return[];}finally{running=false;}};
  const timer=setInterval(()=>{void runOnce();},intervalMs);timer.unref();
  return {runOnce,close(){closed=true;clearInterval(timer);}};
}
