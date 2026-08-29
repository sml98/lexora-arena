# 🏛️ LÉXORA ARENA - Hub de Jogos de Habilidade Verbal & Torneios PIX

Plataforma completa de jogos de habilidade e raciocínio verbal com premiações em PIX e modelo de intermediação tecnológica (Rake garantido de 20%). 100% legalizado no Brasil.

---

## 🎮 Modalidades de Jogos Integradas

1. **🧠 Quarteto Masters**: 4 palavras de 5 letras simultâneas em até 9 tentativas.
2. **🌐 Contexto Arena**: Adivinhação por proximidade semântica (ranking de #1 a #50.000 com barras térmicas quente/frio).
3. **⚡ Termo Blitz 1x1**: Duelo rápido de 1 palavra em 60 segundos com pontuação de velocidade.
4. **🔤 Anagrama Rush**: Roda interativa de 6 letras para formar o maior número de palavras em 90 segundos.

---

## 👑 Grande Torneio Diário das 21:00 (LÉXORA Grand Major)

* **Capacidade**: 50 competidores x R$ 20,00 = **Pote de R$ 1.000,00**
* **Lucro da Plataforma (Rake 20%)**: **R$ 200,00 / noite** (~R$ 6.000,00 / mês)
* **Premiação do TOP 5**:
  * 🥇 1º Lugar (50% do pote líquido): **R$ 400,00**
  * 🥈 2º Lugar (25%): **R$ 200,00**
  * 🥉 3º Lugar (15%): **R$ 120,00**
  * 🎖️ 4º Lugar (6%): **R$ 48,00**
  * 🎖️ 5º Lugar (4%): **R$ 32,00**

---

## 🚀 Como Rodar o Projeto

### 1. Iniciar o Servidor Backend (Node.js nativo + SQLite):
```bash
node server/server.js
```
O servidor estará rodando em: `http://localhost:8080`

### 2. Rodar os Testes Automatizados:
```bash
node tests/lexora-ecosystem.test.js
node tests/quarteto-engine.test.js
node tests/quarteto-api.test.js
```

---

## 📂 Estrutura de Diretórios

```
lexora-arena/
├── index.html            # Interface de 2 telas (Lobby + Arena Focada)
├── styles/
│   └── main.css          # Estilos Cyber-Luxury, Glassmorphism e responsividade
├── scripts/
│   ├── app.js            # Controlador da aplicação e transição de telas
│   ├── ui.js             # Renderização dos 4 jogos, lobby e pódio
│   ├── audio.js          # Efeitos sonoros sintetizados (Web Audio API)
│   ├── particles.js      # Partículas aceleradas (Canvas)
│   ├── quarteto-engine.js# Motor do Quarteto Masters e matemática de Rake
│   ├── contexto-engine.js# Motor do Contexto (semântica em português)
│   ├── termo-engine.js   # Motor do Termo Blitz 1x1
│   ├── anagrama-engine.js# Motor do Anagrama Rush
│   └── words.js          # Dicionário léxico em português (7.479 palavras)
├── server/
│   ├── server.js         # Servidor HTTP REST API nativo
│   ├── db.js             # Banco SQLite com carteira, torneios e compras
│   └── auth.js           # Autenticação JWT e hash seguro
├── tests/                # Suíte de testes automatizados
└── README.md
```
