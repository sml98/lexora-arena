# Como jogar

## Quarteto

Os dois jogadores recebem quatro palavras secretas idênticas e têm 120 segundos. Cada tentativa de cinco letras é validada no servidor e aplicada aos quatro painéis.

Ordem de decisão:

1. mais palavras resolvidas;
2. menor tempo;
3. menos tentativas;
4. regra determinística vinculada ao compromisso da partida.

O rival vê apenas quantas palavras você resolveu. Ele nunca recebe suas letras ou tentativas.

## Contexto

Os dois jogadores recebem a mesma palavra secreta, o mesmo provedor semântico e 30 tentativas. Uma posição menor indica maior proximidade. A mesma palavra não pode ser enviada duas vezes.

Ordem de decisão:

1. quem descobrir primeiro;
2. menor tempo;
3. menos tentativas;
4. se ninguém descobrir, melhor posição;
5. menos tentativas;
6. regra determinística.

O rival vê apenas a melhor posição na corrida, nunca a palavra digitada.

## Estados

- Casual: grátis e sem alteração de rating.
- Ranked: grátis e altera o rating do jogo.
- Premiado: R$ 5, R$ 10 ou R$ 20, somente quando o gate financeiro estiver integralmente habilitado.
- Torneio: regras e seed controladas pelo servidor.

Use **Melhor de 3** para uma série até duas vitórias. Revanche sempre cria uma nova seed.

## PvP assíncrono

Se não houver rival online, crie um desafio assíncrono e jogue imediatamente. O servidor sela seu resultado e publica somente os metadados do desafio. Outro humano joga depois com a mesma seed, tempo, regras e versão do motor; o primeiro placar só é revelado quando os dois terminarem.

O desafio expira em 24 horas por padrão. Em uma partida premiada, a entrada fica bloqueada e é integralmente devolvida, sem comissão, caso ninguém aceite. O modo premiado continua indisponível enquanto o gate financeiro não estiver homologado.

## Torneios

- Sprint: 32 jogadores mínimos, 64 máximos, entrada de R$ 10 e contagem de três minutos após atingir o mínimo;
- Master: 16 jogadores mínimos, 20 ideais, 24 máximos e entrada de R$ 50;
- pódio: 55% para o primeiro, 30% para o segundo e 15% para o terceiro, calculados sobre os 85% destinados à premiação.

A arrecadação e os prêmios exibidos usam somente inscrições reais. Um novo Sprint é aberto automaticamente quando o anterior começa.
