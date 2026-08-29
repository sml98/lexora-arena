/**
 * Neon Fortune Slots - SQLite Database Manager
 * Utiliza o módulo nativo node:sqlite do Node.js 22.
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'casino.db');
export const db = new DatabaseSync(DB_PATH);

// Ativar modo WAL (Write-Ahead Logging) e chaves estrangeiras
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY,
    balance REAL DEFAULT 0.00,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, /* 'DEPOSIT', 'WITHDRAW', 'BET', 'WIN' */
    amount REAL NOT NULL,
    status TEXT NOT NULL, /* 'PENDING', 'COMPLETED', 'FAILED' */
    reference_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS game_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    bet_amount REAL NOT NULL,
    win_amount REAL NOT NULL,
    grid_json TEXT NOT NULL,
    winning_lines_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  /* TABELAS DO LÉXORA - TORNEIOS & ARENA MULTI-JOGOS */
  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    game_type TEXT NOT NULL, /* 'quarteto', 'contexto', 'termo_blitz', 'anagrama' */
    entry_fee REAL NOT NULL,
    max_players INTEGER NOT NULL,
    rake_percent REAL DEFAULT 20.0,
    status TEXT DEFAULT 'OPEN', /* 'OPEN', 'RUNNING', 'COMPLETED' */
    prize_pot REAL DEFAULT 0.00,
    platform_profit REAL DEFAULT 0.00,
    is_daily_major INTEGER DEFAULT 0,
    starts_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tournament_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT,
    score INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    time_seconds INTEGER DEFAULT 0,
    rank INTEGER DEFAULT 0,
    payout REAL DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS powerup_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    powerup_type TEXT NOT NULL, /* 'HINT_GREEN', 'HINT_CONTEXTO', 'ELIMINATE_3', 'EXTRA_ATTEMPT' */
    price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

/**
 * Cria um novo usuário e inicializa sua carteira
 */
export function createUser(username, email, passwordHash, salt) {
  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password_hash, salt)
    VALUES (?, ?, ?, ?)
  `);
  const result = insertUser.run(username, email, passwordHash, salt);
  const userId = result.lastInsertRowid;

  // Inicializa a carteira com R$ 0.00
  const insertWallet = db.prepare(`
    INSERT INTO wallets (user_id, balance)
    VALUES (?, 0.00)
  `);
  insertWallet.run(userId);

  return { id: userId, username, email };
}

/**
 * Busca usuário por e-mail ou nome de usuário
 */
export function getUserByEmailOrUsername(identifier) {
  const stmt = db.prepare(`
    SELECT * FROM users
    WHERE email = ? OR username = ?
    LIMIT 1
  `);
  return stmt.get(identifier, identifier);
}

/**
 * Busca usuário por ID
 */
export function getUserById(id) {
  const stmt = db.prepare(`
    SELECT id, username, email, created_at FROM users
    WHERE id = ?
    LIMIT 1
  `);
  return stmt.get(id);
}

/**
 * Retorna saldo da carteira do usuário
 */
export function getWallet(userId) {
  const stmt = db.prepare(`
    SELECT balance, updated_at FROM wallets
    WHERE user_id = ?
    LIMIT 1
  `);
  const row = stmt.get(userId);
  return row ? row.balance : 0.00;
}

/**
 * Atualiza saldo da carteira
 */
export function updateWalletBalance(userId, newBalance) {
  const stmt = db.prepare(`
    UPDATE wallets
    SET balance = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `);
  stmt.run(Math.round(newBalance * 100) / 100, userId);
}

/**
 * Cria transação de depósito
 */
export function createDepositTransaction(userId, amount, refCode) {
  const stmt = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, status, reference_code)
    VALUES (?, 'DEPOSIT', ?, 'PENDING', ?)
  `);
  const res = stmt.run(userId, amount, refCode);
  return res.lastInsertRowid;
}

/**
 * Confirma pagamento de depósito e credita o saldo
 */
export function completeDeposit(transactionId) {
  const getTx = db.prepare(`
    SELECT * FROM transactions WHERE id = ? AND status = 'PENDING'
  `);
  const tx = getTx.get(transactionId);
  if (!tx) return null;

  // Atualizar status da transação
  const updateTx = db.prepare(`
    UPDATE transactions
    SET status = 'COMPLETED'
    WHERE id = ?
  `);
  updateTx.run(transactionId);

  // Adicionar fundos à carteira
  const currentBalance = getWallet(tx.user_id);
  const newBalance = currentBalance + tx.amount;
  updateWalletBalance(tx.user_id, newBalance);

  return { transactionId, userId: tx.user_id, credited: tx.amount, newBalance };
}

/**
 * Cria solicitação de saque e deduz o saldo imediatamente
 */
export function createWithdrawal(userId, amount, pixKey, pixType) {
  const currentBalance = getWallet(userId);
  if (currentBalance < amount) {
    throw new Error('Saldo insuficiente para realizar o saque.');
  }

  const newBalance = currentBalance - amount;
  updateWalletBalance(userId, newBalance);

  const refCode = `SAQUE_${pixType.toUpperCase()}_${Date.now()}`;
  const stmt = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, status, reference_code)
    VALUES (?, 'WITHDRAW', ?, 'COMPLETED', ?)
  `);
  const res = stmt.run(userId, amount, refCode);

  return {
    transactionId: res.lastInsertRowid,
    userId,
    withdrawn: amount,
    newBalance,
    refCode
  };
}

/**
 * Registra rodada de jogo e ajusta saldo da aposta e do prêmio
 */
export function recordGameRound(userId, betAmount, winAmount, grid, winningLines) {
  const currentBalance = getWallet(userId);
  if (currentBalance < betAmount) {
    throw new Error('Saldo insuficiente para realizar a aposta.');
  }

  const newBalance = currentBalance - betAmount + winAmount;
  updateWalletBalance(userId, newBalance);

  // Registrar rodada
  const stmt = db.prepare(`
    INSERT INTO game_rounds (user_id, bet_amount, win_amount, grid_json, winning_lines_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    userId,
    betAmount,
    winAmount,
    JSON.stringify(grid),
    JSON.stringify(winningLines)
  );

  return newBalance;
}

/**
 * Retorna histórico de transações de um usuário
 */
export function getUserTransactions(userId, limit = 20) {
  const stmt = db.prepare(`
    SELECT id, type, amount, status, reference_code, created_at
    FROM transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit);
}

/**
 * Inicializa as salas padrão de torneios do Léxora
 */
export function initDefaultTournaments() {
  const defaultRooms = [
    {
      id: 'tour_daily_major',
      title: '👑 LÉXORA GRAND MAJOR (Torneio Diário)',
      game_type: 'quarteto',
      entry_fee: 20.00,
      max_players: 50,
      rake_percent: 20.0,
      is_daily_major: 1,
      prize_pot: 1000.00,
      platform_profit: 200.00
    },
    {
      id: 'tour_quarteto_4p',
      title: '🧠 Quarteto Masters • Mesa Quádrupla',
      game_type: 'quarteto',
      entry_fee: 10.00,
      max_players: 4,
      rake_percent: 20.0,
      is_daily_major: 0,
      prize_pot: 40.00,
      platform_profit: 8.00
    },
    {
      id: 'tour_quarteto_10p',
      title: '🏆 Quarteto Blitz • 10 Jogadores',
      game_type: 'quarteto',
      entry_fee: 10.00,
      max_players: 10,
      rake_percent: 20.0,
      is_daily_major: 0,
      prize_pot: 100.00,
      platform_profit: 20.00
    },
    {
      id: 'tour_contexto_duel',
      title: '🌐 Contexto Duelo 1x1 • Semântica',
      game_type: 'contexto',
      entry_fee: 10.00,
      max_players: 2,
      rake_percent: 15.0,
      is_daily_major: 0,
      prize_pot: 20.00,
      platform_profit: 3.00
    },
    {
      id: 'tour_contexto_4p',
      title: '🌐 Contexto Arena • 4 Jogadores',
      game_type: 'contexto',
      entry_fee: 10.00,
      max_players: 4,
      rake_percent: 20.0,
      is_daily_major: 0,
      prize_pot: 40.00,
      platform_profit: 8.00
    },
    {
      id: 'tour_termo_duel_5',
      title: '⚡ Termo Blitz 1x1 • Express (60s)',
      game_type: 'termo_blitz',
      entry_fee: 5.00,
      max_players: 2,
      rake_percent: 15.0,
      is_daily_major: 0,
      prize_pot: 10.00,
      platform_profit: 1.50
    },
    {
      id: 'tour_termo_duel_10',
      title: '⚡ Termo Blitz 1x1 • Duelo Pro (60s)',
      game_type: 'termo_blitz',
      entry_fee: 10.00,
      max_players: 2,
      rake_percent: 15.0,
      is_daily_major: 0,
      prize_pot: 20.00,
      platform_profit: 3.00
    },
    {
      id: 'tour_anagrama_4p',
      title: '🔤 Anagrama Rush • 4 Jogadores (90s)',
      game_type: 'anagrama',
      entry_fee: 10.00,
      max_players: 4,
      rake_percent: 20.0,
      is_daily_major: 0,
      prize_pot: 40.00,
      platform_profit: 8.00
    }
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tournaments 
    (id, title, game_type, entry_fee, max_players, rake_percent, status, prize_pot, platform_profit, is_daily_major)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
  `);

  for (const room of defaultRooms) {
    stmt.run(
      room.id,
      room.title,
      room.game_type,
      room.entry_fee,
      room.max_players,
      room.rake_percent,
      room.prize_pot,
      room.platform_profit,
      room.is_daily_major
    );
  }
}

// Inicializar salas padrão automaticamente
initDefaultTournaments();

/**
 * Lista todos os torneios ativos com contagem de inscritos
 */
export function listTournaments() {
  const stmt = db.prepare(`
    SELECT t.*, COUNT(tp.id) as registered_count
    FROM tournaments t
    LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
    GROUP BY t.id
    ORDER BY t.is_daily_major DESC, t.created_at ASC
  `);
  return stmt.all();
}

/**
 * Inscreve usuário em um torneio e deduz a taxa de entrada da carteira
 */
export function joinTournament(tournamentId, userId, username) {
  const tStmt = db.prepare(`SELECT * FROM tournaments WHERE id = ?`);
  const tournament = tStmt.get(tournamentId);
  if (!tournament) throw new Error('Torneio não encontrado.');

  const currentBalance = getWallet(userId);
  if (currentBalance < tournament.entry_fee) {
    throw new Error(`Saldo insuficiente. Taxa de inscrição: R$ ${tournament.entry_fee.toFixed(2)}`);
  }

  // Deduzir taxa de inscrição
  const newBalance = currentBalance - tournament.entry_fee;
  updateWalletBalance(userId, newBalance);

  // Registrar transação
  const txStmt = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, status, reference_code)
    VALUES (?, 'BET', ?, 'COMPLETED', ?)
  `);
  txStmt.run(userId, tournament.entry_fee, `INSCRICAO_${tournament.id}`);

  // Registrar participante
  const pStmt = db.prepare(`
    INSERT INTO tournament_participants (tournament_id, user_id, username)
    VALUES (?, ?, ?)
  `);
  const res = pStmt.run(tournamentId, userId, username);

  return {
    participantId: res.lastInsertRowid,
    tournamentId,
    entryFee: tournament.entry_fee,
    newBalance
  };
}

/**
 * Registra a compra de um power-up na loja
 */
export function buyPowerup(userId, powerupType, price) {
  const currentBalance = getWallet(userId);
  if (currentBalance < price) {
    throw new Error('Saldo insuficiente para comprar esta dica.');
  }

  const newBalance = currentBalance - price;
  updateWalletBalance(userId, newBalance);

  const txStmt = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, status, reference_code)
    VALUES (?, 'BET', ?, 'COMPLETED', ?)
  `);
  txStmt.run(userId, price, `STORE_${powerupType}`);

  const pStmt = db.prepare(`
    INSERT INTO powerup_purchases (user_id, powerup_type, price)
    VALUES (?, ?, ?)
  `);
  pStmt.run(userId, powerupType, price);

  return { newBalance, powerupType };
}

