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

O `SemanticProvider` permite trocar o provedor local por embeddings, API ou banco pré-computado. O resultado local é determinístico e o cache usa memória com persistência Redis quando configurada.
