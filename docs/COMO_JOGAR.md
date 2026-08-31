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
- Premiado: R$ 2, R$ 5 ou R$ 10, somente quando o gate financeiro estiver integralmente habilitado.
- Torneio: regras e seed controladas pelo servidor.

Use **Melhor de 3** para uma série até duas vitórias. Revanche sempre cria uma nova seed.
