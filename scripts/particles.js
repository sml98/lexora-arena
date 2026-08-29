/**
 * LÉXORA ARENA - Canvas Particle Engine
 * Sistema de partículas acelerado em HTML5 Canvas para moedas, confetes e estrelas.
 */

class ParticleEngine {
  constructor(canvasOrId = 'particlesCanvas') {
    this.canvasOrId = canvasOrId;
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.isRunning = false;
    this.animationFrameId = null;

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.resize());
    }
  }

  init() {
    if (typeof document === 'undefined') return;
    if (typeof this.canvasOrId === 'string') {
      this.canvas = document.getElementById(this.canvasOrId);
    } else {
      this.canvas = this.canvasOrId;
    }

    if (this.canvas && this.canvas.getContext) {
      this.ctx = this.canvas.getContext('2d');
      this.resize();
    }
  }

  resize() {
    if (!this.canvas || typeof window === 'undefined') return;
    try {
      this.canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
      this.canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
      if (this.ctx) {
        this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      }
    } catch (e) {
      console.warn('Erro ao redimensionar canvas:', e);
    }
  }

  createCoin(x, y) {
    const width = typeof window !== 'undefined' ? window.innerWidth : 800;
    return {
      type: 'coin',
      x: x || (Math.random() * width),
      y: y || -20,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 3,
      radius: Math.random() * 8 + 10,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: Math.random() * 0.15 + 0.05,
      gravity: 0.22,
      friction: 0.99,
      alpha: 1,
      decay: 0.003
    };
  }

  createConfetti(x, y) {
    const colors = ['#ffd700', '#ff007b', '#00f0ff', '#00ff66', '#ffea00', '#b000ff'];
    const width = typeof window !== 'undefined' ? window.innerWidth : 800;
    return {
      type: 'confetti',
      x: x || (Math.random() * width),
      y: y || -10,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 5 + 3,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      wobble: Math.random() * 10,
      wobbleSpeed: Math.random() * 0.1 + 0.05,
      gravity: 0.18,
      friction: 0.98,
      alpha: 1,
      decay: 0.004
    };
  }

  createStar(x, y) {
    return {
      type: 'star',
      x: x || 0,
      y: y || 0,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12 - 3,
      size: Math.random() * 5 + 4,
      color: '#ffd700',
      alpha: 1,
      gravity: 0.15,
      friction: 0.96,
      decay: 0.015
    };
  }

  explode(type = 'medium') {
    if (!this.canvas) this.init();
    if (!this.ctx || !this.canvas) return;

    const width = typeof window !== 'undefined' ? window.innerWidth : 800;
    const height = typeof window !== 'undefined' ? window.innerHeight : 600;

    let coinCount = 15;
    let confettiCount = 20;
    let starCount = 15;

    if (type === 'small') {
      coinCount = 8;
      confettiCount = 12;
      starCount = 8;
    } else if (type === 'medium') {
      coinCount = 25;
      confettiCount = 40;
      starCount = 20;
    } else if (type === 'big') {
      coinCount = 50;
      confettiCount = 80;
      starCount = 40;
    } else if (type === 'mega' || type === 'jackpot') {
      coinCount = 120;
      confettiCount = 180;
      starCount = 70;
    }

    for (let i = 0; i < coinCount; i++) {
      this.particles.push(this.createCoin(Math.random() * width, -Math.random() * 200));
    }
    for (let i = 0; i < confettiCount; i++) {
      this.particles.push(this.createConfetti(Math.random() * width, -Math.random() * 300));
    }
    for (let i = 0; i < starCount; i++) {
      this.particles.push(this.createStar(width / 2 + (Math.random() - 0.5) * width * 0.8, height / 2 + (Math.random() - 0.5) * 200));
    }

    if (!this.isRunning) {
      this.isRunning = true;
      this.loop();
    }
  }

  loop() {
    if (!this.isRunning) return;

    if (this.particles.length === 0) {
      this.isRunning = false;
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      return;
    }

    this.update();
    this.draw();

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.alpha -= p.decay;

      if (p.type === 'coin') {
        p.rotation += p.rotationSpeed;
      } else if (p.type === 'confetti') {
        p.rotation += p.rotationSpeed;
        p.wobble += p.wobbleSpeed;
        p.x += Math.sin(p.wobble) * 1.5;
      }

      if (p.alpha <= 0 || (this.canvas && p.y > this.canvas.height + 50)) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.alpha);

      if (p.type === 'coin') {
        this.ctx.translate(p.x, p.y);
        const scaleX = Math.cos(p.rotation);
        this.ctx.scale(scaleX, 1);

        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffd700';
        this.ctx.fill();
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#b8860b';
        this.ctx.stroke();

        if (Math.abs(scaleX) > 0.4) {
          this.ctx.fillStyle = '#8b6508';
          this.ctx.font = `bold ${Math.floor(p.radius * 0.9)}px Montserrat, sans-serif`;
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText('$', 0, 0);
        }
      } else if (p.type === 'confetti') {
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.type === 'star') {
        this.ctx.translate(p.x, p.y);
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        this.ctx.shadowColor = '#ffd700';
        this.ctx.shadowBlur = 8;
        this.ctx.fill();
      }

      this.ctx.restore();
    });
  }
}

export { ParticleEngine };
