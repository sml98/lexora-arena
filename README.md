# Léxora Arena

**Palavras. Estratégia. Vitória.**

Plataforma competitiva P2P focada exclusivamente em **Quarteto** e **Contexto**. Os dois jogadores recebem o mesmo desafio, o servidor controla segredos, tempo, validação, resultado e rating, e nenhuma fila cria bots ou usuários fictícios.

## O que está implementado

- Quarteto competitivo: quatro palavras simultâneas, nove tentativas, 120 segundos e teclado próprio;
- Contexto competitivo: corrida semântica determinística, 30 tentativas e bloqueio de palavras repetidas;
- filas Casual e Ranked, com expansão de rating em ±100, ±200 e ±300;
- ratings independentes `quartetoRating` e `contextoRating`, ambos iniciando em 1000;
- divisões de Bronze III a Elite;
- desafios por link, revanche e séries melhor de 3;
- torneios de 8, 16, 32, 64 e 128 jogadores em formatos classificatório, mata-mata e híbrido;
- ranking separado por jogo e períodos diário, semanal, mensal e geral;
- histórico e estatísticas por modalidade;
- WebSocket, reconexão por 15 segundos e derrota por abandono;
- commitment do desafio, cadeia de eventos e sinais graduais de antifraude;
- carteira em centavos, ledger append-only, settlement atômico e idempotência;
- integração Pix Efí preparada, mas bloqueada por padrão;
- PostgreSQL, Redis, migrations, health check, métricas e rotas administrativas protegidas;
- interface responsiva inspirada em arena eSports, com navegação mobile e `prefers-reduced-motion`.

## Requisitos

- Node.js 20 ou superior;
- npm;
- Docker Compose apenas para testar PostgreSQL e Redis;
- navegador moderno.

## Executar no computador

```bash
npm install
npm start
```

Abra [http://localhost:8080](http://localhost:8080). Se a porta estiver ocupada, o servidor escolhe a próxima e imprime o endereço correto.

Para escolher porta e permitir acesso pelo celular na mesma rede:

```bash
npm run start:lan -- --port 8080
```

O terminal mostrará um endereço parecido com `http://192.168.1.50:8080`.

## Testar uma partida P2P no computador

1. Abra a aplicação em uma aba normal.
2. Abra o mesmo endereço em uma janela anônima ou em outro navegador.
3. Nas duas sessões, escolha o mesmo jogo, idioma, tipo e série.
4. Clique em **Jogar** nas duas.
5. Confirme que ambas recebem o mesmo desafio e que o rival vê apenas progresso.
6. No Contexto, envie a mesma palavra duas vezes e confira `Palavra já usada.`.
7. Durante uma partida, recarregue uma aba e confirme que ela retorna ao estado atual.

Cada aba tenta obter uma identidade independente. Uma janela anônima é a forma mais simples de garantir duas sessões.

## Testar no celular

1. Conecte computador e celular ao mesmo Wi-Fi.
2. Execute `npm run start:lan -- --port 8080`.
3. Abra no celular o endereço de rede exibido no terminal.
4. Se não abrir, libere somente a porta escolhida no firewall local.
5. Não use `localhost` no celular: esse endereço apontaria para o próprio telefone.

Checklist mobile:

- largura mínima de 360 px;
- bottom navigation visível;
- nenhum scroll horizontal;
- no Quarteto, quatro painéis em 2×2 e teclado visível com rolagem mínima;
- no Contexto, campo e botão de envio na mesma área;
- foco do teclado não cobre controles críticos.

## Testes e verificações

```bash
npm test
npm audit
npm run check
```

A suíte cobre motores, feedback de letras repetidas, semântica, desempates, privacidade do adversário, matchmaking, ratings, BO3, desafios, antifraude, dinheiro em centavos, idempotência, migrations, WebSocket, reconexão e torneios.

## PostgreSQL e Redis

```bash
cp .env.example .env
docker compose up -d postgres redis
set -a
source .env
set +a
npm run migrate
npm start
```

As migrations são aplicadas em ordem a partir de [`migrations/`](migrations/). O modo gratuito funciona sem PostgreSQL/Redis. Operações financeiras recusam inicialização se a infraestrutura exigida não estiver saudável.

## Dinheiro real e Pix

`ENABLE_REAL_MONEY=false` é o padrão (`REAL_MONEY_ENABLED` permanece como alias de migração). O backend só habilita partidas premiadas se **todos** os requisitos estiverem prontos ao mesmo tempo:

- revisão jurídica explicitamente aprovada;
- PostgreSQL e Redis configurados;
- KYC real contratado e adaptador marcado como pronto;
- credenciais e certificado mTLS do provedor Efí;
- verificação dupla do webhook;
- segredos fortes de sessão, criptografia e administração.

As entradas disponíveis são R$ 2, R$ 5 e R$ 10. A comissão padrão é 15%. Para duas entradas de R$ 5, o backend calcula 1000 centavos de pote, 150 centavos de taxa e 850 centavos de prêmio. Nunca são usados números de ponto flutuante.

Veja [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md), [`docs/PAYMENTS_EFI.md`](docs/PAYMENTS_EFI.md) e [`docs/SECURITY.md`](docs/SECURITY.md). As minutas de termos e privacidade não substituem revisão profissional.

## Estrutura principal

```text
server/
  game-service.js          Quarteto e Contexto
  semantic-provider.js     interface semântica desacoplada
  pvp-engine.js            servidor autoritativo e desempates
  realtime-server.js       WebSocket, fila, desafio e reconexão
  matchmaking-service.js   expansão por rating
  rating-service.js        Elo e divisões
  tournament-service.js    formatos e brackets
  challenge-service.js     links e desafios abertos
  antifraud-service.js     sinais e fraudScore
  financial-service.js     ledger e settlement
scripts/
  app.js                   lobby, ranking e navegação
  pvp.js                   cliente em tempo real
migrations/                esquema PostgreSQL versionado
tests/                     testes nativos do Node
```

## Publicar no GitHub

```bash
git add -A
git commit -m "feat: transforma Lexora em arena competitiva Quarteto e Contexto"
git branch -M main
git remote set-url origin https://github.com/sml98/lexora-arena.git
git pull --rebase origin main
git push -u origin main
```

O GitHub não aceita a senha da conta no terminal. Use um Personal Access Token no campo de senha ou autentique com GitHub CLI (`gh auth login`). Antes de um `pull --rebase`, mantenha o commit local criado; se houver conflito, resolva os arquivos indicados, execute `git add` e `git rebase --continue`.

## Garantias de produto

- não há Termo, Anagrama, Palavra Relâmpago, cassino, odds ou bots ocultos;
- respostas não chegam ao frontend antes do encerramento;
- atividade vazia aparece como estado vazio, nunca como dados inventados;
- saldo e resultado nunca são aceitos do cliente;
- dinheiro real permanece bloqueado até revisão externa e configuração integral.
