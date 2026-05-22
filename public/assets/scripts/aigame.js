(function(){
  // ------------------- УТИЛИТЫ -------------------
  function loadImageAsync(imgElement, src) {
    return new Promise((resolve, reject) => {
      imgElement.onload = resolve;
      imgElement.onerror = () => reject(new Error(`Не удалось загрузить: ${src}`));
      imgElement.src = src;
    });
  }

  // ------------------- ЗЕМЛЯ -------------------
  class Ground {
    static img = null;
    static WIDTH = 2000;
    static HEIGHT = 100;

    static async preload() {
      Ground.img = new Image();
      await loadImageAsync(Ground.img, './assets/ground.png');
    }

    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.x = 0;
      this.y = canvas.height - Ground.HEIGHT;
    }

    draw() {
      this.ctx.drawImage(Ground.img, this.x, this.y);
    }

    update(speed) {
      this.x -= speed;
      if (this.x <= -Ground.WIDTH / 2) this.x = 0;
      this.draw();
    }
  }

  // ------------------- ПТИЦА -------------------
  class Bird {
    static img = null;
    WIDTH = 66;
    HEIGHT = 47;
    HITBOX_W = 55;
    HITBOX_H = 35;
    FLAP_POWER = 4;
    GRAVITY = 0.15;

    static async preload() {
      Bird.img = new Image();
      await loadImageAsync(Bird.img, '../assets/bird.png');
    }

    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.x = canvas.width / 10;
      this.y = canvas.height / 4;
      this.velocity = 0;
    }

    draw() {
      this.ctx.drawImage(Bird.img, this.x - this.WIDTH/2, this.y - this.HEIGHT/2);
    }

    flap() {
      this.velocity = -this.FLAP_POWER;
    }

    update() {
      this.velocity += this.GRAVITY;
      this.y += this.velocity;
      this.draw();
    }

    getBounds() {
      return {
        left: this.x - this.HITBOX_W/2,
        right: this.x + this.HITBOX_W/2,
        top: this.y - this.HITBOX_H/2,
        bottom: this.y + this.HITBOX_H/2
      };
    }
  }

  // ------------------- ТРУБА -------------------
  class Pipe {
    static WIDTH = 100;
    static topImg = null;
    static bottomImg = null;

    static async preload() {
      Pipe.topImg = new Image();
      Pipe.bottomImg = new Image();
      await Promise.all([
        loadImageAsync(Pipe.topImg, '../assets/pipe_up.png'),
        loadImageAsync(Pipe.bottomImg, '../assets/pipe_down.png')
      ]);
    }

    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.width = Pipe.WIDTH;
      this.spacing = 220;
      this.canvasHeight = canvas.height;
      const minTop = canvas.height / 12;
      const maxTop = canvas.height / 2.5;
      this.top = minTop + Math.random() * (maxTop - minTop);
      this.bottom = this.top + this.spacing;
      this.x = canvas.width;
      this.counted = false;
    }

    draw() {
      this.ctx.drawImage(Pipe.topImg, this.x, this.top - Pipe.topImg.height);
      this.ctx.drawImage(Pipe.bottomImg, this.x, this.bottom);
    }

    update(speed) {
      this.x -= speed;
      this.draw();
    }

    isOffscreen() {
      return this.x + this.width < 0;
    }
  }

  // ------------------- КОЛЛИЗИИ -------------------
  function checkCollisions(bird, pipes, ground) {
    const b = bird.getBounds();
    if (b.bottom >= ground.y) return true;
    if (b.top <= 0) return true;

    for (let pipe of pipes) {
      if (b.right > pipe.x && b.left < pipe.x + pipe.width) {
        if (b.top < pipe.top) return true;
        if (b.bottom > pipe.bottom) return true;
      }
    }
    return false;
  }

  // ------------------- ОСНОВНОЙ КЛАСС ИГРЫ -------------------
  class FlappyGame {
    SPEED = 3;
    PIPE_SPACING_FRAMES = 3.5 * Pipe.WIDTH;
    frameCounter = 0;
    score = 0;
    isGameStarted = false;
    gameActive = true;

    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.canvas.width = 540;
      this.canvas.height = 900;
      this.bgImage = new Image();
      this.ground = null;
      this.bird = null;
      this.pipes = [];
      this.animationId = null;
      this.handleInteraction = this.handleInteraction.bind(this);
      this.gameLoop = this.gameLoop.bind(this);
    }

    async loadAssets() {
      await loadImageAsync(this.bgImage, '../assets/background.png');
      await Promise.all([
        Ground.preload(),
        Bird.preload(),
        Pipe.preload()
      ]);
    }

    reset() {
      this.gameActive = true;
      this.isGameStarted = false;
      this.score = 0;
      this.frameCounter = 0;
      this.ground = new Ground(this.canvas);
      this.bird = new Bird(this.canvas);
      this.pipes = [];
      this.pipes.push(new Pipe(this.canvas));
    }

    start() {
      this.reset();
      this.setupControls();
      if (this.animationId) cancelAnimationFrame(this.animationId);
      this.animationId = requestAnimationFrame(this.gameLoop);
    }

    setupControls() {
      document.removeEventListener('keydown', this.handleInteraction);
      document.removeEventListener('mousedown', this.handleInteraction);
      document.removeEventListener('touchstart', this.handleInteraction);
      document.addEventListener('keydown', this.handleInteraction);
      document.addEventListener('mousedown', this.handleInteraction);
      document.addEventListener('touchstart', this.handleInteraction);
    }

    handleInteraction(e) {
      if (e.type === 'keydown' && e.code !== 'Space') return;
      e.preventDefault();
      if (!this.gameActive) {
        this.reset();
        return;
      }
      if (!this.isGameStarted) this.isGameStarted = true;
      this.bird.flap();
    }

    updateWorld() {
      for (let i = 0; i < this.pipes.length; i++) {
        const pipe = this.pipes[i];
        pipe.update(this.SPEED);
        if (!pipe.counted && (pipe.x + pipe.width) < this.bird.x - this.bird.HITBOX_W/2) {
          pipe.counted = true;
          this.score++;
        }
        if (pipe.isOffscreen()) {
          this.pipes.splice(i,1);
          i--;
        }
      }

      if (this.frameCounter * this.SPEED >= this.PIPE_SPACING_FRAMES) {
        this.pipes.push(new Pipe(this.canvas));
        this.frameCounter = 0;
      }

      this.ground.update(this.SPEED);
      this.bird.update();

      if (checkCollisions(this.bird, this.pipes, this.ground)) {
        this.gameActive = false;
      }
      this.frameCounter++;
    }

    drawBackground() {
      this.ctx.drawImage(this.bgImage, 0, 0, this.canvas.width, this.canvas.height);
    }

    drawScore() {
      const text = String(this.score);
      this.ctx.font = 'bold 58px "Courier New", monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.lineWidth = 7;
      this.ctx.strokeStyle = '#3a2c2f';
      this.ctx.strokeText(text, this.canvas.width/2, 18);
      this.ctx.fillStyle = '#f9f3e2';
      this.ctx.fillText(text, this.canvas.width/2, 18);
    }

    drawHUD() {
      if (!this.isGameStarted && this.gameActive) {
        this.ctx.font = '26px "Courier New", monospace';
        this.ctx.fillStyle = '#f9eebe';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('⚡ ПРОБЕЛ / ТАП ⚡', this.canvas.width/2, this.canvas.height/2 + 100);
        this.ctx.font = '22px monospace';
        this.ctx.fillStyle = '#f5bc70';
        this.ctx.fillText('чтобы взлететь', this.canvas.width/2, this.canvas.height/2 + 150);
      }

      if (!this.gameActive) {
        this.ctx.fillStyle = 'rgba(0,0,0,0.65)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.font = 'bold 36px "Courier New", monospace';
        this.ctx.fillStyle = '#ffd966';
        this.ctx.fillText('GAME OVER', this.canvas.width/2, this.canvas.height/2 - 60);
        this.ctx.font = '24px monospace';
        this.ctx.fillStyle = '#ffe1a0';
        this.ctx.fillText(`счёт: ${this.score}`, this.canvas.width/2, this.canvas.height/2);
        this.ctx.font = '20px monospace';
        this.ctx.fillStyle = '#c5e0ff';
        this.ctx.fillText('👆 нажми / пробел для новой игры', this.canvas.width/2, this.canvas.height/2 + 80);
      }
    }

    render() {
      this.drawBackground();
      for (let pipe of this.pipes) pipe.draw();
      this.ground.draw();
      this.bird.draw();
      this.drawScore();
      this.drawHUD();
    }

    gameLoop() {
      if (this.gameActive && this.isGameStarted) this.updateWorld();
      this.render();
      this.animationId = requestAnimationFrame(this.gameLoop);
    }
  }

  // ------------------- ЗАПУСК -------------------
  const canvas = document.getElementById('canvas');
  const game = new FlappyGame(canvas);
  game.loadAssets().then(() => game.start()).catch(err => {
    console.error(err);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ff8888';
    ctx.font = '16px monospace';
  });
})();