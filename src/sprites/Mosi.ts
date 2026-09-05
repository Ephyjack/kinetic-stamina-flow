// Mosi's Journey — Procedural Knight Sprite Factory
// Generates 7 animation sheets (128×128 frames) via Canvas 2D.
// Flat vector knight with armor, plume, cape, and side-profile pose.

const FRAME = 128;

interface Pose {
  hipY: number;       // hip pivot Y (frame space, feet at 124)
  lean: number;       // torso lean (rad, positive = forward/right)
  thighF: number;     // front thigh angle (rad from vertical-down)
  shinF: number;      // front shin angle relative to thigh
  thighB: number;
  shinB: number;
  armF: number;       // front arm swing
  armB: number;
  headTilt: number;
  capeSway: number;
  crouch: number;     // 0..1 torso compression
}

const COLORS = {
  armorDark: '#1c2541',
  armorMid: '#3a506b',
  armorLight: '#5c7a99',
  crystal: '#48cae4',
  plume: '#ef476f',
  cape: '#0d1b2a',
  capeEdge: '#48cae4',
  visor: '#0b132b',
  visorGlow: '#48cae4',
  skin: '#e0a870',
  boot: '#2b2d42',
};

function drawLimb(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, angle: number, len: number, w: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, 0, w, len);
  ctx.restore();
}

function drawKnight(ctx: CanvasRenderingContext2D, pose: Pose, facing: 1 | -1) {
  const cx = FRAME / 2;
  const footY = 124;
  const crouchScale = 1 - pose.crouch * 0.45;

  // Torso height (shoulder above hip)
  const torsoH = 34 * crouchScale;
  const hipX = cx;
  const hipY = pose.hipY;
  const shoulderX = hipX + Math.sin(pose.lean) * torsoH;
  const shoulderY = hipY - Math.cos(pose.lean) * torsoH;
  const headR = 11;
  const headX = shoulderX + Math.sin(pose.lean + pose.headTilt) * (headR + 4);
  const headY = shoulderY - Math.cos(pose.lean + pose.headTilt) * (headR + 4);

  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(facing, 1);
  ctx.translate(-cx, 0);

  // === CAPE (behind everything) ===
  ctx.fillStyle = COLORS.cape;
  ctx.beginPath();
  ctx.moveTo(shoulderX - 8, shoulderY);
  ctx.quadraticCurveTo(
    shoulderX - 14 + pose.capeSway,
    shoulderY + 20,
    hipX - 10 + pose.capeSway * 1.5,
    hipY + 18,
  );
  ctx.lineTo(hipX - 2, hipY + 14);
  ctx.lineTo(shoulderX + 2, shoulderY + 2);
  ctx.closePath();
  ctx.fill();
  // Cape edge highlight
  ctx.strokeStyle = COLORS.capeEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(shoulderX - 8, shoulderY);
  ctx.quadraticCurveTo(
    shoulderX - 14 + pose.capeSway,
    shoulderY + 20,
    hipX - 10 + pose.capeSway * 1.5,
    hipY + 18,
  );
  ctx.stroke();

  // === BACK LEG ===
  const thighLen = 18 * crouchScale;
  const shinLen = 18;
  const bootLen = 8;
  const bThighA = pose.thighB;
  const bKneeX = hipX + Math.sin(bThighA) * thighLen;
  const bKneeY = hipY + Math.cos(bThighA) * thighLen;
  const bShinA = bThighA + pose.shinB;
  const bFootX = bKneeX + Math.sin(bShinA) * shinLen;
  const bFootY = bKneeY + Math.cos(bShinA) * shinLen;
  drawLimb(ctx, hipX, hipY, bThighA, thighLen, 10, COLORS.armorDark);
  drawLimb(ctx, bKneeX, bKneeY, bShinA, shinLen, 9, COLORS.armorDark);
  // Boot
  ctx.fillStyle = COLORS.boot;
  ctx.fillRect(bFootX - 5, bFootY - 2, bootLen + 4, 6);

  // === BACK ARM ===
  const uArm = 14 * crouchScale;
  const fArm = 12;
  const bArmA = pose.armB;
  const bElbowX = shoulderX + Math.sin(bArmA) * uArm;
  const bElbowY = shoulderY + Math.cos(bArmA) * uArm;
  const bHandA = bArmA + 0.3;
  const bHandX = bElbowX + Math.sin(bHandA) * fArm;
  const bHandY = bElbowY + Math.cos(bHandA) * fArm;
  drawLimb(ctx, shoulderX, shoulderY, bArmA, uArm, 8, COLORS.armorDark);
  drawLimb(ctx, bElbowX, bElbowY, bHandA, fArm, 7, COLORS.armorDark);
  // Gauntlet
  ctx.fillStyle = COLORS.armorMid;
  ctx.beginPath();
  ctx.arc(bHandX, bHandY, 4, 0, Math.PI * 2);
  ctx.fill();

  // === TORSO (armor plate) ===
  ctx.save();
  ctx.translate(hipX, hipY);
  ctx.rotate(pose.lean);
  const grad = ctx.createLinearGradient(0, 0, 0, -torsoH);
  grad.addColorStop(0, COLORS.armorMid);
  grad.addColorStop(1, COLORS.armorLight);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(-12, -torsoH * 0.5);
  ctx.lineTo(-9, -torsoH);
  ctx.lineTo(9, -torsoH);
  ctx.lineTo(12, -torsoH * 0.5);
  ctx.lineTo(10, 0);
  ctx.closePath();
  ctx.fill();
  // Chest crystal accent
  ctx.fillStyle = COLORS.crystal;
  ctx.beginPath();
  ctx.arc(0, -torsoH * 0.6, 3, 0, Math.PI * 2);
  ctx.fill();
  // Belt
  ctx.fillStyle = COLORS.armorDark;
  ctx.fillRect(-11, -4, 22, 5);
  ctx.restore();

  // === FRONT LEG ===
  const fThighA = pose.thighF;
  const fKneeX = hipX + Math.sin(fThighA) * thighLen;
  const fKneeY = hipY + Math.cos(fThighA) * thighLen;
  const fShinA = fThighA + pose.shinF;
  const fFootX = fKneeX + Math.sin(fShinA) * shinLen;
  const fFootY = fKneeY + Math.cos(fShinA) * shinLen;
  drawLimb(ctx, hipX, hipY, fThighA, thighLen, 11, COLORS.armorMid);
  drawLimb(ctx, fKneeX, fKneeY, fShinA, shinLen, 10, COLORS.armorMid);
  // Knee guard
  ctx.fillStyle = COLORS.crystal;
  ctx.beginPath();
  ctx.arc(fKneeX, fKneeY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Boot
  ctx.fillStyle = COLORS.boot;
  ctx.fillRect(fFootX - 5, fFootY - 2, bootLen + 4, 6);

  // === FRONT ARM ===
  const fArmA = pose.armF;
  const fElbowX = shoulderX + Math.sin(fArmA) * uArm;
  const fElbowY = shoulderY + Math.cos(fArmA) * uArm;
  const fHandA = fArmA + 0.3;
  const fHandX = fElbowX + Math.sin(fHandA) * fArm;
  const fHandY = fElbowY + Math.cos(fHandA) * fArm;
  drawLimb(ctx, shoulderX, shoulderY, fArmA, uArm, 9, COLORS.armorLight);
  drawLimb(ctx, fElbowX, fElbowY, fHandA, fArm, 8, COLORS.armorLight);
  ctx.fillStyle = COLORS.armorMid;
  ctx.beginPath();
  ctx.arc(fHandX, fHandY, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // === HEAD + HELMET ===
  // Neck
  ctx.strokeStyle = COLORS.armorDark;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(headX, headY + headR * 0.5);
  ctx.stroke();
  // Helmet dome
  ctx.fillStyle = COLORS.armorLight;
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  // Visor slit (side profile — one eye)
  ctx.fillStyle = COLORS.visor;
  ctx.beginPath();
  ctx.ellipse(headX + 4, headY + 1, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Visor glow
  ctx.fillStyle = COLORS.visorGlow;
  ctx.beginPath();
  ctx.arc(headX + 5, headY + 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Plume
  ctx.fillStyle = COLORS.plume;
  ctx.beginPath();
  ctx.moveTo(headX - 2, headY - headR);
  ctx.quadraticCurveTo(
    headX - 10,
    headY - headR - 14,
    headX - 16,
    headY - headR + 2,
  );
  ctx.quadraticCurveTo(headX - 8, headY - headR + 4, headX - 2, headY - headR);
  ctx.fill();

  ctx.restore();
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME;
  canvas.height = FRAME;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function generateSheet(poses: Pose[], frameCount: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME * frameCount;
  canvas.height = FRAME;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < frameCount; i++) {
    ctx.save();
    ctx.translate(i * FRAME, 0);
    drawKnight(ctx, poses[i % poses.length], 1);
    ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

// ---- POSE LIBRARY ----
const IDLE_POSES: Pose[] = [
  { hipY: 90, lean: 0, thighF: 0.1, shinF: -0.1, thighB: -0.1, shinB: 0.1, armF: 0.2, armB: -0.2, headTilt: 0, capeSway: 0, crouch: 0 },
  { hipY: 89, lean: 0.02, thighF: 0.12, shinF: -0.12, thighB: -0.12, shinB: 0.12, armF: 0.22, armB: -0.22, headTilt: 0.02, capeSway: 1, crouch: 0 },
  { hipY: 88, lean: 0.04, thighF: 0.14, shinF: -0.14, thighB: -0.14, shinB: 0.14, armF: 0.24, armB: -0.24, headTilt: 0.04, capeSway: 2, crouch: 0 },
  { hipY: 89, lean: 0.02, thighF: 0.12, shinF: -0.12, thighB: -0.12, shinB: 0.12, armF: 0.22, armB: -0.22, headTilt: 0.02, capeSway: 1, crouch: 0 },
];

const WALK_POSES: Pose[] = [
  { hipY: 90, lean: 0.05, thighF: 0.5, shinF: -0.3, thighB: -0.5, shinB: 0.3, armF: -0.4, armB: 0.4, headTilt: 0, capeSway: 2, crouch: 0 },
  { hipY: 88, lean: 0.08, thighF: 0.2, shinF: -0.1, thighB: -0.2, shinB: 0.1, armF: -0.2, armB: 0.2, headTilt: 0.02, capeSway: 3, crouch: 0 },
  { hipY: 90, lean: 0.05, thighF: -0.5, shinF: 0.3, thighB: 0.5, shinB: -0.3, armF: 0.4, armB: -0.4, headTilt: 0, capeSway: 2, crouch: 0 },
  { hipY: 88, lean: 0.08, thighF: -0.2, shinF: 0.1, thighB: 0.2, shinB: -0.1, armF: 0.2, armB: -0.2, headTilt: 0.02, capeSway: 3, crouch: 0 },
];

const RUN_POSES: Pose[] = [
  { hipY: 86, lean: 0.25, thighF: 0.8, shinF: -0.5, thighB: -0.8, shinB: 0.5, armF: -0.7, armB: 0.7, headTilt: 0.1, capeSway: 6, crouch: 0 },
  { hipY: 82, lean: 0.3, thighF: 0.3, shinF: -0.2, thighB: -0.3, shinB: 0.2, armF: -0.3, armB: 0.3, headTilt: 0.15, capeSway: 8, crouch: 0 },
  { hipY: 86, lean: 0.25, thighF: -0.8, shinF: 0.5, thighB: 0.8, shinB: -0.5, armF: 0.7, armB: -0.7, headTilt: 0.1, capeSway: 6, crouch: 0 },
  { hipY: 82, lean: 0.3, thighF: -0.3, shinF: 0.2, thighB: 0.3, shinB: -0.2, armF: 0.3, armB: -0.3, headTilt: 0.15, capeSway: 8, crouch: 0 },
];

const JUMP_POSES: Pose[] = [
  { hipY: 92, lean: 0.1, thighF: 0.3, shinF: -0.6, thighB: -0.3, shinB: 0.6, armF: -0.5, armB: 0.5, headTilt: 0.05, capeSway: 4, crouch: 0.1 },
  { hipY: 88, lean: 0.05, thighF: 0.6, shinF: -0.8, thighB: -0.4, shinB: 0.6, armF: -1.0, armB: 1.0, headTilt: 0, capeSway: 8, crouch: 0 },
  { hipY: 86, lean: 0, thighF: 0.8, shinF: -1.0, thighB: -0.6, shinB: 0.8, armF: -1.2, armB: 1.2, headTilt: -0.05, capeSway: 10, crouch: 0 },
  { hipY: 88, lean: 0.05, thighF: 0.4, shinF: -0.5, thighB: -0.2, shinB: 0.4, armF: -0.8, armB: 0.8, headTilt: 0, capeSway: 6, crouch: 0 },
];

const CROUCH_IDLE_POSES: Pose[] = [
  { hipY: 108, lean: 0.15, thighF: 0.9, shinF: -1.2, thighB: -0.9, shinB: 1.2, armF: 0.3, armB: -0.3, headTilt: 0.1, capeSway: 1, crouch: 0.7 },
  { hipY: 107, lean: 0.17, thighF: 0.92, shinF: -1.22, thighB: -0.92, shinB: 1.22, armF: 0.32, armB: -0.32, headTilt: 0.12, capeSway: 2, crouch: 0.72 },
  { hipY: 108, lean: 0.15, thighF: 0.9, shinF: -1.2, thighB: -0.9, shinB: 1.2, armF: 0.3, armB: -0.3, headTilt: 0.1, capeSway: 1, crouch: 0.7 },
];

const CROUCH_MOVE_POSES: Pose[] = [
  { hipY: 108, lean: 0.2, thighF: 0.7, shinF: -0.9, thighB: -0.7, shinB: 0.9, armF: -0.3, armB: 0.3, headTilt: 0.15, capeSway: 3, crouch: 0.7 },
  { hipY: 106, lean: 0.22, thighF: 0.3, shinF: -0.4, thighB: -0.3, shinB: 0.4, armF: -0.1, armB: 0.1, headTilt: 0.18, capeSway: 4, crouch: 0.72 },
  { hipY: 108, lean: 0.2, thighF: -0.7, shinF: 0.9, thighB: 0.7, shinB: -0.9, armF: 0.3, armB: -0.3, headTilt: 0.15, capeSway: 3, crouch: 0.7 },
  { hipY: 106, lean: 0.22, thighF: -0.3, shinF: 0.4, thighB: 0.3, shinB: -0.4, armF: 0.1, armB: -0.1, headTilt: 0.18, capeSway: 4, crouch: 0.72 },
];

const SLIDE_POSES: Pose[] = [
  { hipY: 112, lean: 0.6, thighF: 1.2, shinF: -0.8, thighB: -1.0, shinB: 1.4, armF: -0.8, armB: 0.6, headTilt: -0.2, capeSway: 10, crouch: 0.85 },
  { hipY: 114, lean: 0.7, thighF: 1.4, shinF: -1.0, thighB: -1.2, shinB: 1.6, armF: -1.0, armB: 0.8, headTilt: -0.25, capeSway: 12, crouch: 0.9 },
  { hipY: 116, lean: 0.75, thighF: 1.5, shinF: -1.1, thighB: -1.3, shinB: 1.7, armF: -1.1, armB: 0.9, headTilt: -0.3, capeSway: 14, crouch: 0.95 },
  { hipY: 114, lean: 0.7, thighF: 1.4, shinF: -1.0, thighB: -1.2, shinB: 1.6, armF: -1.0, armB: 0.8, headTilt: -0.25, capeSway: 12, crouch: 0.9 },
];

export function generateMosiSheets(): Record<string, string> {
  return {
    mosi_idle: generateSheet(IDLE_POSES, 8),
    mosi_walk: generateSheet(WALK_POSES, 8),
    mosi_run: generateSheet(RUN_POSES, 8),
    mosi_jump: generateSheet(JUMP_POSES, 6),
    mosi_crouch_idle: generateSheet(CROUCH_IDLE_POSES, 6),
    mosi_crouch_move: generateSheet(CROUCH_MOVE_POSES, 8),
    mosi_slide: generateSheet(SLIDE_POSES, 6),
  };
}
