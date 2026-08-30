# Léxora Arena — MVP PVP

> **1 minuto. 1 adversário. 1 vencedor.**

MVP técnico de uma arena de duelos de palavras em tempo real. Dois jogadores entram na mesma sala, recebem exatamente o mesmo desafio e têm o resultado calculado pelo servidor.

> Este projeto usa exclusivamente créditos virtuais de demonstração. Dinheiro real, PIX, depósito, saque, KYC e premiações financeiras não estão implementados. `REAL_MONEY_ENABLED` permanece `false`.

## O que funciona

- sessões anônimas temporárias, uma por aba;
- fila de matchmaking por modo e idioma;
- salas PVP 1x1 via WebSocket;
- contagem regressiva sincronizada pelo horário do servidor;
- Termo Blitz, Anagrama Rush e Quarteto Masters competitivos;
- Contexto gratuito como treino semântico;
- pontuação, tempo, vitória, derrota e empate calculados no servidor;
- reconexão com tolerância de dez segundos;
- abandono, timeout e encerramento seguro;
- revanche opcional com a mesma entrada virtual;
- resultado comparativo e frase baseada no desempenho real;
- convite de amigo por link temporário;
- cartão textual de resultado sem revelar respostas antecipadamente;
- rating Elo, cinco partidas provisórias, nível, sequência e histórico;
- rankings geral, diário e semanal, com filtros preparados para cidade/estado;
- créditos virtuais e ledger controlados pelo servidor;
- motor demonstrativo de torneios com 8, 16 e 32 jogadores, chave eliminatória, terceiro lugar, pódio e histórico; o lobby permite inscrição e visualização da chave;
- Português, English e modo Misto;
- interface responsiva e acessível para computador e celular.

## Instalação

Requer Node.js 18 ou superior.

```bash
git clone https://github.com/sml98/lexora-arena.git
cd lexora-arena
npm install
npm test
npm start
```

Abra o endereço informado no terminal, normalmente `http://localhost:8080`. Se a porta estiver ocupada, o servidor tenta automaticamente até a porta 8089.

## Testar o PVP em duas abas

1. Execute `npm start`.
2. Abra `http://localhost:8080` em duas abas independentes.
3. Aguarde cada aba mostrar um nome `Jogador-XXXX` diferente.
4. Nas duas abas, escolha o mesmo idioma e o mesmo modo.
5. Clique em **Duelo** nas duas abas.
6. Confirme que os nomes aparecem como adversários e a contagem começa ao mesmo tempo.
7. Faça tentativas nas duas abas.
8. Para testar abandono, feche uma aba e aguarde dez segundos.
9. Na tela final, confira placar, tempo, diferença, Elo, créditos e botão de revanche.

Se o navegador duplicar o armazenamento da aba original, o cliente detecta a colisão e cria automaticamente uma segunda sessão anônima.

O roteiro detalhado para computador, celular e ferramentas responsivas está em [docs/TESTING.md](docs/TESTING.md).

## Testar no celular

Conecte computador e celular ao mesmo Wi-Fi e execute:

```bash
npm run start:lan
```

Abra no celular o endereço de rede impresso no terminal, por exemplo `http://192.168.1.10:8080`. Não use `localhost` no telefone.

Para um duelo entre computador e celular, abra a arena uma vez em cada aparelho, selecione a mesma combinação de modo/idioma e entre na fila nos dois.

## Comandos

| Comando | Finalidade |
|---|---|
| `npm install` | Instala a única dependência de produção, `ws`. |
| `npm start` | Inicia para uso no computador local. |
| `npm run start:lan` | Expõe a arena na rede local para testes móveis. |
| `npm test` | Executa toda a suíte automatizada. |
| `node server/server.js --port 9000` | Escolhe uma porta. |
| `node server/server.js --host 0.0.0.0 --port 9000` | Escolhe host e porta para a rede local. |

## Fluxo do matchmaking

1. O navegador cria ou retoma uma sessão anônima.
2. O WebSocket é autenticado com o identificador e o token temporário da sessão.
3. O jogador entra na fila correspondente a `modo + idioma`.
4. O servidor retira dois jogadores reais da mesma fila.
5. Uma única resposta privada é sorteada para a sala.
6. O servidor desconta dois créditos virtuais de cada jogador e registra o ledger.
7. Os dois clientes recebem apenas a parte pública e idêntica do desafio.
8. A partida começa após três segundos, usando `startAt` e `endAt` do servidor.
9. O cliente envia somente ações, como `{ guess: "TERMO" }`.
10. O servidor valida, pontua e publica o estado.
11. Ao terminar, o vencedor recebe quatro créditos virtuais; em empate, as duas entradas são devolvidas.
12. O Elo e o histórico são atualizados sem aceitar valores fornecidos pelo cliente.

## Modos e pontuação

### Termo Blitz

- mesma palavra secreta para os dois jogadores;
- seis tentativas e 60 segundos;
- vitória vale uma base de 10.000 pontos;
- tentativas restantes acrescentam pontos;
- tempo decorrido reduz o total e desempata desempenhos iguais.

### Anagrama Rush

- mesmas seis letras e 60 segundos;
- palavra repetida não pontua;
- palavra precisa existir e usar apenas as letras disponíveis;
- cada palavra vale `tamanho² × 10` pontos.

### Quarteto Masters

- mesmas quatro palavras e nove tentativas;
- uma tentativa é aplicada aos quatro tabuleiros;
- cada palavra resolvida vale 3.000 pontos;
- tentativas restantes geram bônus;
- tempo decorrido é usado no refinamento do placar.

### Contexto

Permanece como treino gratuito. A posição é determinística: palavras do mesmo grupo semântico recebem as melhores posições; grupos próximos recebem posições intermediárias; as demais usam um hash estável de `resposta + tentativa`. Uma palavra repetida é recusada.

Detalhes adicionais estão em [docs/COMO_JOGAR.md](docs/COMO_JOGAR.md) e [docs/PVP_ARCHITECTURE.md](docs/PVP_ARCHITECTURE.md).

## Autoridade e segurança

O cliente nunca informa pontuação, vencedor, tempo final, rating ou prêmio. O backend controla:

- respostas privadas;
- início e término da partida;
- tentativas válidas;
- placar e desempate;
- créditos e ledger;
- Elo, vitórias, derrotas e sequência;
- avanço das chaves de torneio.

Também existem limite de payload WebSocket, rate limit HTTP e por ação, validação de campos permitidos, bloqueio de HTML em tentativas, prevenção de jogador duplicado na mesma sala e registro de eventos por partida.

## Interface comum dos jogos

O módulo `server/pvp-engine.js` oferece:

- `createMatch()`;
- `startMatch()`;
- `submitAction()`;
- `validateAction()`;
- `calculateScore()`;
- `finishMatch()`;
- `getResult()`;
- `getRematchData()`.

Os três modos PVP passam por esse contrato e reutilizam os motores autoritativos existentes.

## Estrutura principal

```text
server/
├── config.js                # REAL_MONEY_ENABLED=false e limites
├── server.js                # HTTP, APIs e arquivos estáticos
├── realtime-server.js       # WebSocket, fila, salas e reconexão
├── pvp-engine.js            # contrato comum e resultado competitivo
├── player-store.js          # sessão, Elo, créditos, ledger e histórico
├── tournament-service.js    # chaves virtuais e pódio
├── game-service.js          # motores autoritativos e desafios
└── dictionaries.generated.js

scripts/
├── app.js                   # treino e interface compartilhada
└── pvp.js                   # cliente WebSocket e telas PVP
```

## APIs principais

| Método | Caminho | Finalidade |
|---|---|---|
| `GET` | `/api/config` | Confirma configuração e dinheiro real desativado. |
| `POST` | `/api/pvp/session` | Cria ou retoma sessão anônima. |
| `POST` | `/api/pvp/profile` | Atualiza o nome público autenticado. |
| `GET` | `/api/rankings?period=all` | Ranking geral, diário ou semanal. |
| `GET` | `/api/tournaments` | Torneios e chaves virtuais. |
| `POST` | `/api/tournaments/join` | Inscrição com créditos demo. |
| `GET` | `/api/catalog` | Estoques linguísticos. |
| `GET` | `/api/health` | Saúde do servidor. |
| `WS` | `/ws` | Matchmaking e eventos da partida. |

## Estoque linguístico

| Idioma | Quarteto/Termo | Anagrama | Contexto |
|---|---:|---:|---:|
| Português | 13.931 | 35.693 | 354 |
| English | 4.564 | 15.207 | 351 |
| Misto | 17.607 | 48.542 | 705 |

As respostas não são recicladas no mesmo dia. Ao esgotar um estoque, o servidor recusa uma nova rodada em vez de repetir conteúdo.

## Limitações conhecidas

- sessões, perfis, créditos, Elo, filas e torneios ficam em memória e são perdidos ao reiniciar;
- o ledger de respostas diárias usa arquivo local e não suporta várias instâncias concorrentes;
- o token WebSocket é temporário e ainda não usa cookie seguro ou conta permanente;
- convite de amigo funciona somente enquanto o servidor e o criador permanecem online;
- não há moderação de nomes, CAPTCHA, detecção comportamental avançada ou proteção DDoS;
- não há observabilidade distribuída, métricas, fila externa ou testes de carga;
- não há dinheiro real nem conformidade financeira/jurídica;
- o Quarteto preserva o formato de quatro tabuleiros do projeto, não um jogo de agrupamento por categorias.
- o motor de torneios está testado, mas a orquestração automática de cada confronto PVP da chave ainda é um próximo passo.

## Próximos passos para produção

1. PostgreSQL para perfis, ledger, partidas, ratings e torneios.
2. Redis para presença, matchmaking, locks e pub/sub entre instâncias.
3. autenticação permanente, cookies seguros e rotação de sessão;
4. transações atômicas e idempotência para créditos;
5. observabilidade, auditoria antifraude e detecção de automação;
6. testes de carga, caos, latência e reconexão em múltiplas regiões;
7. moderação, privacidade, termos de uso e revisão jurídica;
8. somente depois dessas etapas, uma decisão separada sobre qualquer recurso financeiro.

Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para as fontes e licenças dos dicionários.
