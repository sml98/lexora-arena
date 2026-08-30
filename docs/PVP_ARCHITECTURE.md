# Arquitetura do MVP PVP

## Princípio central

O servidor é a única autoridade da partida. O navegador apresenta estado e envia ações; ele não decide resultado.

```text
Cliente A ─┐                    ┌─ sessão e perfil
           ├─ WebSocket ─ servidor ├─ matchmaking e sala
Cliente B ─┘                    ├─ motor e pontuação
                                └─ Elo, créditos e torneios
```

## Configuração financeira

`server/config.js` exporta `REAL_MONEY_ENABLED=false`. Mesmo que a variável de ambiente seja definida como `true`, o MVP mantém a constante desativada e mostra um aviso no servidor.

Os créditos não representam moeda, não podem ser comprados, sacados ou convertidos e existem apenas durante o processo atual.

## Sessões

`POST /api/pvp/session` cria:

- UUID do jogador;
- token aleatório de 256 bits;
- nome anônimo;
- rating inicial 1000;
- 100 créditos demo;
- entrada inicial no ledger.

O token autentica o WebSocket e operações de perfil/torneio. Em produção ele deve ser substituído por autenticação persistente e cookie seguro.

## Matchmaking

As filas são separadas pela chave `modo:idioma`. Um jogador só pode estar em uma fila ou sala. O servidor não adiciona bots. Quando existem dois sockets humanos conectados:

1. cria uma sala UUID;
2. sorteia um único desafio privado;
3. registra as entradas virtuais;
4. cria duas sessões internas independentes usando o mesmo desafio;
5. envia aos dois somente o desafio público;
6. agenda início e timeout.

## Protocolo WebSocket

### Cliente para servidor

- `queue:join` — `{ mode, language }`;
- `queue:leave`;
- `match:action` — `{ matchId, action: { guess } }`;
- `match:abandon` — `{ matchId }`;
- `match:rematch` — `{ matchId }`;
- `friend:create` — `{ mode, language }`;
- `friend:join` — `{ code }`;
- `ping`.

Qualquer campo como `score`, `winner`, `time`, `rating` ou `points` dentro da ação é recusado.

### Servidor para cliente

- `session:ready`;
- `presence`;
- `queue:joined`, `queue:update`, `queue:left`;
- `match:found`, `match:started`, `match:update`;
- `action:accepted`;
- `opponent:disconnected`, `match:reconnected`;
- `match:ended`;
- `rematch:waiting`;
- `friend:created`;
- `error`.

## Estados da sala

```text
created → countdown → active → ended
                  ↘ timeout ↗
                  ↘ abandonment ↗
```

- `created`: desafio privado e participantes definidos;
- `countdown`: `startAt` e `endAt` publicados;
- `active`: sessões internas criadas e ações aceitas;
- `ended`: resultado imutável, rating e ledger registrados uma vez.

## Reconexão e abandono

Ao perder o socket, o jogador recebe dez segundos para autenticar uma nova conexão. A sala permanece ativa e o rival recebe o estado de desconexão. Se o prazo termina, o servidor encerra por abandono e concede a vitória ao jogador conectado.

## Pontuação e desempate

### Termo

```text
10.000 + tentativas_restantes × 1.000 − piso(tempo_ms ÷ 20)
```

Sem acerto, a pontuação é zero. Se os pontos forem iguais, vence quem concluiu primeiro.

### Anagrama

```text
pontos_da_palavra = tamanho² × 10
placar = soma das palavras válidas e não repetidas
```

### Quarteto

```text
palavras_resolvidas × 3.000
+ tentativas_restantes × 150
− piso(tempo_ms ÷ 50)
```

Todos os valores são calculados a partir de ações aceitas pelo motor no servidor.

## Resultado realista

`getResult()` compara os dois estados e produz:

- resultado e vencedor;
- placares;
- diferença de pontos e tempo;
- tentativas ou palavras;
- maior sequência;
- erros rejeitados;
- frase baseada na diferença observada.

Não existe lógica de “quase vitória” fabricada.

## Elo

O rating inicial é 1000 e o fator K é 32:

```text
esperado = 1 ÷ (1 + 10 ^ ((rating_oponente − rating_atual) ÷ 400))
novo = atual + K × (resultado − esperado)
```

Vitória vale 1, empate 0,5 e derrota 0. As primeiras cinco partidas são marcadas como provisórias.

## Ledger virtual

Cada lançamento registra:

- tipo;
- valor positivo ou negativo;
- saldo anterior e posterior;
- partida ou torneio relacionado;
- descrição;
- data e hora;
- UUID do lançamento.

O cliente recebe uma cópia para exibição, mas não pode criar lançamentos.

## Torneios

`tournament-service.js` aceita tamanhos 8, 16 e 32. Ao lotar:

- cria confrontos eliminatórios;
- avança vencedores automaticamente;
- envia perdedores das semifinais à disputa de terceiro lugar;
- registra primeiro, segundo e terceiro;
- distribui somente créditos virtuais;
- mantém histórico de eventos.

A comissão de 20% é exclusivamente demonstrativa e não movimenta dinheiro.

## Proteções implementadas

- payload WebSocket máximo de 2 KiB;
- 30 ações por dez segundos por jogador;
- 180 requisições HTTP por minuto por endereço;
- limite de 40 caracteres por tentativa;
- lista fechada de campos de ação;
- rejeição de `<` e `>`;
- renderização de tentativas com `textContent`;
- respostas privadas fora do estado público;
- UUIDs de sessão, sala, evento e ledger;
- um jogador por sala;
- resultado e rating idempotentes por sala.

## Limite de escala

Mapas em memória são adequados para teste local e uma única instância. Produção precisa de banco transacional, Redis, locks distribuídos, pub/sub, filas, telemetria e políticas de recuperação.
