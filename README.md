# Léxora Arena

Arena responsiva de jogos competitivos de palavras em português do Brasil e inglês. O projeto roda com Node.js nativo, sem dependências externas de produção.

## Recursos principais

- Quarteto Masters no formato original: quatro tabuleiros simultâneos, nove tentativas e teclado compartilhado.
- Contexto, Termo Blitz e Anagrama Rush.
- Modos de idioma Português, English e Misto.
- Respostas protegidas e processadas no servidor.
- Registro diário persistente que impede a repetição de respostas, inclusive após reiniciar o servidor.
- Interface adaptada para computador, tablet e celular.
- Animações, sons sintetizados, navegação por teclado e suporte a redução de movimento.

## Estoque linguístico

| Idioma | Quarteto/Termo | Anagrama | Contexto |
|---|---:|---:|---:|
| Português | 13.931 | 35.693 | 354 |
| English | 4.564 | 15.207 | 351 |
| Misto | 17.607 | 48.542 | 705 |

As quantidades são finitas. Se um estoque diário for totalmente utilizado, o servidor recusa novas rodadas naquele modo em vez de repetir uma resposta.

## Início rápido

### Requisitos

- Node.js 18 ou superior.
- Git, apenas para clonar ou contribuir com o projeto.

Confirme o Node instalado:

```bash
node --version
```

### Baixar e executar

```bash
git clone https://github.com/sml98/lexora-arena.git
cd lexora-arena
npm start
```

Abra o endereço mostrado no terminal, normalmente `http://localhost:8080`.

Não é necessário executar `npm install`, pois esta versão não possui dependências externas. Se a porta 8080 estiver ocupada, o servidor tenta automaticamente até a porta 8089 e mostra o endereço correto.

## Testar no computador

```bash
npm test
npm start
```

Depois, abra o endereço informado no Chrome, Firefox, Edge ou Safari. O roteiro completo de validação está em [docs/TESTING.md](docs/TESTING.md).

## Testar no celular

Conecte o computador e o celular à mesma rede Wi-Fi e execute:

```bash
npm run start:lan
```

O terminal mostrará um endereço da rede local, por exemplo `http://192.168.1.10:8080`. Digite exatamente esse endereço no navegador do celular. Não use `localhost` no telefone, pois ele apontaria para o próprio celular.

Veja instruções de firewall, redes e solução de problemas em [docs/TESTING.md](docs/TESTING.md).

## Comandos disponíveis

| Comando | Finalidade |
|---|---|
| `npm start` | Executa apenas no computador local. |
| `npm run start:lan` | Permite acesso por outros aparelhos da mesma rede. |
| `npm test` | Executa toda a suíte automatizada. |
| `node server/server.js --port 9000` | Inicia em uma porta escolhida. |
| `node server/server.js --host 0.0.0.0 --port 9000` | Inicia para teste na rede local em uma porta escolhida. |

## Como jogar

As regras, controles, tentativas e critérios de cada modo estão detalhados em [docs/COMO_JOGAR.md](docs/COMO_JOGAR.md).

## Como funciona a não repetição

1. O servidor sorteia a resposta sem enviá-la ao navegador.
2. Cada resposta sorteada é registrada em `data/daily-allocations.json`.
3. Quarteto e Termo compartilham o mesmo estoque diário de palavras.
4. Contexto e Anagrama possuem registros próprios.
5. O registro é mantido após reiniciar o processo e renovado automaticamente quando muda o dia UTC.
6. Uma palavra igual presente nos dois idiomas também não pode ser reutilizada no mesmo dia.

Para uma implantação com várias instâncias do servidor, esse registro deve ser transferido para um banco de dados central com transações atômicas.

## Estrutura do projeto

```text
lexora-arena/
├── index.html
├── styles/main.css
├── scripts/
│   ├── app.js
│   ├── quarteto-engine.js
│   └── words.js
├── server/
│   ├── server.js
│   ├── game-service.js
│   └── dictionaries.generated.js
├── tests/
├── tools/generate-dictionaries.mjs
├── docs/
├── THIRD_PARTY_NOTICES.md
└── package.json
```

## Endpoints locais

| Método | Caminho | Finalidade |
|---|---|---|
| `GET` | `/api/health` | Verifica se o servidor está ativo. |
| `GET` | `/api/catalog` | Informa os estoques disponíveis por idioma. |
| `POST` | `/api/games/start` | Inicia uma sessão protegida. |
| `POST` | `/api/games/guess` | Processa uma tentativa. |
| `POST` | `/api/games/finish` | Finaliza uma rodada cronometrada de Anagrama. |

## Atualizar os dicionários

As listas foram geradas em 29/08/2026 a partir dos dicionários Hunspell mantidos pelo LibreOffice:

- `pt_BR/pt_BR.dic` — português do Brasil.
- `en/en_US.dic` — inglês dos Estados Unidos.

Após baixar os dois arquivos oficiais, execute:

```bash
node tools/generate-dictionaries.mjs /caminho/pt_BR.dic /caminho/en_US.dic
npm test
```

O gerador remove sinalizadores internos do Hunspell, normaliza acentos, elimina duplicatas e recria `server/dictionaries.generated.js`. Consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para fontes, autoria e licenças.

## Limites desta demonstração

O saldo e o depósito são demonstrativos. Uma operação pública, especialmente com dinheiro real, ainda exige autenticação forte, banco de dados transacional, pagamentos reais, proteção contra automação, auditoria antifraude, observabilidade, regras jurídicas e testes de carga.
