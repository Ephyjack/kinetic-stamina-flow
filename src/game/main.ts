import {
  AUTO,
  Events,
  Game as PhaserGame,
  Scale,
  Scene,
  Physics,
  GameObjects,
  Sound,
  Types,
  Input as PhaserInput,
} from 'phaser';
import { generateMosiSheets } from '../sprites/Mosi';

// ---------------------------------------------------------------------------
// CONSTANTS — inline (no separate constants.ts per scaffold hygiene)
// ---------------------------------------------------------------------------
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const WORLD_W = 3840;
export const WORLD_H = 720;
export const GROUND_Y = 520;
export const KILL_Y = 700;

const GRAVITY_Y = 900;
const WALK_SPEED = 140;
const RUN_SPEED = 260;
const CROUCH_SPEED = 75;
const SLIDE_IMPULSE = 360;
const JUMP_VY = -420;
const ACCEL_LERP = 12.0;

const STAMINA_MAX = 100;
const RUN_DRAIN = 18;
const SLIDE_COST = 20;
const IDLE_REGEN = 25;
const WALK_REGEN = 15;
const CROUCH_REGEN = 30;
const EXHAUST_EXIT = 20;

export const COLORS = {
  SKY_TOP: 0x0d1b2a,
  SKY_BOT: 0x1b263b,
  FAR: 0x1b263b,
  MID: 0x1c2541,
  NEAR: 0x3a506b,
  ROCK: 0x2b2d42,
  GRASS: 0x06d6a0,
  CRYSTAL: 0x48cae4,
} as const;

// ---------------------------------------------------------------------------
// EVENT NAMES — single source of truth (React <-> Phaser bridge)
// ---------------------------------------------------------------------------
export const EV = {
  SCENE_READY: 'current-scene-ready',
  PHASE_CHANGED: 'phase-changed',
  STAMINA_UPDATED: 'stamina-updated',
  STATE_UPDATED: 'state-updated',
  AUDIO_TOGGLED: 'audio-toggled',
  START_GAME: 'start-game',
  RESTART_GAME: 'restart-game',
  TOGGLE_PAUSE: 'toggle-pause',
  TOUCH_INPUT: 'touch-input',
} as const;

export type GamePhase = 'MENU' | 'PLAYING' | 'PAUSED';
export type MoveState = 'IDLE' | 'WALK' | 'RUN' | 'JUMP' | 'CROUCH' | 'SLIDE';

interface StaminaPayload {
  stamina: number;
  maxStamina: number;
  isExhausted: boolean;
}
interface StatePayload {
  state: MoveState;
  speed: number;
  isGrounded: boolean;
}

// ---------------------------------------------------------------------------
// EVENT BUS
// ---------------------------------------------------------------------------
export const EventBus = new Events.EventEmitter();

// Static-body refresh helper (refreshBody exists at runtime on the GameObject
// but is not declared on Image in the Phaser 4 typings).
const refreshStatic = (img: GameObjects.Image) => {
  (img as unknown as { refreshBody(): void }).refreshBody();
};

// ---------------------------------------------------------------------------
// GAME SCENE
// ---------------------------------------------------------------------------
export class Game extends Scene {
  private player!: Physics.Arcade.Sprite;
  private platforms!: Physics.Arcade.StaticGroup;
  private keys!: Record<string, PhaserInput.Keyboard.Key>;
  private cursors!: Types.Input.Keyboard.CursorKeys;

  private phase: GamePhase = 'MENU';
  private moveState: MoveState = 'IDLE';
  private stamina = STAMINA_MAX;
  private exhausted = false;
  private regenDelay = 0;
  private slideTimer = 0;
  private facing: 1 | -1 = 1;
  private grounded = false;
  private coyoteTimer = 0;
  private jumpBuffered = false;
  private crouchHeld = false;
  private runHeld = false;
  private touch = { left: false, right: false, jump: false, run: false, crouch: false };
  private lastSafeX = 120;
  private lastSafeY = GROUND_Y - 64;
  private hudAccum = 0;
  private bgm: Sound.BaseSound | null = null;
  private muted = false;
  private dust!: Physics.Arcade.Group;
  private sweatTint = 0;
  private runDustLatch = false;
  private slideDustLatch = false;

  constructor() {
    super('Game');
  }

  // ---- PRELOAD: procedural sheets + audio ----
  preload() {
    const sheets = generateMosiSheets();
    this.load.spritesheet('mosi_idle', sheets['mosi_idle'], { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('mosi_walk', sheets['mosi_walk'], { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('mosi_run', sheets['mosi_run'], { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('mosi_jump', sheets['mosi_jump'], { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('mosi_crouch_idle', sheets['mosi_crouch_idle'], { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('mosi_crouch_move', sheets['mosi_crouch_move'], { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('mosi_slide', sheets['mosi_slide'], { frameWidth: 128, frameHeight: 128 });
    this.load.audio('sfx_jump', 'assets/audio/sfx_jump.mp3');
    this.load.audio('sfx_button', 'assets/audio/sfx_button.mp3');
    this.load.audio('sfx_powerup', 'assets/audio/sfx_powerup.mp3');
    this.load.audio('bgm_chill', 'assets/audio/bgm_chill.mp3');
    this.load.image('fx_smoke', 'assets/fx/smoke.png');
    this.load.image('fx_spark', 'assets/fx/spark.png');
    this.load.image('fx_glow', 'assets/fx/glow.png');
  }

  // ---- CREATE ----
  create() {
    this.createAnimations();
    this.buildBackground();
    this.buildLevel();
    this.spawnPlayer();
    this.setupInput();
    this.setupCamera();
    this.setupEvents();

    // Start in MENU phase
    this.physics.world.pause();
    this.phase = 'MENU';
    EventBus.emit(EV.PHASE_CHANGED, this.phase);
    EventBus.emit(EV.SCENE_READY, this);

    this.events.once('shutdown', () => {
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.input.keyboard?.removeAllListeners();
      EventBus.off(EV.START_GAME, this.onStartGame);
      EventBus.off(EV.RESTART_GAME, this.onRestartGame);
      EventBus.off(EV.TOGGLE_PAUSE, this.onTogglePause);
      EventBus.off(EV.AUDIO_TOGGLED, this.onAudioToggled);
      EventBus.off(EV.TOUCH_INPUT, this.onTouchInput);
      this.sound.stopAll();
    });
  }

  // ---- ANIMATIONS ----
  private createAnimations() {
    if (!this.anims.exists('anim_idle'))
      this.anims.create({ key: 'anim_idle', frames: this.anims.generateFrameNumbers('mosi_idle', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('anim_walk'))
      this.anims.create({ key: 'anim_walk', frames: this.anims.generateFrameNumbers('mosi_walk', { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('anim_run'))
      this.anims.create({ key: 'anim_run', frames: this.anims.generateFrameNumbers('mosi_run', { start: 0, end: 7 }), frameRate: 14, repeat: -1 });
    if (!this.anims.exists('anim_jump'))
      this.anims.create({ key: 'anim_jump', frames: this.anims.generateFrameNumbers('mosi_jump', { start: 0, end: 5 }), frameRate: 12, repeat: 0 });
    if (!this.anims.exists('anim_crouch_idle'))
      this.anims.create({ key: 'anim_crouch_idle', frames: this.anims.generateFrameNumbers('mosi_crouch_idle', { start: 0, end: 5 }), frameRate: 6, repeat: -1 });
    if (!this.anims.exists('anim_crouch_move'))
      this.anims.create({ key: 'anim_crouch_move', frames: this.anims.generateFrameNumbers('mosi_crouch_move', { start: 0, end: 7 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('anim_slide'))
      this.anims.create({ key: 'anim_slide', frames: this.anims.generateFrameNumbers('mosi_slide', { start: 0, end: 5 }), frameRate: 12, repeat: 0 });
  }

  // ---- PARALLAX BACKGROUND ----
  private buildBackground() {
    // Gradient sky
    const sky = this.add.graphics();
    sky.fillGradientStyle(COLORS.SKY_TOP, COLORS.SKY_TOP, COLORS.SKY_BOT, COLORS.SKY_BOT, 1);
    sky.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    sky.setScrollFactor(0);
    sky.setDepth(-100);

    // Stars (static layer)
    const stars = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * GAME_HEIGHT * 0.6;
      const a = 0.3 + Math.random() * 0.7;
      stars.fillStyle(0xffffff, a);
      stars.fillCircle(x, y, Math.random() * 1.4 + 0.4);
    }
    stars.setScrollFactor(0);
    stars.setDepth(-99);

    // Far mountains (organic silhouette)
    const far = this.add.graphics();
    far.fillStyle(COLORS.FAR, 1);
    far.beginPath();
    far.moveTo(0, GAME_HEIGHT);
    for (let x = 0; x <= GAME_WIDTH; x += 40) {
      const h = 200 + Math.sin(x * 0.008) * 60 + Math.sin(x * 0.021) * 30;
      far.lineTo(x, GAME_HEIGHT - h);
    }
    far.lineTo(GAME_WIDTH, GAME_HEIGHT);
    far.closePath();
    far.fill();
    far.setScrollFactor(0.1);
    far.setDepth(-98);

    // Mid ruins + pines
    const mid = this.add.graphics();
    mid.fillStyle(COLORS.MID, 1);
    mid.beginPath();
    mid.moveTo(0, GAME_HEIGHT);
    for (let x = 0; x <= GAME_WIDTH; x += 30) {
      const h = 120 + Math.sin(x * 0.015 + 1) * 40 + Math.sin(x * 0.04) * 18;
      mid.lineTo(x, GAME_HEIGHT - h);
    }
    mid.lineTo(GAME_WIDTH, GAME_HEIGHT);
    mid.closePath();
    mid.fill();
    for (let i = 0; i < 14; i++) {
      const px = 30 + i * 70 + Math.sin(i * 3) * 12;
      const py = GAME_HEIGHT - 130 - Math.sin(px * 0.015 + 1) * 40;
      mid.fillStyle(0x16213e, 1);
      mid.fillTriangle(px, py - 46, px - 14, py, px + 14, py);
      mid.fillTriangle(px, py - 60, px - 11, py - 18, px + 11, py - 18);
    }
    mid.setScrollFactor(0.3);
    mid.setDepth(-97);

    // Near treeline
    const near = this.add.graphics();
    near.fillStyle(COLORS.NEAR, 1);
    near.beginPath();
    near.moveTo(0, GAME_HEIGHT);
    for (let x = 0; x <= GAME_WIDTH; x += 24) {
      const h = 60 + Math.sin(x * 0.02 + 2) * 24 + Math.sin(x * 0.05) * 10;
      near.lineTo(x, GAME_HEIGHT - h);
    }
    near.lineTo(GAME_WIDTH, GAME_HEIGHT);
    near.closePath();
    near.fill();
    near.setScrollFactor(0.55);
    near.setDepth(-96);
  }

  // ---- LEVEL ----
  private buildLevel() {
    this.platforms = this.physics.add.staticGroup();
    this.makePlatformTextures();

    // Ground segments with gaps
    const groundSegs: Array<[number, number]> = [
      [0, 1400], [1520, 900], [2520, 600], [3220, 620],
    ];
    groundSegs.forEach(([x, w]) => {
      const g = this.platforms.create(x + w / 2, GROUND_Y + 20, 'platform_tile') as GameObjects.Image;
      g.setDisplaySize(w, 40);
      refreshStatic(g);
    });

    // Stepping platforms (Pillar Stairway zone ~2520-3100)
    const steps: Array<[number, number, number]> = [
      [700, 440, 140], [850, 380, 120], [1000, 320, 120],
      [1700, 430, 160], [1900, 370, 140], [2080, 430, 140],
      [2620, 450, 110], [2760, 390, 110], [2900, 330, 110], [3040, 390, 110],
    ];
    steps.forEach(([x, y, w]) => {
      const p = this.platforms.create(x, y, 'platform_tile') as GameObjects.Image;
      p.setDisplaySize(w, 26);
      refreshStatic(p);
    });

    // Low tunnels (crawlspaces) — ceiling blocks forcing crouch/slide
    const tunnels: Array<[number, number]> = [
      [1180, 200], [2280, 220], [3380, 180],
    ];
    tunnels.forEach(([x, w]) => {
      const c = this.platforms.create(x + w / 2, GROUND_Y - 34, 'ceiling_tile') as GameObjects.Image;
      c.setDisplaySize(w, 40);
      refreshStatic(c);
      const l = this.platforms.create(x - 14, GROUND_Y - 60, 'pillar_tile') as GameObjects.Image;
      l.setDisplaySize(28, 80);
      refreshStatic(l);
      const r = this.platforms.create(x + w + 14, GROUND_Y - 60, 'pillar_tile') as GameObjects.Image;
      r.setDisplaySize(28, 80);
      refreshStatic(r);
    });

    // High platforms reachable via jump (H = 420^2/(2*900) ≈ 98px; steps ≤ 74px)
    const highs: Array<[number, number]> = [
      [420, GROUND_Y - 74], [560, GROUND_Y - 74], [1450, GROUND_Y - 60],
      [2450, GROUND_Y - 70], [3200, GROUND_Y - 74],
    ];
    highs.forEach(([x, y]) => {
      const h = this.platforms.create(x, y, 'platform_tile') as GameObjects.Image;
      h.setDisplaySize(100, 24);
      refreshStatic(h);
    });

    // Crystal accents (decor)
    const deco = this.add.graphics();
    [300, 950, 1650, 2350, 2950, 3500].forEach((x) => {
      deco.fillStyle(COLORS.CRYSTAL, 0.9);
      deco.fillTriangle(x, GROUND_Y - 2, x - 6, GROUND_Y - 18, x + 6, GROUND_Y - 18);
      deco.fillStyle(0xffffff, 0.5);
      deco.fillTriangle(x, GROUND_Y - 6, x - 3, GROUND_Y - 16, x + 1, GROUND_Y - 16);
    });
    deco.setDepth(1);

    // Zone labels baked into world
    const label = (x: number, txt: string) =>
      this.add
        .text(x, GROUND_Y - 130, txt, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          color: '#48cae4',
          stroke: '#0b132b',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(2)
        .setAlpha(0.85);
    label(700, 'THE LONG SPRINT PLAIN');
    label(1280, 'LOW ARCH CAVERNS');
    label(2800, 'PILLAR STAIRWAY');
    label(3500, 'RECOVERY OASIS');
  }

  private makePlatformTextures() {
    const g = this.add.graphics();
    g.fillStyle(COLORS.ROCK, 1);
    g.fillRect(0, 6, 64, 26);
    g.fillStyle(0x22303f, 1);
    for (let i = 0; i < 6; i++) g.fillRect(4 + i * 10, 12 + (i % 2) * 6, 6, 4);
    g.fillStyle(COLORS.GRASS, 1);
    g.fillRect(0, 0, 64, 7);
    g.fillStyle(0x0abf8f, 1);
    g.fillRect(0, 5, 64, 2);
    g.generateTexture('platform_tile', 64, 32);
    g.clear();
    g.fillStyle(0x243447, 1);
    g.fillRect(0, 0, 64, 32);
    g.fillStyle(COLORS.CRYSTAL, 0.35);
    g.fillRect(0, 28, 64, 4);
    g.fillStyle(0x16213e, 1);
    for (let i = 0; i < 5; i++) g.fillRect(6 + i * 12, 6, 8, 20);
    g.generateTexture('ceiling_tile', 64, 32);
    g.clear();
    g.fillStyle(0x2b2d42, 1);
    g.fillRect(0, 0, 32, 80);
    g.fillStyle(0x3a506b, 1);
    g.fillRect(0, 0, 32, 6);
    g.fillStyle(COLORS.CRYSTAL, 0.5);
    g.fillRect(12, 20, 8, 40);
    g.generateTexture('pillar_tile', 32, 80);
    g.destroy();
  }

  // ---- PLAYER ----
  private spawnPlayer() {
    this.player = this.physics.add.sprite(120, GROUND_Y - 64, 'mosi_idle');
    this.player.setOrigin(0.5, 0.5);
    this.player.play('anim_idle');
    const body = this.player.body as Physics.Arcade.Body;
    body.setSize(36, 64);
    body.setOffset(46, 64);
    body.setMaxVelocity(420, 700);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.platforms);
    this.lastSafeX = this.player.x;
    this.lastSafeY = this.player.y;
  }

  private setHitbox(crouch: boolean) {
    const body = this.player.body as Physics.Arcade.Body;
    if (crouch) {
      body.setSize(36, 34);
      body.setOffset(46, 94);
    } else {
      body.setSize(36, 64);
      body.setOffset(46, 64);
    }
  }

  // ---- INPUT ----
  private setupInput() {
    this.keys = this.input.keyboard!.addKeys('A,D,W,S,SPACE,SHIFT,ESC') as Record<
      string,
      PhaserInput.Keyboard.Key
    >;
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.phase !== 'MENU') EventBus.emit(EV.TOGGLE_PAUSE);
    });
  }

  // ---- CAMERA ----
  private setupCamera() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(120, 80);
  }

  // ---- EVENTS ----
  private setupEvents() {
    EventBus.on(EV.START_GAME, this.onStartGame, this);
    EventBus.on(EV.RESTART_GAME, this.onRestartGame, this);
    EventBus.on(EV.TOGGLE_PAUSE, this.onTogglePause, this);
    EventBus.on(EV.AUDIO_TOGGLED, this.onAudioToggled, this);
    EventBus.on(EV.TOUCH_INPUT, this.onTouchInput, this);
  }

  private onStartGame = () => {
    if (this.phase !== 'MENU') return;
    this.phase = 'PLAYING';
    this.physics.world.resume();
    this.tweens.resumeAll();
    this.safePlay('sfx_button');
    this.startBgm();
    EventBus.emit(EV.PHASE_CHANGED, this.phase);
  };

  private onRestartGame = () => {
    this.phase = 'PLAYING';
    this.stamina = STAMINA_MAX;
    this.exhausted = false;
    this.moveState = 'IDLE';
    this.slideTimer = 0;
    this.player.setPosition(this.lastSafeX, this.lastSafeY);
    const body = this.player.body as Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.setHitbox(false);
    this.player.play('anim_idle', true);
    this.physics.world.resume();
    this.tweens.resumeAll();
    this.safePlay('sfx_button');
    EventBus.emit(EV.PHASE_CHANGED, this.phase);
  };

  private onTogglePause = () => {
    if (this.phase === 'PLAYING') {
      this.phase = 'PAUSED';
      this.physics.world.pause();
      this.tweens.pauseAll();
      this.sound.pauseAll();
    } else if (this.phase === 'PAUSED') {
      this.phase = 'PLAYING';
      this.physics.world.resume();
      this.tweens.resumeAll();
      if (!this.muted) this.sound.resumeAll();
    }
    EventBus.emit(EV.PHASE_CHANGED, this.phase);
  };

  private onAudioToggled = (payload: { muted: boolean }) => {
    this.muted = payload.muted;
    this.sound.mute = this.muted;
    if (this.muted) this.sound.pauseAll();
    else if (this.phase === 'PLAYING') this.sound.resumeAll();
  };

  private onTouchInput = (payload: { action: string; down: boolean }) => {
    if (payload.action in this.touch) {
      (this.touch as Record<string, boolean>)[payload.action] = payload.down;
    }
  };

  // ---- AUDIO HELPERS ----
  private safePlay(key: string, volume = 0.6) {
    if (this.cache.audio.exists(key) && !this.muted) {
      this.sound.play(key, { volume });
    }
  }

  private startBgm() {
    if (this.bgm && this.bgm.isPlaying) return;
    if (!this.cache.audio.exists('bgm_chill')) return;
    this.bgm = this.sound.add('bgm_chill', { loop: true, volume: 0.35 });
    if (!this.muted) this.bgm.play();
  }

  // ---- DUST PARTICLES ----
  private spawnDust(x: number, y: number, count: number, speed: number) {
    if (!this.dust) this.dust = this.physics.add.group({ allowGravity: false });
    for (let i = 0; i < count; i++) {
      const d = this.dust.get(x, y, 'fx_smoke');
      if (!d) continue;
      d.setActive(true).setVisible(true);
      d.setAlpha(0.5);
      d.setScale(0.25 + Math.random() * 0.2);
      const db = d.body as Physics.Arcade.Body;
      db.setAllowGravity(false);
      db.setVelocity((Math.random() - 0.5) * speed, -Math.random() * speed * 0.5);
      this.tweens.add({
        targets: d,
        alpha: 0,
        scaleX: 0.6,
        scaleY: 0.6,
        duration: 380,
        onComplete: () => {
          d.setActive(false).setVisible(false);
          db.reset(0, 0);
          db.enable = false;
        },
      });
    }
  }

  // ---- UPDATE LOOP ----
  update(time: number, delta: number) {
    if (this.phase !== 'PLAYING') return;
    const dt = Math.min(delta, 50) / 1000;
    const body = this.player.body as Physics.Arcade.Body;
    const onGround = body.blocked.down || body.touching.down;
    this.grounded = onGround;
    if (onGround) this.coyoteTimer = 0.1;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    // Input aggregation (keyboard + touch)
    const left = this.keys.A.isDown || this.cursors.left.isDown || this.touch.left;
    const right = this.keys.D.isDown || this.cursors.right.isDown || this.touch.right;
    const jumpKey =
      this.keys.SPACE.isDown || this.keys.W.isDown || this.cursors.up.isDown || this.touch.jump;
    const downKey = this.keys.S.isDown || this.cursors.down.isDown || this.touch.crouch;
    this.runHeld = this.keys.SHIFT.isDown || this.touch.run;
    this.crouchHeld = downKey;

    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir !== 0) this.facing = dir as 1 | -1;
    this.player.setFlipX(this.facing === -1);

    // ---- SLIDE state ----
    if (this.moveState === 'SLIDE') {
      this.slideTimer -= dt;
      const decay = 1 - dt * 3.2;
      body.velocity.x *= Math.max(0, decay);
      if (this.slideTimer <= 0 || Math.abs(body.velocity.x) < CROUCH_SPEED + 10) {
        this.moveState = onGround ? (this.crouchHeld ? 'CROUCH' : 'IDLE') : 'JUMP';
      }
    } else {
      // ---- Slide trigger: run + down on ground ----
      const speedNow = Math.abs(body.velocity.x);
      if (
        this.crouchHeld &&
        onGround &&
        this.runHeld &&
        speedNow > 180 &&
        this.stamina > SLIDE_COST &&
        !this.exhausted
      ) {
        this.moveState = 'SLIDE';
        this.slideTimer = 0.5;
        this.stamina = Math.max(0, this.stamina - SLIDE_COST);
        body.velocity.x = this.facing * SLIDE_IMPULSE;
        this.setHitbox(true);
        this.player.play('anim_slide', true);
        this.spawnDust(this.player.x - this.facing * 18, this.player.y + 30, 6, 120);
        this.safePlay('sfx_powerup', 0.25);
      } else {
        // ---- Horizontal movement ----
        let target = 0;
        let state: MoveState = 'IDLE';
        if (this.crouchHeld && onGround) {
          target = dir * CROUCH_SPEED;
          state = 'CROUCH';
          this.setHitbox(true);
        } else {
          this.setHitbox(false);
          if (dir !== 0) {
            const maxSpeed = this.exhausted ? WALK_SPEED : this.runHeld ? RUN_SPEED : WALK_SPEED;
            target = dir * maxSpeed;
            state = this.runHeld && !this.exhausted ? 'RUN' : 'WALK';
          } else {
            state = 'IDLE';
          }
        }
        if (!onGround) state = 'JUMP';
        this.moveState = state;

        const lerpF = Math.min(1, ACCEL_LERP * dt);
        body.velocity.x = body.velocity.x + (target - body.velocity.x) * lerpF;

        // ---- Jump ----
        if (jumpKey && !this.jumpBuffered) {
          this.jumpBuffered = true;
          if (onGround || this.coyoteTimer > 0) {
            body.setVelocityY(JUMP_VY);
            this.coyoteTimer = 0;
            this.spawnDust(this.player.x, this.player.y + 30, 4, 80);
            this.safePlay('sfx_jump', 0.5);
          }
        }
        if (!jumpKey) this.jumpBuffered = false;
      }
    }

    // ---- Animation state machine with smooth blending ----
    this.applyAnimation(body);

    // ---- Stamina ----
    this.updateStamina(dt, body);

    // ---- Footstep dust while running ----
    if (this.moveState === 'RUN' && onGround && Math.floor(time / 140) % 2 === 0 && !this.runDustLatch) {
      this.runDustLatch = true;
      this.spawnDust(this.player.x - this.facing * 12, this.player.y + 28, 1, 50);
      this.time.delayedCall(140, () => (this.runDustLatch = false));
    }
    if (this.moveState === 'SLIDE' && onGround && Math.floor(time / 60) % 2 === 0 && !this.slideDustLatch) {
      this.slideDustLatch = true;
      this.spawnDust(this.player.x - this.facing * 20, this.player.y + 28, 2, 100);
      this.time.delayedCall(90, () => (this.slideDustLatch = false));
    }

    // ---- Kill plane / checkpoint respawn ----
    if (this.player.y > KILL_Y) {
      this.player.setPosition(this.lastSafeX, this.lastSafeY - 40);
      body.setVelocity(0, 0);
      this.cameras.main.shake(120, 0.004);
    }
    if (this.grounded && this.moveState !== 'SLIDE') {
      this.lastSafeX = this.player.x;
      this.lastSafeY = this.player.y;
    }

    // ---- HUD telemetry (throttled ~15fps) ----
    this.hudAccum += delta;
    if (this.hudAccum >= 66) {
      this.hudAccum = 0;
      const sp: StaminaPayload = {
        stamina: Math.round(this.stamina),
        maxStamina: STAMINA_MAX,
        isExhausted: this.exhausted,
      };
      EventBus.emit(EV.STAMINA_UPDATED, sp);
      const st: StatePayload = {
        state: this.moveState,
        speed: Math.round(Math.abs(body.velocity.x)),
        isGrounded: this.grounded,
      };
      EventBus.emit(EV.STATE_UPDATED, st);
    }
  }

  private applyAnimation(body: Physics.Arcade.Body) {
    const s = this.player;
    let key = 'anim_idle';
    switch (this.moveState) {
      case 'WALK': key = 'anim_walk'; break;
      case 'RUN': key = 'anim_run'; break;
      case 'JUMP': key = 'anim_jump'; break;
      case 'CROUCH':
        key = Math.abs(body.velocity.x) > 10 ? 'anim_crouch_move' : 'anim_crouch_idle';
        break;
      case 'SLIDE': key = 'anim_slide'; break;
      default: key = 'anim_idle';
    }
    if (!s.anims.isPlaying || s.anims.currentAnim?.key !== key) {
      s.play(key, true);
      this.tweens.add({
        targets: s,
        alpha: { from: 0.82, to: 1 },
        duration: 110,
        ease: 'Sine.easeOut',
      });
    }
    // Crouch squash/stretch lerp for fluid transitions
    const low = this.moveState === 'CROUCH' || this.moveState === 'SLIDE';
    const targetScaleY = low ? 0.78 : 1;
    const targetScaleX = low ? 1.08 : 1;
    s.scaleY += (targetScaleY - s.scaleY) * 0.18;
    s.scaleX += (targetScaleX - s.scaleX) * 0.18;

    // Exhaustion tint pulse
    if (this.exhausted) {
      this.sweatTint = (this.sweatTint + 1) % 30;
      s.setTint(this.sweatTint < 15 ? 0xffd166 : 0xffffff);
    } else if (s.tintTopLeft !== 0xffffff) {
      s.clearTint();
    }
  }

  private updateStamina(dt: number, body: Physics.Arcade.Body) {
    const speed = Math.abs(body.velocity.x);
    if (this.moveState === 'RUN' && speed > WALK_SPEED + 20) {
      this.stamina = Math.max(0, this.stamina - RUN_DRAIN * dt);
      this.regenDelay = 0.3;
    } else if (this.moveState === 'SLIDE') {
      this.regenDelay = 0.3;
    } else {
      this.regenDelay = Math.max(0, this.regenDelay - dt);
      if (this.regenDelay <= 0) {
        let rate = 0;
        if (this.moveState === 'IDLE') rate = IDLE_REGEN;
        else if (this.moveState === 'WALK') rate = WALK_REGEN;
        else if (this.moveState === 'CROUCH' && speed < 10) rate = CROUCH_REGEN;
        else if (this.moveState === 'CROUCH') rate = 8;
        if (rate > 0) {
          const before = this.stamina;
          this.stamina = Math.min(STAMINA_MAX, this.stamina + rate * dt);
          if (before < EXHAUST_EXIT && this.stamina >= EXHAUST_EXIT) {
            this.safePlay('sfx_powerup', 0.4);
          }
        }
      }
    }
    // Exhaustion latch
    if (this.stamina <= 0) this.exhausted = true;
    if (this.exhausted && this.stamina >= EXHAUST_EXIT) this.exhausted = false;
  }
}

// ---------------------------------------------------------------------------
// START GAME FACTORY
// ---------------------------------------------------------------------------
const StartGame = (parent: string) => {
  const config: Types.Core.GameConfig = {
    type: AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    backgroundColor: '#0b132b',
    scale: {
      mode: Scale.FIT,
      autoCenter: Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: GRAVITY_Y }, debug: false },
    },
    scene: [Game],
  };
  const game = new PhaserGame(config);
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
    (window as unknown as Record<string, unknown>).__PHASER_EVENT_BUS__ = EventBus;
  }
  return game;
};

export default StartGame;