# Checklist de produção

Este documento é um bloqueio operacional, não uma declaração de conformidade. A aplicação deve permanecer com `REAL_MONEY_ENABLED=false` até todos os itens serem comprovados.

## Jurídico, empresa e contabilidade

- parecer jurídico escrito e específico para o modelo P2P de habilidade;
- CNPJ, contratos e conta empresarial compatíveis com a operação;
- análise de enquadramento regulatório, tributário, consumerista e de prevenção à lavagem de dinheiro;
- termos de uso e política de privacidade aprovados por profissionais responsáveis;
- definição contábil dos recursos de terceiros, comissão, estornos e conciliação;
- canal de atendimento, contestação e encarregado de dados;
- política de jogo responsável, autoexclusão e proteção de maiores de 18 anos.

O fato de P2P e jogos de habilidade não estarem na modalidade de aposta de quota fixa não é uma autorização automática para operar dinheiro real.

## Fornecedores externos

- contrato empresarial e credenciais da Efí com os escopos Pix necessários;
- certificado mTLS armazenado em cofre de segredos;
- webhook público HTTPS protegido por mTLS em proxy confiável;
- provedor KYC contratado, adaptador implementado e webhook validado;
- validação de titularidade da chave Pix do saque;
- e-mail/SMS transacional configurado para confirmação de contato e recibos.

## Infraestrutura

- PostgreSQL gerenciado com criptografia, alta disponibilidade e point-in-time recovery;
- Redis autenticado/TLS com persistência adequada;
- migrations aplicadas por pipeline controlado;
- HTTPS/WSS, HSTS e lista explícita de origens;
- cofre de segredos, rotação e separação de ambientes;
- filas e workers separados do processo web;
- métricas, alertas, logs centralizados e trilha de auditoria;
- proteção DDoS/WAF, testes de carga e plano de incidentes;
- backups automáticos e restauração testada.

## Segurança e validação

- pentest independente;
- revisão do modelo de ameaças e segregação administrativa;
- CAPTCHA/risk engine para criação de contas;
- adaptador KYC real e prevenção de múltiplas contas;
- revisão antifraude e fluxo de contestação operacional;
- teste ponta a ponta no sandbox do provedor;
- teste de webhook duplicado, atraso, ordem invertida e indisponibilidade;
- teste de reinício entre reserva e liquidação;
- reconciliação contábil aprovada.

## Variáveis que abrem o gate

Além das credenciais e URLs válidas, todas estas condições precisam estar presentes:

```env
REAL_MONEY_ENABLED=true
LEGAL_REVIEW_STATUS=approved
PAYMENT_PROVIDER=efi
PAYMENT_PROVIDER_CONFIGURED=true
WEBHOOK_SECRET_CONFIGURED=true
KYC_PROVIDER=<provedor-contratado>
KYC_PROVIDER_CONFIGURED=true
KYC_PROVIDER_ADAPTER_READY=true
```

Se uma delas faltar, depósitos, cadastro financeiro, filas pagas, torneios financeiros e saques respondem com bloqueio seguro.

## Itens ainda não concluídos neste repositório

- escolha e implementação do adaptador KYC real;
- envio de e-mail/SMS e recibos por fornecedor real;
- autenticação administrativa forte com RBAC e segundo fator (o painel visual atual usa token técnico por sessão);
- adaptador PostgreSQL para tornar desafios assíncronos gratuitos duráveis entre reinícios (a migration e os campos cifrados já estão preparados);
- orquestração automática de todos os confrontos da chave financeira;
- modo espectador por replay público anonimizado;
- implantação, WAF, cofre de segredos, observabilidade externa e testes de carga;
- parecer jurídico, contábil e contratos de fornecedores.
