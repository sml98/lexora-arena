import assert from 'node:assert/strict';
import test from 'node:test';
import { ageOnDate, decryptSensitive, encryptSensitive, hashPassword, hmacSha256, safeEqualHex, validateCpf, verifyPassword, verifyWebhookEnvelope } from '../server/security.js';
import { validateRegistration } from '../server/identity-service.js';

test('valida CPF, maioridade e consentimentos obrigatórios',()=>{
  assert.equal(validateCpf('529.982.247-25'),true);
  assert.equal(validateCpf('111.111.111-11'),false);
  assert.equal(ageOnDate('2000-08-30',new Date('2026-08-30T12:00:00Z')),26);
  assert.throws(()=>validateRegistration({name:'Jogador Teste',email:'jogador@lexora.test',phone:'+5511999999999',cpf:'52998224725',birthDate:'2010-01-01',password:'senha-segura-123',termsAccepted:true,privacyAccepted:true},new Date('2026-08-30T12:00:00Z')),/maiores de 18/);
});

test('senha usa scrypt com salt e comparação segura',async()=>{
  const first=await hashPassword('senha-segura-123'),second=await hashPassword('senha-segura-123');
  assert.notEqual(first,second);assert.equal(await verifyPassword('senha-segura-123',first),true);assert.equal(await verifyPassword('senha-errada-123',first),false);
});

test('CPF pode ser cifrado sem aparecer no payload persistido',()=>{
  const previous=process.env.DATA_ENCRYPTION_KEY;process.env.DATA_ENCRYPTION_KEY='teste-local-com-mais-de-trinta-e-dois-caracteres';
  try{const encrypted=encryptSensitive('52998224725');assert.doesNotMatch(encrypted,/52998224725/);assert.equal(decryptSensitive(encrypted),'52998224725');}
  finally{if(previous===undefined)delete process.env.DATA_ENCRYPTION_KEY;else process.env.DATA_ENCRYPTION_KEY=previous;}
});

test('webhook exige simultaneamente assinatura do corpo e prova do proxy mTLS',()=>{
  const oldWebhook=process.env.WEBHOOK_SECRET,oldProxy=process.env.WEBHOOK_TRUSTED_PROXY_SECRET;
  process.env.WEBHOOK_SECRET='segredo-webhook-teste';process.env.WEBHOOK_TRUSTED_PROXY_SECRET='segredo-proxy-teste';const raw='{"pix":[]}';
  try{const headers={'x-lexora-webhook-signature':hmacSha256(raw,process.env.WEBHOOK_SECRET),'x-lexora-mtls-verified':hmacSha256('efi-mtls-verified',process.env.WEBHOOK_TRUSTED_PROXY_SECRET)};assert.equal(verifyWebhookEnvelope(raw,headers),true);assert.equal(verifyWebhookEnvelope(`${raw} `,headers),false);assert.equal(safeEqualHex(headers['x-lexora-webhook-signature'],'00'),false);}
  finally{if(oldWebhook===undefined)delete process.env.WEBHOOK_SECRET;else process.env.WEBHOOK_SECRET=oldWebhook;if(oldProxy===undefined)delete process.env.WEBHOOK_TRUSTED_PROXY_SECRET;else process.env.WEBHOOK_TRUSTED_PROXY_SECRET=oldProxy;}
});
