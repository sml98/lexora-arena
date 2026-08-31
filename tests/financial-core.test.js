import assert from 'node:assert/strict';
import test from 'node:test';
import { getMoneyReadiness } from '../server/config.js';
import { calculateDuelMoney, calculateTournamentMoney } from '../server/financial-service.js';

test('duelo exibe entrada, pote, comissão e prêmio em centavos',()=>{
  assert.deepEqual(calculateDuelMoney(500,15),{entryCents:500,grossPotCents:1000,commissionPercent:15,commissionCents:150,winnerPrizeCents:850});
});

test('torneio distribui integralmente o pote líquido sem arredondamento perdido',()=>{
  const result=calculateTournamentMoney({size:8,entryCents:2000,commissionPercent:20,distribution:{first:50,second:30,third:20}});
  assert.equal(result.grossPotCents,16000);assert.equal(result.commissionCents,3200);assert.equal(result.prizePoolCents,12800);assert.deepEqual(result.prizes,{first:6400,second:3840,third:2560});assert.equal(Object.values(result.prizes).reduce((sum,value)=>sum+value,0),result.prizePoolCents);
});

test('gate financeiro só abre quando todos os requisitos estão presentes',()=>{
  const complete={requested:true,legalReviewStatus:'approved',paymentProvider:'efi',paymentProviderConfigured:true,webhookSecretConfigured:true,kycProvider:'provedor-contratado',kycProviderConfigured:true,kycProviderAdapterReady:true,databaseUrlConfigured:true,redisUrlConfigured:true,sessionSecretConfigured:true,encryptionKeyConfigured:true,providerCredentialsConfigured:true,webhookVerificationConfigured:true,adminCredentialsConfigured:true};
  assert.equal(getMoneyReadiness(complete).enabled,true);
  assert.equal(getMoneyReadiness({...complete,legalReviewStatus:'pending'}).enabled,false);
  assert.ok(getMoneyReadiness({...complete,kycProviderAdapterReady:false}).blockers.includes('kycProviderAdapter'));
});

test('rejeita valores fracionários, negativos e distribuição inválida',()=>{
  assert.throws(()=>calculateDuelMoney(-1),/centavos/);assert.throws(()=>calculateDuelMoney(10.5),/centavos/);assert.throws(()=>calculateTournamentMoney({size:8,entryCents:100,distribution:{first:50,second:30,third:10}}),/somar 100/);
});
