/**
 * Quarteto Bet - Full-Stack HTTP Server & REST API
 * Servidor nativo Node.js com SQLite, Autenticação JWT, Carteira PIX Sandbox e Backend do Quarteto Bet.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createUser,
  getUserByEmailOrUsername,
  getUserById,
  getWallet,
  createDepositTransaction,
  completeDeposit,
  createWithdrawal,
  recordGameRound,
  getUserTransactions,
  listTournaments,
  joinTournament,
  buyPowerup
} from './db.js';

import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  extractTokenFromHeader
} from './auth.js';

import {
  createQuartetoRound,
  processQuartetoGuess,
  calculateTournamentPayouts,
  GAME_MODES
} from '../scripts/quarteto-engine.js';

import {
  createContextoRound,
  processContextoGuess
} from '../scripts/contexto-engine.js';

import {
  createTermoBlitzRound,
  processTermoBlitzGuess
} from '../scripts/termo-engine.js';

import {
  createAnagramaRound,
  submitAnagramaWord
} from '../scripts/anagrama-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..');

const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Armazenamento em memória das partidas ativas do Quarteto Bet
const activeQuartetoSessions = new Map();

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Corpo da requisição excedeu o limite.'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (err) {
        reject(new Error('JSON inválido no corpo da requisição.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function authenticateRequest(req) {
  const token = extractTokenFromHeader(req.headers['authorization']);
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Sanitiza o estado da partida para não vazar as palavras secretas antes da hora
 */
function sanitizeRoundForClient(round) {
  return {
    id: round.id,
    mode: round.mode,
    betAmount: round.betAmount,
    currentPot: round.currentPot,
    burnPenalty: round.burnPenalty,
    attemptsCount: round.attemptsCount,
    maxAttempts: round.maxAttempts,
    solvedCount: round.solvedCount,
    isFinished: round.isFinished,
    isWin: round.isWin,
    payout: round.payout,
    multiplierApplied: round.multiplierApplied,
    message: round.message,
    // Se a partida terminou, revela os segredos; senão apenas revela se resolvido
    quadrants: round.quadrants.map(q => ({
      id: q.id,
      solved: q.solved,
      solvedAtAttempt: q.solvedAtAttempt,
      secret: (round.isFinished || q.solved) ? q.secret : null,
      guesses: q.guesses
    }))
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // ========================================================================
    // ROTAS DE AUTENTICAÇÃO
    // ========================================================================

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { username, email, password } = body;

      if (!username || !email || !password) {
        return sendJson(res, 400, { error: 'Preencha nome de usuário, e-mail e senha.' });
      }
      if (username.length < 3) {
        return sendJson(res, 400, { error: 'O nome de usuário deve ter pelo menos 3 caracteres.' });
      }
      if (password.length < 6) {
        return sendJson(res, 400, { error: 'A senha deve conter pelo menos 6 caracteres.' });
      }

      const existing = getUserByEmailOrUsername(email) || getUserByEmailOrUsername(username);
      if (existing) {
        return sendJson(res, 409, { error: 'Nome de usuário ou e-mail já cadastrado.' });
      }

      const { hash, salt } = hashPassword(password);
      const newUser = createUser(username, email, hash, salt);
      const token = createToken({ userId: newUser.id, username: newUser.username, email: newUser.email });

      return sendJson(res, 201, {
        message: 'Usuário registrado com sucesso!',
        token,
        user: { id: newUser.id, username: newUser.username, email: newUser.email, balance: 0.00 }
      });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { identifier, password } = body;

      if (!identifier || !password) {
        return sendJson(res, 400, { error: 'Informe usuário/e-mail e senha.' });
      }

      const user = getUserByEmailOrUsername(identifier);
      if (!user) {
        return sendJson(res, 401, { error: 'Usuário ou senha inválidos.' });
      }

      const isValid = verifyPassword(password, user.password_hash, user.salt);
      if (!isValid) {
        return sendJson(res, 401, { error: 'Usuário ou senha inválidos.' });
      }

      const token = createToken({ userId: user.id, username: user.username, email: user.email });
      const balance = getWallet(user.id);

      return sendJson(res, 200, {
        message: 'Login realizado com sucesso!',
        token,
        user: { id: user.id, username: user.username, email: user.email, balance }
      });
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const auth = authenticateRequest(req);
      if (!auth) {
        return sendJson(res, 401, { error: 'Não autorizado. Token ausente ou expirado.' });
      }

      const user = getUserById(auth.userId);
      if (!user) {
        return sendJson(res, 404, { error: 'Usuário não encontrado.' });
      }

      const balance = getWallet(user.id);
      return sendJson(res, 200, {
        user: { id: user.id, username: user.username, email: user.email, balance }
      });
    }

    // ========================================================================
    // ROTAS DE CARTEIRA & PIX SANDBOX
    // ========================================================================

    if (pathname === '/api/wallet/deposit/create' && req.method === 'POST') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'Não autorizado.' });

      const body = await parseJsonBody(req);
      const amount = parseFloat(body.amount);

      if (isNaN(amount) || amount < 1.00) {
        return sendJson(res, 400, { error: 'Valor mínimo de depósito é R$ 1,00.' });
      }

      const refCode = `PIX_DEP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const txId = createDepositTransaction(auth.userId, amount, refCode);

      const mockPixCode = `00020126580014br.gov.bcb.pix0136${refCode}520400005303986540${amount.toFixed(2)}5802BR5918QUARTETO BET6009SAO PAULO62070503***6304ABCD`;

      return sendJson(res, 200, {
        message: 'Cobrança PIX gerada com sucesso!',
        transactionId: txId,
        amount,
        referenceCode: refCode,
        pixCode: mockPixCode,
        expiresInSeconds: 900
      });
    }

    if (pathname === '/api/wallet/deposit/simulate-pay' && req.method === 'POST') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'Não autorizado.' });

      const body = await parseJsonBody(req);
      const txId = parseInt(body.transactionId, 10);

      if (!txId) return sendJson(res, 400, { error: 'ID da transação não fornecido.' });

      const result = completeDeposit(txId);
      if (!result) return sendJson(res, 400, { error: 'Transação não encontrada ou já aprovada.' });

      return sendJson(res, 200, {
        message: `Depósito de R$ ${result.credited.toFixed(2)} aprovado com sucesso!`,
        credited: result.credited,
        newBalance: result.newBalance
      });
    }

    if (pathname === '/api/wallet/withdraw' && req.method === 'POST') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'Não autorizado.' });

      const body = await parseJsonBody(req);
      const amount = parseFloat(body.amount);
      const { pixKey, pixType } = body;

      if (isNaN(amount) || amount < 5.00) {
        return sendJson(res, 400, { error: 'Valor mínimo para saque é R$ 5,00.' });
      }
      if (!pixKey || !pixType) {
        return sendJson(res, 400, { error: 'Informe a chave PIX e o tipo da chave.' });
      }

      try {
        const result = createWithdrawal(auth.userId, amount, pixKey, pixType);
        return sendJson(res, 200, {
          message: `Saque de R$ ${amount.toFixed(2)} solicitado com sucesso!`,
          ...result
        });
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (pathname === '/api/wallet/transactions' && req.method === 'GET') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'Não autorizado.' });

      const transactions = getUserTransactions(auth.userId);
      return sendJson(res, 200, { transactions });
    }

    // ========================================================================
    // ROTAS DO QUARTETO BET (APOSTAS EM JOGO DE PALAVRAS)
    // ========================================================================

    // POST /api/quarteto/start
    if (pathname === '/api/quarteto/start' && req.method === 'POST') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'É necessário estar autenticado para apostar.' });

      const body = await parseJsonBody(req);
      const betAmount = parseFloat(body.betAmount);
      const mode = body.mode || GAME_MODES.POT_DECAY;

      if (isNaN(betAmount) || betAmount <= 0) {
        return sendJson(res, 400, { error: 'Valor de aposta inválido.' });
      }

      const currentBalance = getWallet(auth.userId);
      if (currentBalance < betAmount) {
        return sendJson(res, 400, {
          error: 'Saldo insuficiente na carteira para iniciar o Quarteto.',
          currentBalance,
          required: betAmount
        });
      }

      // Inicia a partida no motor e deduz aposta da carteira
      const round = createQuartetoRound(mode, betAmount);
      // Registra aposta deduzindo do SQLite
      const newBalance = recordGameRound(auth.userId, betAmount, 0, round.secrets, []);

      // Guarda sessão ativa
      activeQuartetoSessions.set(round.id, {
        round,
        userId: auth.userId
      });

      return sendJson(res, 200, {
        round: sanitizeRoundForClient(round),
        previousBalance: currentBalance,
        newBalance
      });
    }

    // POST /api/quarteto/guess
    if (pathname === '/api/quarteto/guess' && req.method === 'POST') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'Não autorizado.' });

      const body = await parseJsonBody(req);
      const { roundId, guess } = body;

      const session = activeQuartetoSessions.get(roundId);
      if (!session || session.userId !== auth.userId) {
        return sendJson(res, 404, { error: 'Partida não encontrada ou já expirada.' });
      }

      const result = processQuartetoGuess(session.round, guess);
      if (!result.ok) {
        return sendJson(res, 400, { error: result.error });
      }

      let currentBalance = getWallet(auth.userId);

      // Se a partida acabou, credita prêmio na carteira se houver vitória
      if (session.round.isFinished) {
        if (session.round.payout > 0) {
          currentBalance = recordGameRound(
            auth.userId,
            0,
            session.round.payout,
            session.round.secrets,
            [{ message: session.round.message, payout: session.round.payout }]
          );
        }
        activeQuartetoSessions.delete(roundId);
      }

      return sendJson(res, 200, {
        round: sanitizeRoundForClient(session.round),
        anyNewWordSolvedThisTurn: result.anyNewWordSolvedThisTurn,
        allSolved: result.allSolved,
        currentBalance
      });
    }

    // ========================================================================
    // ROTAS DO LÉXORA (TORNEIOS MULTI-JOGOS, CONTEXTO & LOJA DE POWER-UPS)
    // ========================================================================

    // GET /api/tournaments/list
    if (pathname === '/api/tournaments/list' && req.method === 'GET') {
      const tournaments = listTournaments();
      return sendJson(res, 200, { tournaments });
    }

    // POST /api/tournaments/join
    if (pathname === '/api/tournaments/join' && req.method === 'POST') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'É necessário estar logado para entrar no torneio.' });

      const body = await parseJsonBody(req);
      const { tournamentId } = body;
      if (!tournamentId) return sendJson(res, 400, { error: 'ID do torneio não fornecido.' });

      const user = getUserById(auth.userId);
      try {
        const result = joinTournament(tournamentId, auth.userId, user ? user.username : 'Jogador');
        return sendJson(res, 200, {
          ok: true,
          message: 'Inscrição confirmada com sucesso!',
          ...result
        });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // POST /api/tournaments/submit-result
    if (pathname === '/api/tournaments/submit-result' && req.method === 'POST') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'Não autorizado.' });

      const body = await parseJsonBody(req);
      const { tournamentId, score, attempts, timeSeconds } = body;

      const tournaments = listTournaments();
      const tour = tournaments.find(t => t.id === tournamentId);
      if (!tour) return sendJson(res, 404, { error: 'Torneio não encontrado.' });

      const payoutData = calculateTournamentPayouts(tour.prize_pot, tour.max_players, tour.rake_percent);

      // Simulação de colocação baseada na pontuação do jogador
      // Se score >= 8000 (vitória excelente), 1º lugar.
      let rank = 1;
      if (score < 4000) rank = Math.min(tour.max_players, 4);
      else if (score < 7000) rank = 2;
      else if (score < 8500) rank = 2;

      const prizeEntry = payoutData.distribution.find(d => d.rank === rank);
      const payout = prizeEntry ? prizeEntry.payout : 0.00;

      let currentBalance = getWallet(auth.userId);
      if (payout > 0) {
        currentBalance = recordGameRound(auth.userId, 0, payout, [], [{ tournament: tour.title, rank, payout }]);
      }

      return sendJson(res, 200, {
        ok: true,
        rank,
        payout,
        currentBalance,
        platformRake: payoutData.platformProfit,
        message: payout > 0
          ? `🏆 Parabéns! Você conquistou o ${rank}º lugar e faturou R$ ${payout.toFixed(2)}!`
          : `Fim do torneio! Sua pontuação final foi ${score} pts.`
      });
    }

    // POST /api/contexto/guess
    if (pathname === '/api/contexto/guess' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { guess, secret, clusterKey } = body;

      const cleanGuess = guess || '';
      const cleanSecret = secret || 'GATO';
      const cleanCluster = clusterKey || 'ANIMAIS';

      const evalResult = calculateContextoDistance(cleanGuess, cleanSecret, cleanCluster);
      return sendJson(res, 200, evalResult);
    }

    // POST /api/store/buy-powerup
    if (pathname === '/api/store/buy-powerup' && req.method === 'POST') {
      const auth = authenticateRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'É necessário estar logado para comprar na loja.' });

      const body = await parseJsonBody(req);
      const { powerupType, price } = body;

      try {
        const result = buyPowerup(auth.userId, powerupType, parseFloat(price));
        return sendJson(res, 200, {
          ok: true,
          message: 'Dica adquirida com sucesso!',
          ...result
        });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // ========================================================================
    // ARQUIVOS ESTÁTICOS
    // ========================================================================

    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '') {
      safePath = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileStream = fs.createReadStream(filePath);

      res.writeHead(200, { 'Content-Type': contentType });
      fileStream.pipe(res);
      return;
    }

    return sendJson(res, 404, { error: 'Rota ou recurso não encontrado.' });

  } catch (err) {
    console.error('Erro no processamento da requisição:', err);
    return sendJson(res, 500, { error: 'Erro interno no servidor.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🧠 Quarteto Bet Backend rodando em http://localhost:${PORT}`);
});

export { server };
