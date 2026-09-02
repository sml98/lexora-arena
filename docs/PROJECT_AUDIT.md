# Auditoria de atualização — MVP competitivo

Data: 2026-09-01

## Arquitetura encontrada

- frontend estático em HTML, CSS e JavaScript modular;
- servidor HTTP nativo do Node.js;
- WebSocket com `ws` e servidor autoritativo;
- serviços separados para jogos, rating, matchmaking, torneios, carteira, pagamentos e antifraude;
- PostgreSQL e Redis opcionais no modo gratuito e obrigatórios no modo financeiro;
- migrations SQL versionadas e testes com `node:test`.

Uma migração para React/Next.js não traria benefício proporcional nesta etapa. A stack atual é pequena, testável e não possui dívida que justifique uma reescrita.

## KEEP

- motores originais de Quarteto e Contexto;
- compromisso criptográfico, cadeia de eventos e privacidade do rival;
- WebSocket, countdown e reconexão;
- ratings independentes, matchmaking progressivo, revanche e BO3;
- ledger append-only, centavos inteiros, idempotência e feature flag financeira fail-closed;
- integração Efí isolada por `PaymentProvider`;
- identidade, KYC abstrato, antifraude e auditoria administrativa;
- design cyber-arena responsivo e acessível.

## REFACTOR

- valores premiados para R$ 5, R$ 10 e R$ 20;
- desafio simples para também suportar resultado assíncrono humano, expiração e reembolso;
- torneio genérico para produtos Sprint 32–64 e Master 16–24;
- pódio para 55% / 30% / 15%;
- histórico para incluir entrada, prêmio, rating anterior e rivalidade;
- métricas técnicas para incluir DAU, pagantes, GMV e receita por período;
- Home para mostrar escolha de entrada e estados assíncronos reais.

## REMOVE / NÃO ADICIONAR

- modos além de Quarteto e Contexto;
- dados de jogadores, partidas ou arrecadação inventados;
- bots ocultos e oponentes de IA;
- loja, assinatura, clãs, afiliados, moedas complexas e estética de aposta;
- dependências de UI desnecessárias. Framer Motion não é compatível com o frontend atual e os movimentos permanecem em CSS com `prefers-reduced-motion`.

## Limites de produção

Dinheiro real continua bloqueado até revisão jurídica, KYC, PostgreSQL, Redis, credenciais do provedor e verificação de webhook estarem integralmente configurados. As migrations e os serviços financeiros podem ser validados localmente, mas isso não equivale a homologação jurídica, bancária ou de segurança externa.
