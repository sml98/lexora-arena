/**
 * LÉXORA - UI Manager & Multi-Game Renderer
 * Controla a renderização de Quarteto Masters, Contexto Arena, Termo Blitz 1x1, Anagrama Rush,
 * lobby de torneios e celebrações de pódio.
 */

import { soundManager } from './audio.js';

export class UIManager {
  constructor(particleEngine) {
    this.particles = particleEngine;
    this.keyStates = {};
  }

  init() {
    this.resetQuartetoGrids();
    this.resetKeyboard();
  }

  resetQuartetoGrids() {
    for (let q = 0; q < 4; q++) {
      const grid = document.getElementById(`grid-${q}`);
      const card = document.getElementById(`quadrant-${q}`);
      const status = document.getElementById(`status-${q}`);

      if (card) card.classList.remove('solved');
      if (status) {
        status.textContent = 'Em jogo';
        status.style.color = '';
      }

      if (grid) {
        grid.innerHTML = '';
        for (let row = 0; row < 9; row++) {
          const rowDiv = document.createElement('div');
          rowDiv.className = `grid-row row-${row}`;
          rowDiv.id = `q${q}-row-${row}`;

          for (let col = 0; col < 5; col++) {
            const tile = document.createElement('div');
            tile.className = 'letter-tile';
            tile.id = `q${q}-r${row}-c${col}`;
            rowDiv.appendChild(tile);
          }
          grid.appendChild(rowDiv);
        }
      }
    }
  }

  resetKeyboard() {
    this.keyStates = {};
    document.querySelectorAll('.key-btn').forEach(btn => {
      btn.classList.remove('key-correct', 'key-present', 'key-absent');
    });
  }

  /* QUARTETO MASTERS */
  highlightActiveRow(attemptIndex, solvedQuadrants) {
    document.querySelectorAll('.letter-tile.active-row').forEach(t => t.classList.remove('active-row'));

    for (let q = 0; q < 4; q++) {
      if (solvedQuadrants && solvedQuadrants[q]) continue;
      for (let col = 0; col < 5; col++) {
        const tile = document.getElementById(`q${q}-r${attemptIndex}-c${col}`);
        if (tile) {
          tile.classList.add('active-row');
        }
      }
    }
  }

  updateCurrentTypingRow(attemptIndex, currentLetters, solvedQuadrants) {
    for (let q = 0; q < 4; q++) {
      if (solvedQuadrants && solvedQuadrants[q]) continue;

      for (let col = 0; col < 5; col++) {
        const tile = document.getElementById(`q${q}-r${attemptIndex}-c${col}`);
        if (tile) {
          const char = currentLetters[col] || '';
          tile.textContent = char;
          tile.classList.toggle('typing', Boolean(char));
          tile.classList.add('active-row');
        }
      }
    }
  }

  async revealGuessRow(attemptIndex, quadrantsData) {
    for (let col = 0; col < 5; col++) {
      soundManager.playTileFlip(col);

      for (let q = 0; q < 4; q++) {
        const qData = quadrantsData[q];
        const guessObj = qData.guesses[attemptIndex];
        if (!guessObj) continue;

        const tile = document.getElementById(`q${q}-r${attemptIndex}-c${col}`);
        if (tile) {
          const tileInfo = guessObj.tiles[col];
          tile.textContent = tileInfo.letter;
          tile.classList.remove('typing', 'active-row');
          tile.classList.add(tileInfo.status);
          this.updateKeyColor(tileInfo.letter, tileInfo.status);
        }
      }

      await new Promise(r => setTimeout(r, 85));
    }

    quadrantsData.forEach((qData, q) => {
      if (qData.solved && qData.solvedAtAttempt === attemptIndex + 1) {
        const card = document.getElementById(`quadrant-${q}`);
        const status = document.getElementById(`status-${q}`);
        if (card) card.classList.add('solved');
        if (status) {
          status.textContent = `✔ DECIFRADA`;
          status.style.color = 'var(--neon-green)';
        }
        soundManager.playWordSolvedChime();
        this.particles.explode('small');
      }
    });
  }

  updateKeyColor(letter, status) {
    const current = this.keyStates[letter];
    if (current === 'correct') return;
    if (current === 'present' && status === 'absent') return;

    this.keyStates[letter] = status;
    const btn = document.querySelector(`.key-btn[data-key="${letter}"]`);
    if (btn) {
      btn.classList.remove('key-correct', 'key-present', 'key-absent');
      btn.classList.add(`key-${status}`);
    }
  }

  /* LOBBY DE SALAS & TORNEIOS */
  renderRoomsLobby(tournaments, onJoinCallback) {
    const grid = document.getElementById('roomsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    tournaments.filter(t => !t.is_daily_major).forEach(t => {
      const card = document.createElement('div');
      card.className = 'room-card';

      const gameIcons = {
        quarteto: '🧠',
        contexto: '🌐',
        termo_blitz: '⚡',
        anagrama: '🔤'
      };
      const icon = gameIcons[t.game_type] || '🏆';

      card.innerHTML = `
        <div class="room-card-header">
          <span class="room-title">${icon} ${t.title}</span>
          <span class="room-players">👥 ${t.registered_count || 0}/${t.max_players}</span>
        </div>
        <div class="room-card-body">
          <div class="room-pot-box">
            <span class="room-pot-label">Pote da Mesa</span>
            <span class="room-pot-val">R$ ${t.prize_pot.toFixed(2)}</span>
          </div>
          <button class="room-join-btn" data-id="${t.id}">
            Entrar • R$ ${t.entry_fee.toFixed(2)}
          </button>
        </div>
      `;

      card.querySelector('.room-join-btn').addEventListener('click', () => {
        onJoinCallback(t.id, t.entry_fee, t.game_type, t.title);
      });

      grid.appendChild(card);
    });
  }

  /* ARENA 2: CONTEXTO */
  renderContextoGuesses(guesses, bestRank) {
    const list = document.getElementById('contextoGuessesList');
    const bestElem = document.getElementById('contextoBestRank');
    if (bestElem) {
      bestElem.textContent = bestRank < 99999 ? `#${bestRank}` : 'Nenhum chute ainda';
    }
    if (!list) return;

    list.innerHTML = '';
    guesses.forEach(g => {
      const row = document.createElement('div');
      row.className = `contexto-row ${g.temperature}`;
      row.innerHTML = `
        <div class="contexto-row-bar" style="width: ${g.progressPercent}%"></div>
        <div class="ctx-left">
          <span class="ctx-word">${g.word}</span>
        </div>
        <div class="ctx-right">
          <span class="ctx-rank">#${g.rank}</span>
          <span class="ctx-label">${g.label}</span>
        </div>
      `;
      list.appendChild(row);
    });
  }

  /* ARENA 3: TERMO BLITZ 1x1 */
  initTermoBlitzGrid() {
    const grid = document.getElementById('termoSingleGrid');
    if (!grid) return;

    grid.innerHTML = '';
    for (let r = 0; r < 6; r++) {
      const rowDiv = document.createElement('div');
      rowDiv.className = `grid-row row-${r}`;
      for (let c = 0; c < 5; c++) {
        const tile = document.createElement('div');
        tile.className = 'letter-tile';
        tile.id = `tb-r${r}-c${c}`;
        rowDiv.appendChild(tile);
      }
      grid.appendChild(rowDiv);
    }
  }

  updateTermoBlitzTyping(attemptIndex, currentLetters) {
    for (let c = 0; c < 5; c++) {
      const tile = document.getElementById(`tb-r${attemptIndex}-c${c}`);
      if (tile) {
        const char = currentLetters[c] || '';
        tile.textContent = char;
        tile.classList.toggle('typing', Boolean(char));
        tile.classList.add('active-row');
      }
    }
  }

  async revealTermoBlitzGuess(attemptIndex, tiles) {
    for (let c = 0; c < 5; c++) {
      soundManager.playTileFlip(c);
      const tile = document.getElementById(`tb-r${attemptIndex}-c${c}`);
      if (tile) {
        tile.textContent = tiles[c].letter;
        tile.classList.remove('typing', 'active-row');
        tile.classList.add(tiles[c].status);
        this.updateKeyColor(tiles[c].letter, tiles[c].status);
      }
      await new Promise(r => setTimeout(r, 70));
    }
  }

  /* ARENA 4: ANAGRAMA RUSH */
  renderAnagramaWheel(letters, onLetterClick) {
    const wheel = document.getElementById('anagramaWheel');
    if (!wheel) return;

    wheel.innerHTML = '';
    letters.forEach(letter => {
      const btn = document.createElement('button');
      btn.className = 'ana-letter-btn';
      btn.textContent = letter;
      btn.addEventListener('click', () => {
        soundManager.playButtonClick();
        onLetterClick(letter);
      });
      wheel.appendChild(btn);
    });
  }

  renderAnagramaFoundWords(foundWords) {
    const container = document.getElementById('anagramaFoundWords');
    if (!container) return;

    container.innerHTML = '';
    foundWords.forEach(w => {
      const chip = document.createElement('span');
      chip.className = 'ana-word-chip';
      chip.textContent = `${w.word} (+${w.points}p)`;
      container.appendChild(chip);
    });
  }

  /* MODAL DE RESULTADO / PÓDIO */
  showTournamentResultModal(data) {
    const modal = document.getElementById('resultModal');
    const banner = document.getElementById('resultBanner');
    const heading = document.getElementById('resultHeading');
    const msg = document.getElementById('resultMessage');
    const payoutBox = document.getElementById('payoutBox');
    const payoutVal = document.getElementById('payoutValue');
    const secretsBox = document.getElementById('secretsRevealBox');
    const secretsChips = document.getElementById('secretsChips');

    if (!modal) return;

    const rank = data.rank || 1;
    const payout = data.payout || 0;

    if (rank === 1) {
      banner.textContent = '🥇';
      heading.textContent = '1º LUGAR • CAMPEÃO LÉXORA!';
      heading.style.color = 'var(--gold-primary)';
      soundManager.playPodiumTrophy();
      this.particles.explode('jackpot');
    } else if (rank === 2) {
      banner.textContent = '🥈';
      heading.textContent = '2º LUGAR • VICE-CAMPEÃO!';
      heading.style.color = '#c0c0c0';
      soundManager.playWordSolvedChime();
      this.particles.explode('medium');
    } else if (rank === 3) {
      banner.textContent = '🥉';
      heading.textContent = '3º LUGAR CONQUISTADO!';
      heading.style.color = '#cd7f32';
      soundManager.playWordSolvedChime();
      this.particles.explode('small');
    } else {
      banner.textContent = '🏅';
      heading.textContent = `TORNEIO FINALIZADO (${rank}º LUGAR)`;
      heading.style.color = 'var(--text-muted)';
    }

    msg.textContent = data.message || `Pontuação final: ${data.score || 0} pontos.`;

    if (payout > 0) {
      payoutVal.textContent = `+R$ ${payout.toFixed(2)}`;
      payoutBox.style.display = 'block';
    } else {
      payoutBox.style.display = 'none';
    }

    if (data.secrets && data.secrets.length > 0) {
      secretsChips.innerHTML = data.secrets.map(s => `<span class="ana-word-chip">${s}</span>`).join(' ');
      secretsBox.style.display = 'block';
    } else {
      secretsBox.style.display = 'none';
    }

    modal.classList.add('active');
  }
}
