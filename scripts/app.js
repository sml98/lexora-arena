/**
 * LÉXORA ARENA - Main Application Controller
 * Controle de telas (Lobby e Arena), 4 jogos, loja de powerups e carteira.
 */

import {
  createQuartetoRound,
  processQuartetoGuess,
  calculateTournamentScore,
  GAME_MODES
} from './quarteto-engine.js';

import {
  createContextoRound,
  processContextoGuess
} from './contexto-engine.js';

import {
  createTermoBlitzRound,
  processTermoBlitzGuess,
  TERMO_ROUND_TIME_SECONDS
} from './termo-engine.js';

import {
  createAnagramaRound,
  submitAnagramaWord,
  ANAGRAM_TIME_SECONDS
} from './anagrama-engine.js';

import { UIManager } from './ui.js';
import { ParticleEngine } from './particles.js';
import { soundManager } from './audio.js';

const STORAGE_KEY = 'lexora_player_state_v2';

export class LexoraApp {
  constructor() {
    this.particles = new ParticleEngine('particlesCanvas');
    this.ui = new UIManager(this.particles);

    this.state = {
      currentUser: null,
      token: localStorage.getItem('lexora_jwt_token') || null,
      balance: 1000.00,
      activeScreen: 'lobby', // 'lobby' | 'arena'
      activeGame: 'quarteto', // 'quarteto' | 'contexto' | 'termo_blitz' | 'anagrama'

      // Estado dos jogos
      quartetoRound: null,
      contextoRound: null,
      termoBlitzRound: null,
      anagramaRound: null,

      currentTypingGuess: '',
      isSubmitting: false,
      tournamentsList: [],

      // Timers
      blitzTimerId: null,
      anagramaTimerId: null,
      dailyCountdownTimerId: null
    };
  }

  async init() {
    this.particles.init();
    this.ui.init();
    this.loadState();
    this.bindEvents();

    if (this.state.token) {
      await this.verifyCurrentAuth();
    }

    await this.fetchTournaments();
    this.startDailyCountdown();

    this.updateUI();
  }

  loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!this.state.token && parsed.balance !== undefined) {
          this.state.balance = parsed.balance;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar estado:', e);
    }
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        balance: this.state.balance
      }));
    } catch (e) {
      console.warn('Erro ao salvar estado:', e);
    }
  }

  async apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.state.token) {
      headers['Authorization'] = `Bearer ${this.state.token}`;
    }

    try {
      const res = await fetch(endpoint, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: { error: 'Sem conexão com o servidor.' } };
    }
  }

  async verifyCurrentAuth() {
    try {
      const { ok, data } = await this.apiRequest('/api/auth/me');
      if (ok && data.user) {
        this.state.currentUser = data.user;
        this.state.balance = data.user.balance;
      } else {
        this.logout(false);
      }
    } catch (err) {
      console.warn('Servidor offline:', err);
    }
  }

  /* ==========================================================================
     TRANSIÇÃO DE TELAS (LOBBY <-> ARENA)
     ========================================================================== */
  enterArena(gameType, title = null, subtitle = null, pot = null) {
    soundManager.playButtonClick();
    this.state.activeScreen = 'arena';
    this.state.activeGame = gameType;

    const screenLobby = document.getElementById('screenLobby');
    const screenArena = document.getElementById('screenArena');
    if (screenLobby) screenLobby.style.display = 'none';
    if (screenArena) screenArena.style.display = 'flex';

    // HUD da Partida
    const titleElem = document.getElementById('hudGameTitle');
    const subElem = document.getElementById('hudGameSubtitle');
    if (titleElem) titleElem.textContent = title || this.getGameDefaultTitle(gameType);
    if (subElem) subElem.textContent = subtitle || `Pote: R$ ${pot ? pot.toFixed(2) : '40,00'}`;

    // Alternar Palcos
    const palcos = {
      quarteto: 'palcoQuarteto',
      contexto: 'palcoContexto',
      termo_blitz: 'palcoTermoBlitz',
      anagrama: 'palcoAnagrama'
    };

    Object.entries(palcos).forEach(([type, id]) => {
      const elem = document.getElementById(id);
      if (elem) elem.style.display = type === gameType ? 'flex' : 'none';
    });

    // Teclado virtual
    const kb = document.getElementById('virtualKeyboardSection');
    if (kb) {
      kb.style.display = (gameType === 'quarteto' || gameType === 'termo_blitz') ? 'flex' : 'none';
    }

    this.startActiveGameRound();
    this.adjustResponsiveLayout();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  leaveArena() {
    soundManager.playButtonClick();
    if (this.state.blitzTimerId) clearInterval(this.state.blitzTimerId);
    if (this.state.anagramaTimerId) clearInterval(this.state.anagramaTimerId);

    this.state.activeScreen = 'lobby';
    const screenLobby = document.getElementById('screenLobby');
    const screenArena = document.getElementById('screenArena');
    if (screenLobby) screenLobby.style.display = 'flex';
    if (screenArena) screenArena.style.display = 'none';

    this.updateUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  getGameDefaultTitle(gameType) {
    const titles = {
      quarteto: 'Quarteto Masters',
      contexto: 'Contexto Arena',
      termo_blitz: 'Termo Blitz 1x1',
      anagrama: 'Anagrama Rush'
    };
    return titles[gameType] || 'Arena de Jogo';
  }

  /* ==========================================================================
     LOBBY & SALAS
     ========================================================================== */
  async fetchTournaments() {
    const { ok, data } = await this.apiRequest('/api/tournaments/list');
    if (ok && data.tournaments) {
      this.state.tournamentsList = data.tournaments;
      this.ui.renderRoomsLobby(data.tournaments, (id, fee, gameType, title) => {
        this.joinTournamentRoom(id, fee, gameType, title);
      });
    }
  }

  async joinTournamentRoom(tournamentId, entryFee, gameType, title) {
    if (this.state.balance < entryFee) {
      this.showToast(`Saldo insuficiente. Taxa de entrada: R$ ${entryFee.toFixed(2)}`, 'error');
      this.openModal('depositModal');
      return;
    }

    if (this.state.token) {
      const { ok, data } = await this.apiRequest('/api/tournaments/join', 'POST', { tournamentId });
      if (!ok) {
        this.showToast(data.error || 'Erro ao entrar na sala.', 'error');
        return;
      }
      this.state.balance = data.newBalance;
    } else {
      this.state.balance -= entryFee;
      this.saveState();
    }

    this.showToast(`Inscrição confirmada em ${title}!`, 'success');
    this.enterArena(gameType, title, `Taxa: R$ ${entryFee.toFixed(2)}`);
  }

  startDailyCountdown() {
    const updateCountdown = () => {
      const now = new Date();
      const target = new Date();
      target.setHours(21, 0, 0, 0);
      if (now > target) target.setDate(target.getDate() + 1);

      const diff = Math.max(0, Math.floor((target - now) / 1000));
      const hours = String(Math.floor(diff / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const seconds = String(diff % 60).padStart(2, '0');

      const cdElem = document.getElementById('dailyCountdown');
      if (cdElem) cdElem.textContent = `${hours}:${minutes}:${seconds}`;
    };

    updateCountdown();
    this.state.dailyCountdownTimerId = setInterval(updateCountdown, 1000);
  }

  /* ==========================================================================
     EXECUÇÃO DOS 4 JOGOS
     ========================================================================== */
  async startActiveGameRound() {
    this.state.currentTypingGuess = '';

    if (this.state.activeGame === 'quarteto') {
      this.state.quartetoRound = createQuartetoRound(GAME_MODES.POT_DECAY, 20.00);
      this.ui.resetQuartetoGrids();
      this.ui.resetKeyboard();
      this.ui.highlightActiveRow(0, [false, false, false, false]);
      this.updateHudStat('CHUTES', '0 / 9');
    } else if (this.state.activeGame === 'contexto') {
      this.state.contextoRound = createContextoRound();
      this.ui.renderContextoGuesses([], 99999);
      this.updateHudStat('CHUTES', '0 tent.');
    } else if (this.state.activeGame === 'termo_blitz') {
      this.state.termoBlitzRound = createTermoBlitzRound();
      this.ui.initTermoBlitzGrid();
      this.ui.resetKeyboard();
      this.startBlitzTimer();
      this.updateHudStat('CHUTES', '0 / 6');
    } else if (this.state.activeGame === 'anagrama') {
      this.state.anagramaRound = createAnagramaRound();
      this.ui.renderAnagramaWheel(this.state.anagramaRound.letters, (l) => this.handleAnagramLetterClick(l));
      this.ui.renderAnagramaFoundWords([]);
      this.startAnagramaTimer();
      this.updateHudStat('PONTOS', '0 pts');
    }
  }

  updateHudStat(label, val) {
    const lbl = document.getElementById('hudStatLabel');
    const v = document.getElementById('hudStatVal');
    if (lbl) lbl.textContent = label;
    if (v) v.textContent = val;
  }

  /* TERMO BLITZ (60s) */
  startBlitzTimer() {
    if (this.state.blitzTimerId) clearInterval(this.state.blitzTimerId);
    let timeLeft = TERMO_ROUND_TIME_SECONDS;
    const timerElem = document.getElementById('blitzTimerDisplay');

    this.state.blitzTimerId = setInterval(() => {
      timeLeft--;
      if (timerElem) timerElem.textContent = `${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(this.state.blitzTimerId);
        this.finishTermoBlitz();
      }
    }, 1000);
  }

  finishTermoBlitz() {
    if (this.state.blitzTimerId) clearInterval(this.state.blitzTimerId);
    const round = this.state.termoBlitzRound;
    if (!round) return;

    round.isFinished = true;
    this.ui.showTournamentResultModal({
      rank: round.isWin ? 1 : 2,
      score: round.score,
      payout: round.isWin ? 17.00 : 0,
      secrets: [round.secret],
      message: round.message
    });
  }

  /* ANAGRAMA RUSH (90s) */
  startAnagramaTimer() {
    if (this.state.anagramaTimerId) clearInterval(this.state.anagramaTimerId);
    let timeLeft = ANAGRAM_TIME_SECONDS;
    const timerElem = document.getElementById('anagramaTimerDisplay');

    this.state.anagramaTimerId = setInterval(() => {
      timeLeft--;
      if (timerElem) timerElem.textContent = `${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(this.state.anagramaTimerId);
        this.finishAnagrama();
      }
    }, 1000);
  }

  handleAnagramLetterClick(letter) {
    if (this.state.currentTypingGuess.length < 6) {
      this.state.currentTypingGuess += letter;
      const display = document.getElementById('anagramaCurrentWord');
      if (display) display.textContent = this.state.currentTypingGuess;
    }
  }

  submitAnagramWord() {
    const word = this.state.currentTypingGuess;
    if (!word) return;

    const res = submitAnagramaWord(this.state.anagramaRound, word);
    if (!res.ok) {
      this.showToast(res.error, 'error');
      soundManager.playInvalidBuzz();
    } else {
      soundManager.playAnagramWordFound();
      this.particles.explode('small');
      this.ui.renderAnagramaFoundWords(this.state.anagramaRound.foundWords);
      document.getElementById('anagramaScoreDisplay').textContent = `${this.state.anagramaRound.score} pts`;
      this.updateHudStat('PONTOS', `${this.state.anagramaRound.score} pts`);
      this.showToast(res.message, 'success');
    }

    this.state.currentTypingGuess = '';
    const display = document.getElementById('anagramaCurrentWord');
    if (display) display.innerHTML = '<span class="placeholder">Toque nas letras abaixo...</span>';
  }

  finishAnagrama() {
    if (this.state.anagramaTimerId) clearInterval(this.state.anagramaTimerId);
    const round = this.state.anagramaRound;
    if (!round) return;

    round.isFinished = true;
    this.ui.showTournamentResultModal({
      rank: round.score >= 100 ? 1 : 2,
      score: round.score,
      payout: round.score >= 100 ? 24.00 : 8.00,
      secrets: [round.seedRoot],
      message: `Fim do tempo! Você somou ${round.score} pontos e descobriu ${round.foundWords.length} palavras!`
    });
  }

  /* CONTEXTO ARENA */
  async handleContextoSubmit() {
    const input = document.getElementById('contextoInput');
    if (!input) return;

    const word = input.value.trim().toUpperCase();
    if (!word) return;

    const res = processContextoGuess(this.state.contextoRound, word);
    if (!res.ok) {
      this.showToast(res.error, 'error');
      soundManager.playInvalidBuzz();
      return;
    }

    input.value = '';
    input.focus();

    if (res.evalResult.temperature === 'hot') soundManager.playContextoHot();
    else if (res.evalResult.temperature === 'warm') soundManager.playContextoWarm();
    else soundManager.playContextoCold();

    this.ui.renderContextoGuesses(this.state.contextoRound.guesses, this.state.contextoRound.bestRank);
    this.updateHudStat('CHUTES', `${this.state.contextoRound.attemptsCount} tent.`);

    if (res.isWin) {
      this.particles.explode('jackpot');
      this.ui.showTournamentResultModal({
        rank: 1,
        score: this.state.contextoRound.score,
        payout: 17.00,
        secrets: [this.state.contextoRound.secret],
        message: this.state.contextoRound.message
      });
    }
  }

  /* TECLADO & ENTRADA DE CHUTES (Quarteto e Termo) */
  handleKeyPress(key) {
    if (this.state.isSubmitting || this.state.activeScreen !== 'arena') return;

    const upper = key.toUpperCase();

    if (upper === 'ENTER') {
      this.submitCurrentWordGuess();
    } else if (upper === 'BACKSPACE') {
      if (this.state.currentTypingGuess.length > 0) {
        this.state.currentTypingGuess = this.state.currentTypingGuess.slice(0, -1);
        soundManager.playKeyClick();
        this.updateTypingRowDisplay();
      }
    } else if (/^[A-Z]$/.test(upper)) {
      if (this.state.currentTypingGuess.length < 5) {
        this.state.currentTypingGuess += upper;
        soundManager.playKeyClick();
        this.updateTypingRowDisplay();
      }
    }
  }

  updateTypingRowDisplay() {
    if (this.state.activeGame === 'quarteto') {
      const round = this.state.quartetoRound;
      if (!round) return;
      const solved = round.quadrants.map(q => Boolean(q.solved));
      this.ui.updateCurrentTypingRow(round.attemptsCount, this.state.currentTypingGuess, solved);
    } else if (this.state.activeGame === 'termo_blitz') {
      const round = this.state.termoBlitzRound;
      if (!round) return;
      this.ui.updateTermoBlitzTyping(round.attemptsCount, this.state.currentTypingGuess);
    }
  }

  async submitCurrentWordGuess() {
    const guess = this.state.currentTypingGuess;
    if (guess.length !== 5) {
      this.showToast('Digite uma palavra completa de 5 letras.', 'error');
      soundManager.playInvalidBuzz();
      return;
    }

    this.state.isSubmitting = true;

    if (this.state.activeGame === 'quarteto') {
      const round = this.state.quartetoRound;
      const res = processQuartetoGuess(round, guess);
      if (!res.ok) {
        this.showToast(res.error, 'error');
        soundManager.playInvalidBuzz();
        this.state.isSubmitting = false;
        return;
      }

      await this.ui.revealGuessRow(round.attemptsCount - 1, round.quadrants);
      this.state.currentTypingGuess = '';
      this.updateHudStat('CHUTES', `${round.attemptsCount} / 9`);

      if (round.isFinished) {
        const score = calculateTournamentScore(round);
        this.ui.showTournamentResultModal({
          rank: round.isWin ? 1 : 2,
          score,
          payout: round.isWin ? 24.00 : 8.00,
          secrets: round.secrets,
          message: round.message
        });
      } else {
        const solved = round.quadrants.map(q => Boolean(q.solved));
        this.ui.highlightActiveRow(round.attemptsCount, solved);
      }
    } else if (this.state.activeGame === 'termo_blitz') {
      const round = this.state.termoBlitzRound;
      const res = processTermoBlitzGuess(round, guess);
      if (!res.ok) {
        this.showToast(res.error, 'error');
        soundManager.playInvalidBuzz();
        this.state.isSubmitting = false;
        return;
      }

      await this.ui.revealTermoBlitzGuess(round.attemptsCount - 1, res.tiles);
      this.state.currentTypingGuess = '';
      this.updateHudStat('CHUTES', `${round.attemptsCount} / 6`);

      if (round.isFinished) {
        this.finishTermoBlitz();
      }
    }

    this.state.isSubmitting = false;
  }

  /* LOJA DE POWER-UPS */
  async buyPowerupItem(powerupType, price) {
    if (this.state.balance < price) {
      this.showToast('Saldo insuficiente.', 'error');
      this.openModal('depositModal');
      return;
    }

    if (this.state.token) {
      const { ok, data } = await this.apiRequest('/api/store/buy-powerup', 'POST', { powerupType, price });
      if (!ok) {
        this.showToast(data.error || 'Erro na compra.', 'error');
        return;
      }
      this.state.balance = data.newBalance;
    } else {
      this.state.balance -= price;
      this.saveState();
    }

    this.showToast('Dica adquirida com sucesso!', 'success');
    this.closeModal('storeModal');
    this.updateUI();
  }

  /* ==========================================================================
     EVENTOS
     ========================================================================== */
  bindEvents() {
    const unlockAudio = () => {
      soundManager.ensureContext();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    window.addEventListener('resize', () => this.adjustResponsiveLayout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.adjustResponsiveLayout(), 120));

    // Logo & Header
    const logo = document.getElementById('headerLogo');
    if (logo) logo.addEventListener('click', () => this.leaveArena());

    const leaveBtn = document.getElementById('leaveArenaBtn');
    if (leaveBtn) leaveBtn.addEventListener('click', () => this.leaveArena());

    const quickDep = document.getElementById('quickDepositBtn');
    if (quickDep) quickDep.addEventListener('click', () => this.openModal('depositModal'));

    // Cards de Jogos no Lobby
    document.querySelectorAll('.game-card, .game-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gameType = btn.dataset.game || btn.closest('.game-card').dataset.game;
        this.enterArena(gameType);
      });
    });

    // Daily Major
    const dailyBtn = document.getElementById('dailyMajorJoinBtn');
    if (dailyBtn) {
      dailyBtn.addEventListener('click', () => {
        this.joinTournamentRoom('tour_daily_major', 20.00, 'quarteto', '👑 LÉXORA GRAND MAJOR');
      });
    }

    // Abas de visualização do Quarteto
    document.querySelectorAll('.view-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playButtonClick();
        this.setQuartetoMobileView(btn.dataset.view);
      });
    });

    // Teclado Virtual
    document.querySelectorAll('.key-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.handleKeyPress(btn.dataset.key);
      });
    });

    // Teclado Físico
    window.addEventListener('keydown', (e) => {
      if (document.querySelector('.modal-overlay.active') || document.activeElement.tagName === 'INPUT') return;
      if (e.key === 'Enter') this.handleKeyPress('ENTER');
      else if (e.key === 'Backspace') this.handleKeyPress('BACKSPACE');
      else if (/^[a-zA-Z]$/.test(e.key)) this.handleKeyPress(e.key.toUpperCase());
    });

    // Contexto
    const ctxBtn = document.getElementById('contextoSubmitBtn');
    const ctxInput = document.getElementById('contextoInput');
    if (ctxBtn) ctxBtn.addEventListener('click', () => this.handleContextoSubmit());
    if (ctxInput) {
      ctxInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleContextoSubmit();
      });
    }

    // Anagrama
    const anaShuffle = document.getElementById('anagramaShuffleBtn');
    const anaClear = document.getElementById('anagramaClearBtn');
    const anaSubmit = document.getElementById('anagramaSubmitBtn');
    if (anaShuffle) {
      anaShuffle.addEventListener('click', () => {
        if (this.state.anagramaRound) {
          this.state.anagramaRound.letters.sort(() => Math.random() - 0.5);
          this.ui.renderAnagramaWheel(this.state.anagramaRound.letters, (l) => this.handleAnagramLetterClick(l));
        }
      });
    }
    if (anaClear) {
      anaClear.addEventListener('click', () => {
        this.state.currentTypingGuess = '';
        const d = document.getElementById('anagramaCurrentWord');
        if (d) d.innerHTML = '<span class="placeholder">Toque nas letras abaixo...</span>';
      });
    }
    if (anaSubmit) anaSubmit.addEventListener('click', () => this.submitAnagramWord());

    // Audio & Modais
    const bgmBtn = document.getElementById('bgmBtn');
    if (bgmBtn) {
      bgmBtn.addEventListener('click', () => {
        const isPlaying = soundManager.toggleBgm();
        bgmBtn.innerHTML = isPlaying ? '🎵 BGM: On' : '🎵 BGM: Off';
        bgmBtn.classList.toggle('active', isPlaying);
      });
    }
    const sfxBtn = document.getElementById('soundBtn');
    if (sfxBtn) {
      sfxBtn.addEventListener('click', () => {
        const isMuted = soundManager.toggleMute();
        sfxBtn.innerHTML = isMuted ? '🔇 SFX Off' : '🔊 SFX On';
      });
    }

    this.bindModalEvents();
  }

  bindModalEvents() {
    const bindOpenClose = (btnId, modalId, closeBtnId) => {
      const btn = document.getElementById(btnId);
      const close = document.getElementById(closeBtnId);
      if (btn) btn.addEventListener('click', () => this.openModal(modalId));
      if (close) close.addEventListener('click', () => this.closeModal(modalId));
    };

    bindOpenClose('rulesBtn', 'rulesModal', 'closeRulesModalBtn');
    bindOpenClose('openStoreBtn', 'storeModal', 'closeStoreModalBtn');
    bindOpenClose('openWithdrawBtn', 'withdrawModal', 'closeWithdrawModalBtn');
    bindOpenClose('closeResultModalBtn', 'resultModal', 'closeResultModalBtn');

    document.querySelectorAll('.buy-powerup-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.buyPowerupItem(btn.dataset.powerup, parseFloat(btn.dataset.price));
      });
    });

    const playAgainBtn = document.getElementById('playAgainBtn');
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', () => {
        this.closeModal('resultModal');
        this.startActiveGameRound();
      });
    }

    const backToLobbyBtn = document.getElementById('backToLobbyBtn');
    if (backToLobbyBtn) {
      backToLobbyBtn.addEventListener('click', () => {
        this.closeModal('resultModal');
        this.leaveArena();
      });
    }

    // Auth
    const openLogin = document.getElementById('openLoginBtn');
    const openReg = document.getElementById('openRegisterBtn');
    const closeAuth = document.getElementById('closeAuthModalBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (openLogin) openLogin.addEventListener('click', () => this.openAuthModal(false));
    if (openReg) openReg.addEventListener('click', () => this.openAuthModal(true));
    if (closeAuth) closeAuth.addEventListener('click', () => this.closeModal('authModal'));
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout(true));

    const authForm = document.getElementById('authForm');
    if (authForm) {
      authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAuthSubmit();
      });
    }

    // Depósito PIX - Seleção de valores pré-definidos
    document.querySelectorAll('.preset-dep-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playButtonClick();
        document.querySelectorAll('.preset-dep-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const customInput = document.getElementById('customDepositVal');
        if (customInput) {
          customInput.value = btn.dataset.val;
        }
      });
    });

    const customDepositInput = document.getElementById('customDepositVal');
    if (customDepositInput) {
      customDepositInput.addEventListener('input', (e) => {
        const val = e.target.value;
        document.querySelectorAll('.preset-dep-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.val === val);
        });
      });
    }

    const copyPixBtn = document.getElementById('copyPixBtn');
    if (copyPixBtn) {
      copyPixBtn.addEventListener('click', () => {
        const pixInput = document.getElementById('pixCodeInput');
        if (pixInput) {
          pixInput.select();
          navigator.clipboard?.writeText(pixInput.value);
          this.showToast('Código PIX Copia-e-Cola copiado para a área de transferência!', 'success');
          copyPixBtn.textContent = 'Copiado! ✓';
          setTimeout(() => { copyPixBtn.textContent = 'Copiar'; }, 2000);
        }
      });
    }

    const genPix = document.getElementById('generatePixBtn');
    if (genPix) {
      genPix.addEventListener('click', () => {
        const val = parseFloat(document.getElementById('customDepositVal').value) || 20;
        if (val < 5) {
          this.showToast('O valor mínimo de depósito é R$ 5,00.', 'error');
          return;
        }
        const pixInput = document.getElementById('pixCodeInput');
        if (pixInput) {
          pixInput.value = `00020126580014br.gov.bcb.pix0136lexora-pix-${Date.now()}520400005303986540${val.toFixed(2)}5802BR5916LEXORA ARENA LTDA6009SAO PAULO62070503***6304`;
        }
        document.getElementById('depositStep1').style.display = 'none';
        document.getElementById('depositStep2').style.display = 'block';
      });
    }

    const simPix = document.getElementById('simulatePixPaymentBtn');
    if (simPix) {
      simPix.addEventListener('click', () => {
        const val = parseFloat(document.getElementById('customDepositVal').value) || 20;
        this.state.balance += val;
        this.saveState();
        this.showToast(`⚡ Depósito PIX de R$ ${val.toFixed(2)} aprovado instantaneamente!`, 'success');
        this.closeModal('depositModal');
        document.getElementById('depositStep1').style.display = 'block';
        document.getElementById('depositStep2').style.display = 'none';
        this.updateUI();
      });
    }

    // Saque PIX
    const confirmWith = document.getElementById('confirmWithdrawBtn');
    if (confirmWith) {
      confirmWith.addEventListener('click', () => {
        const val = parseFloat(document.getElementById('withdrawAmount').value) || 0;
        if (val <= 0 || val > this.state.balance) {
          this.showToast('Saldo insuficiente.', 'error');
          return;
        }
        this.state.balance -= val;
        this.saveState();
        this.showToast(`💸 Saque PIX de R$ ${val.toFixed(2)} processado!`, 'success');
        this.closeModal('withdrawModal');
        this.updateUI();
      });
    }
  }

  setQuartetoMobileView(view) {
    const stage = document.getElementById('quartetoStage');
    if (!stage) return;

    document.querySelectorAll('.view-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    stage.className = view === 'all'
      ? 'quarteto-stage view-all'
      : `quarteto-stage view-focus-${view}`;

    this.adjustResponsiveLayout();
  }

  adjustResponsiveLayout() {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const isMobile = vw <= 768;

    let optimalTile;
    if (isMobile) {
      optimalTile = Math.max(24, Math.min(Math.floor((vw - 32) / 11), 32));
    } else {
      optimalTile = Math.max(32, Math.min(Math.floor((vw - 60) / 12), 44));
    }

    document.documentElement.style.setProperty('--tile-size', `${optimalTile}px`);
    document.documentElement.style.setProperty('--tile-font', `${Math.round(optimalTile * 0.52)}px`);

    const keyH = Math.max(38, Math.min(Math.round(vh * 0.065), 48));
    document.documentElement.style.setProperty('--key-h', `${keyH}px`);
  }

  updateUI() {
    const balText = `R$ ${this.state.balance.toFixed(2)}`;
    const balH = document.getElementById('headerBalanceDisplay');
    if (balH) balH.textContent = balText;

    const loggedInDiv = document.getElementById('authLoggedIn');
    const loggedOutDiv = document.getElementById('authLoggedOut');
    if (loggedInDiv && loggedOutDiv) {
      loggedInDiv.style.display = this.state.currentUser ? 'flex' : 'none';
      loggedOutDiv.style.display = this.state.currentUser ? 'none' : 'flex';
    }

    if (this.state.currentUser) {
      const uName = document.getElementById('loggedUsername');
      if (uName) uName.textContent = this.state.currentUser.username;
    }
  }

  openAuthModal(isRegister = false) {
    this.openModal('authModal');
    const userGrp = document.getElementById('usernameGroup');
    const title = document.getElementById('authModalTitle');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (userGrp) userGrp.style.display = isRegister ? 'block' : 'none';
    if (title) title.textContent = isRegister ? 'Cadastrar no LÉXORA' : 'Entrar no LÉXORA';
    if (submitBtn) submitBtn.textContent = isRegister ? 'Criar Conta' : 'Entrar';
  }

  async handleAuthSubmit() {
    const userGrp = document.getElementById('usernameGroup');
    const isRegister = userGrp && userGrp.style.display !== 'none';
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value.trim();

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const body = isRegister ? { username, email, password } : { identifier: email, password };

    const { ok, data } = await this.apiRequest(endpoint, 'POST', body);
    if (!ok) {
      this.showToast(data.error || 'Erro na autenticação.', 'error');
      return;
    }

    this.state.token = data.token;
    this.state.currentUser = data.user;
    this.state.balance = data.user.balance;
    localStorage.setItem('lexora_jwt_token', data.token);

    this.showToast(`Bem-vindo, ${data.user.username}!`, 'success');
    this.closeModal('authModal');
    this.updateUI();
  }

  logout(showToast = true) {
    this.state.token = null;
    this.state.currentUser = null;
    localStorage.removeItem('lexora_jwt_token');
    if (showToast) this.showToast('Sessão encerrada.', 'success');
    this.updateUI();
  }

  showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '⚡'}</span> ${msg}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
  }

  closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
  }
}

// Inicialização automática segura do App
function bootLexoraApp() {
  if (window.app) return;
  try {
    window.app = new LexoraApp();
    window.app.init();
    console.log('🏛️ LÉXORA ARENA inicializada com sucesso!');
  } catch (err) {
    console.error('Erro na inicialização da Léxora:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootLexoraApp);
} else {
  bootLexoraApp();
}

