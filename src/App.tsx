import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import StartGame, { EventBus, EV, type GamePhase, type MoveState } from './game/main';

export interface IRefPhaserGame {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

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

const STATE_COLORS: Record<MoveState, string> = {
  IDLE: '#8ecae6',
  WALK: '#06d6a0',
  RUN: '#ffd166',
  JUMP: '#48cae4',
  CROUCH: '#a06cd5',
  SLIDE: '#ef476f',
};

function App() {
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const [phase, setPhase] = useState<GamePhase>('MENU');
  const [stamina, setStamina] = useState<StaminaPayload>({
    stamina: 100,
    maxStamina: 100,
    isExhausted: false,
  });
  const [playerState, setPlayerState] = useState<StatePayload>({
    state: 'IDLE',
    speed: 0,
    isGrounded: true,
  });
  const [muted, setMuted] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [bootError, setBootError] = useState(false);

  // ---- Mount Phaser ----
  useLayoutEffect(() => {
    if (phaserRef.current === null) {
      try {
        const game = StartGame('game-container');
        phaserRef.current = { game, scene: null };
      } catch {
        setBootError(true);
      }
    }
    const handler = (scene: Phaser.Scene) => {
      if (phaserRef.current) phaserRef.current.scene = scene;
    };
    EventBus.on(EV.SCENE_READY, handler);
    const bootTimer = window.setTimeout(() => {
      if (phaserRef.current && phaserRef.current.scene === null) setBootError(true);
    }, 8000);
    return () => {
      EventBus.removeListener(EV.SCENE_READY, handler);
      window.clearTimeout(bootTimer);
      if (phaserRef.current) {
        phaserRef.current.game?.destroy(true);
        phaserRef.current = null;
      }
    };
  }, []);

  // ---- EventBus subscriptions ----
  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onStamina = (s: StaminaPayload) => setStamina(s);
    const onState = (s: StatePayload) => setPlayerState(s);
    EventBus.on(EV.PHASE_CHANGED, onPhase);
    EventBus.on(EV.STAMINA_UPDATED, onStamina);
    EventBus.on(EV.STATE_UPDATED, onState);
    return () => {
      EventBus.removeListener(EV.PHASE_CHANGED, onPhase);
      EventBus.removeListener(EV.STAMINA_UPDATED, onStamina);
      EventBus.removeListener(EV.STATE_UPDATED, onState);
    };
  }, []);

  // ---- Touch device detection ----
  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
  }, []);

  // ---- Commands ----
  const send = useCallback((event: string, payload?: unknown) => {
    EventBus.emit(event, payload);
  }, []);

  const startGame = useCallback(() => send(EV.START_GAME), [send]);
  const restartGame = useCallback(() => send(EV.RESTART_GAME), [send]);
  const togglePause = useCallback(() => send(EV.TOGGLE_PAUSE), [send]);
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      send(EV.AUDIO_TOGGLED, { muted: next });
      return next;
    });
  }, [send]);

  const touchDown = useCallback(
    (action: string) => send(EV.TOUCH_INPUT, { action, down: true }),
    [send],
  );
  const touchUp = useCallback(
    (action: string) => send(EV.TOUCH_INPUT, { action, down: false }),
    [send],
  );

  const staminaPct = Math.round((stamina.stamina / stamina.maxStamina) * 100);
  const barColor = stamina.isExhausted
    ? '#ef476f'
    : staminaPct < 35
      ? '#ffd166'
      : '#06d6a0';

  return (
    <div id="app">
      <div id="game-container" />

      {/* ============ HUD ============ */}
      {phase !== 'MENU' && !bootError && (
        <div className="hud">
          <div className="hud-top">
            <div className="hud-badge" style={{ borderColor: STATE_COLORS[playerState.state] }}>
              <span className="hud-badge-dot" style={{ background: STATE_COLORS[playerState.state] }} />
              {playerState.state}
            </div>
            <div className="hud-speed">
              <span className="hud-speed-num">{playerState.speed}</span>
              <span className="hud-speed-unit">px/s</span>
            </div>
            <button className="hud-iconbtn" onClick={toggleMute} aria-label="Toggle audio">
              {muted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M19 5a9 9 0 0 1 0 14" />
                </svg>
              )}
            </button>
            <button className="hud-iconbtn" onClick={togglePause} aria-label="Pause">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          </div>

          {/* Stamina bar */}
          <div className={`stamina-wrap ${stamina.isExhausted ? 'exhausted' : ''}`}>
            <div className="stamina-label">
              STAMINA {stamina.stamina}
              {stamina.isExhausted && <span className="stamina-exhausted-tag">EXHAUSTED — speed throttled</span>}
            </div>
            <div className="stamina-track">
              <div
                className="stamina-fill"
                style={{ width: `${staminaPct}%`, background: barColor }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ============ MENU OVERLAY ============ */}
      {phase === 'MENU' && !bootError && (
        <div className="overlay">
          <div className="panel">
            <h1 className="title">
              MOSI<span className="title-accent">'S</span> JOURNEY
            </h1>
            <p className="subtitle">Fluid Movement Sandbox — walk, run, jump, crouch &amp; slide</p>
            <div className="keys-grid">
              <div className="key-row"><kbd>A</kbd><kbd>D</kbd> / <kbd>◀</kbd><kbd>▶</kbd><span>Move</span></div>
              <div className="key-row"><kbd>Shift</kbd><span>Run (drains stamina)</span></div>
              <div className="key-row"><kbd>Space</kbd> / <kbd>W</kbd><span>Jump</span></div>
              <div className="key-row"><kbd>S</kbd> / <kbd>▼</kbd><span>Crouch — hold while running to Slide</span></div>
              <div className="key-row"><kbd>Esc</kbd><span>Pause</span></div>
            </div>
            <button className="btn btn-primary" onClick={startGame}>
              START JOURNEY
            </button>
            <p className="hint">Stamina refills while walking, standing &amp; crouched. At zero, running slows to a walk.</p>
          </div>
        </div>
      )}

      {/* ============ PAUSE OVERLAY ============ */}
      {phase === 'PAUSED' && !bootError && (
        <div className="overlay">
          <div className="panel">
            <h2 className="pause-title">PAUSED</h2>
            <div className="pause-btns">
              <button className="btn btn-primary" onClick={togglePause}>RESUME</button>
              <button className="btn btn-secondary" onClick={restartGame}>RESTART</button>
              <button className="btn btn-secondary" onClick={toggleMute}>
                {muted ? 'AUDIO: OFF' : 'AUDIO: ON'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ TOUCH CONTROLS ============ */}
      {isTouch && phase === 'PLAYING' && !bootError && (
        <div className="touch-layer">
          <div className="touch-dpad">
            <button
              className="touch-btn"
              onPointerDown={() => touchDown('left')}
              onPointerUp={() => touchUp('left')}
              onPointerLeave={() => touchUp('left')}
              aria-label="Move left"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button
              className="touch-btn"
              onPointerDown={() => touchDown('right')}
              onPointerUp={() => touchUp('right')}
              onPointerLeave={() => touchUp('right')}
              aria-label="Move right"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          <div className="touch-actions">
            <button
              className="touch-btn touch-btn-crouch"
              onPointerDown={() => touchDown('crouch')}
              onPointerUp={() => touchUp('crouch')}
              onPointerLeave={() => touchUp('crouch')}
              aria-label="Crouch / Slide"
            >
              C
            </button>
            <button
              className="touch-btn touch-btn-run"
              onPointerDown={() => touchDown('run')}
              onPointerUp={() => touchUp('run')}
              onPointerLeave={() => touchUp('run')}
              aria-label="Sprint"
            >
              B
            </button>
            <button
              className="touch-btn touch-btn-jump"
              onPointerDown={() => touchDown('jump')}
              onPointerUp={() => touchUp('jump')}
              onPointerLeave={() => touchUp('jump')}
              aria-label="Jump"
            >
              A
            </button>
          </div>
        </div>
      )}

      {/* ============ BOOT ERROR ============ */}
      {bootError && (
        <div className="overlay">
          <div className="panel">
            <h2 className="pause-title">FAILED TO START</h2>
            <p className="hint">The game engine did not boot. Reload the page to try again.</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              RELOAD
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
