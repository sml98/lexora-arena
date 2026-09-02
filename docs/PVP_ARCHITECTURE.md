# Arquitetura competitiva

```text
Browser A ─┐                         ┌─ sessão privada Quarteto/Contexto A
           ├─ WebSocket ─ PVP engine ┤
Browser B ─┘                         └─ sessão privada Quarteto/Contexto B
                     │
                     ├─ matchmaking por jogo, tipo, idioma, valor e rating
                     ├─ RatingService independente por modalidade
                     ├─ commitment + cadeia hash de eventos
                     ├─ antifraude por sinais, sem banimento automático
                     └─ settlement/ledger quando premiado
```

O desafio compartilhado contém `sessionOptions` apenas no servidor. O estado público inclui compromisso, duração e progresso sanitizado. A revelação é enviada depois do término e permite conferir o commitment.

Quarteto usa a tupla `(palavras resolvidas desc, tempo asc, tentativas asc, determinístico)`. Contexto usa `(descobriu desc, tempo asc, tentativas asc)` ou, sem descoberta, `(melhor rank asc, tentativas asc, determinístico)`.

Filas começam em ±100 de rating, expandem para ±200 após 10 segundos e ±300 após 20. Bloqueios entre jogadores impedem pareamento. Desconexões têm 15 segundos de tolerância; falha de servidor anula e deve reembolsar partidas premiadas.

Depois de 20 segundos sem pareamento, o cliente oferece PvP assíncrono. O primeiro humano joga uma sessão privada; apenas o commitment e metadados públicos são visíveis. O segundo recebe uma nova sessão sobre o mesmo `sessionOptions`, duração e `engineVersion`. O backend compara resultados, atualiza ratings e só então revela a prova.

Estados assíncronos: `owner_playing → awaiting_opponent → opponent_playing → completed`. `expired` e `cancelled` são terminais. Em partida premiada, cada entrada passa de `available` para `locked`; expiração desfaz `locked` para `available` por operação `refund` idempotente, sem comissão.

O `SemanticProvider` permite trocar o provedor local por embeddings, API ou banco pré-computado. O resultado local é determinístico e o cache usa memória com persistência Redis quando configurada.
