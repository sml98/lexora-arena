# Segurança e modelo de ameaças

## Ativos protegidos

- credenciais, CPF cifrado e hash de busca separado;
- saldo dos usuários e comissão da plataforma;
- respostas secretas e prova da partida;
- sessões, webhooks e operações idempotentes;
- trilha de auditoria e eventos antifraude.

## Controles implementados

- scrypt com salt por senha;
- tokens opacos persistidos somente como SHA-256;
- CPF com AES-256-GCM e hash HMAC determinístico separado;
- restrição de maioridade também no banco;
- ledger append-only com cadeia de hashes e trigger contra alteração/exclusão;
- buckets separados e valores apenas em centavos inteiros;
- transações `SERIALIZABLE` e linhas de saldo bloqueadas `FOR UPDATE`;
- idempotência em depósitos, saques, reservas, liquidações e webhooks;
- validação de origem, CSP, limites de corpo, payload e frequência;
- servidor PVP autoritativo e campos de pontuação recusados;
- segredo do desafio cifrado no banco e commitment publicado antes do jogo;
- eventos encadeados e revelação auditável após o encerramento;
- detecção inicial de velocidade impossível, foco, bloqueio e denúncia;
- endpoints administrativos protegidos e respostas sem dados sensíveis;
- inicialização recusada quando dinheiro real é solicitado sem infraestrutura saudável.

## Controles que dependem da implantação

- HTTPS/WSS e HSTS no proxy;
- mTLS real do webhook;
- RBAC/2FA para administradores;
- cofre e rotação de segredos;
- rate limiting distribuído e WAF;
- SIEM, alertas, retenção e anonimização de logs;
- verificação KYC, titularidade e múltiplas contas;
- pentest, SAST/DAST e testes de carga.

## Relato responsável

Não inclua CPF, token, certificado ou chave Pix em issues públicas. Defina um canal privado de segurança antes da implantação.
