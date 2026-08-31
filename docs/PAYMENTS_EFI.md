# Integração Pix Efí

O adaptador em `server/payments/efi-provider.js` implementa cobrança Pix, consulta, devolução, envio Pix idempotente e consulta do envio. Nenhuma credencial está incluída no repositório.

## Segurança

- use somente conta empresarial compatível com a operação;
- mantenha o certificado P12 em um cofre e injete-o como Base64;
- não registre token OAuth, certificado, CPF, chave Pix completa ou payload sensível;
- limite os escopos da aplicação Efí ao necessário;
- em produção, termine o mTLS do webhook em proxy confiável;
- o proxy deve acrescentar uma prova HMAC interna e assinar exatamente o corpo encaminhado;
- nunca aceite `x-lexora-mtls-verified` vindo diretamente da internet.

## Fluxo de depósito

1. cliente autenticado envia valor em centavos e `Idempotency-Key`;
2. o servidor verifica KYC, contatos, autoexclusão e limite diário;
3. cria `money_operations` em `created`;
4. a Efí cria uma cobrança idempotente por `txid`;
5. a operação fica `pending`; nenhum saldo é creditado;
6. webhook verificado ou reconciliação confirma valor e identificador;
7. uma entrada imutável credita somente `available`;
8. webhook duplicado é ignorado pela chave externa única.

## Fluxo de saque

1. servidor valida saldo disponível, mínimo, KYC e titularidade por CPF;
2. move o valor de `available` para `withdrawal_processing`;
3. envia Pix com `idEnvio` derivado da chave de idempotência;
4. aguarda webhook ou consulta de reconciliação;
5. conclusão consome `withdrawal_processing`; rejeição devolve ao disponível;
6. erro 5xx não gera outro identificador: o worker consulta antes de repetir.

## Webhook

Rota: `POST /api/webhooks/efi/pix`.

Cabeçalhos internos exigidos:

- `x-lexora-mtls-verified`: HMAC SHA-256 de `efi-mtls-verified` com `WEBHOOK_TRUSTED_PROXY_SECRET`;
- `x-lexora-webhook-signature`: HMAC SHA-256 do corpo bruto com `WEBHOOK_SECRET`.

Essa camada complementa o mTLS da Efí; não o substitui.

## Sandbox

Use `EFI_SANDBOX=true` e credenciais exclusivas de homologação. O sandbox serve para testes do provedor e nunca cria saldo de produção. Não execute os testes integrados da Efí contra uma conta pessoal.
