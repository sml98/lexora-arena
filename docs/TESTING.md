# Guia de testes

## Automático

```bash
npm test
npm audit
```

## Desktop com dois jogadores

1. Execute `npm start`.
2. Abra o endereço impresso no terminal em dois contextos de navegador independentes.
3. Escolha as mesmas opções e entre na fila.
4. Verifique contagem 3–2–1, cronômetro de 120 segundos e compromisso igual.
5. No Quarteto, envie uma palavra e confirme que o outro jogador vê somente o total resolvido.
6. No Contexto, envie uma palavra e confirme que o outro jogador vê somente a posição.
7. Repita a palavra no Contexto e confira `Palavra já usada.`.
8. Recarregue durante a partida e confirme a retomada.
9. Feche uma sessão; após 15 segundos, confirme abandono.

## Mobile

```bash
npm run start:lan -- --port 8080
```

Abra no telefone o IP de rede impresso pelo servidor. Teste 360, 390, 768, 1024 e 1440 px. Confirme ausência de overflow horizontal, navegação inferior, teclado do Quarteto visível, foco do Contexto e `prefers-reduced-motion`.

## Infraestrutura

```bash
docker compose up -d postgres redis
set -a && source .env && set +a
npm run migrate
curl http://localhost:8080/api/health
```

O health check deve indicar PostgreSQL e Redis prontos. Sem Docker, a suíte valida o SQL estaticamente, mas isso não substitui aplicar as migrations em uma instância real.
