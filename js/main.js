import { Autopilot } from "./autopilot.js";
import { Namer } from "./namer.js";
import { Spacecraft } from "./physics.js";
import { drawFlightStick, renderFrame } from "./render.js";
import { Universe } from "./universe.js";
import {
  RANDOM_SEED, capitalize, getSystemDesignation, lexp, mag, sub, vec2, Vec2Zero,
} from "./utils.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const ctx = canvas.getContext("2d");
const catalogEl = /** @type {HTMLElement} */ (document.getElementById("catalog"));
const telemetryEl = /** @type {HTMLElement} */ (document.getElementById("telemetry"));
const autopilotLineEl = /** @type {HTMLElement} */ (document.getElementById("autopilot-line"));
const autoBtn = /** @type {HTMLButtonElement} */ (document.getElementById("auto-btn"));

const namer = new Namer();
const universe = new Universe(namer, RANDOM_SEED);
universe.initRandom();

const autopilot = new Autopilot(universe.ship, universe);
universe.ship.autopilot = autopilot;
universe.add(autopilot);
autopilot.enabled = false;

let dynamicZoom = false;
let cameraZoom = 1;
/** @type {{ x: number, y: number }} */
let cameraOffset = { x: 0, y: 0 };

universe._touchPan = false;
universe._touchZoom = false;
universe._smoothedZoom = 1;

/** @type {{ x: number, y: number }} */
let stickOrigin = { x: 0, y: 0 };
/** @type {{ x: number, y: number }} */
let stickTarget = { x: 0, y: 0 };
let stickActive = false;

const MIN_STICK_RADIUS = 50;
const MAX_STICK_RADIUS = 100;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function applyStick(vec) {
  const ship = /** @type {Spacecraft} */ (universe.follow);
  if (!ship) return;

  if (vec.x === 0 && vec.y === 0) {
    ship.thrust = Vec2Zero;
    return;
  }

  const a = Math.atan2(vec.y, vec.x);
  ship.angle = a;

  const m = Math.hypot(vec.x, vec.y);
  if (m < MIN_STICK_RADIUS) {
    ship.thrust = Vec2Zero;
  } else {
    const thrust = lexp(MIN_STICK_RADIUS, MAX_STICK_RADIUS, m);
    ship.thrust = {
      x: Math.cos(a) * Math.min(1, Math.max(0, thrust)),
      y: Math.sin(a) * Math.min(1, Math.max(0, thrust)),
    };
  }
}

function pointerDown(x, y) {
  stickOrigin = { x, y };
  stickTarget = { x, y };
  stickActive = true;
  applyStick(vec2(0, 0));
}

function pointerMove(x, y) {
  if (!stickActive) return;
  stickTarget = { x, y };
  applyStick({ x: x - stickOrigin.x, y: y - stickOrigin.y });
}

function pointerUp() {
  stickActive = false;
  stickOrigin = { x: 0, y: 0 };
  stickTarget = { x: 0, y: 0 };
  applyStick(Vec2Zero);
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointerDown(e.clientX, e.clientY);
});

canvas.addEventListener("pointermove", (e) => {
  pointerMove(e.clientX, e.clientY);
});

canvas.addEventListener("pointerup", () => pointerUp());
canvas.addEventListener("pointercancel", () => pointerUp());

autoBtn.addEventListener("click", () => {
  autopilot.enabled = !autopilot.enabled;
  dynamicZoom = autopilot.enabled;
  autoBtn.classList.toggle("active", autopilot.enabled);
  if (!autopilot.enabled) universe.ship.thrust = Vec2Zero;
});

setTimeout(() => {
  catalogEl.classList.add("visible");
  telemetryEl.classList.add("visible");
  autopilotLineEl.classList.add("visible");
  autoBtn.classList.add("visible");
}, 1000);

function updateHud() {
  const explored = universe.planets.filter((p) => p.explored);
  const ship = universe.ship;
  const closest = universe.closestPlanet();
  const distToClosest = Math.floor(mag(sub(closest.pos, ship.pos)) - closest.radius);

  if (autopilot.enabled) {
    autopilotLineEl.textContent = autopilot.telemetry;
    autopilotLineEl.style.display = "block";
  } else {
    autopilotLineEl.textContent = "";
    autopilotLineEl.style.display = "none";
  }

  const lines = [];
  if (ship.landing) {
    lines.push(`LND: ${ship.landing.planet.name.toUpperCase()}`);
    lines.push(`JOB: ${ship.landing.text.toUpperCase()}`);
  } else if (distToClosest < 10000) {
    lines.push(`ALT: ${distToClosest}`);
  }
  lines.push(`THR: ${(mag(ship.thrust) * 100).toFixed(0)}%`);
  lines.push(`POS: <${ship.pos.x >= 0 ? "+" : ""}${ship.pos.x.toFixed(0).padStart(7)},${ship.pos.y >= 0 ? "+" : ""}${ship.pos.y.toFixed(0).padStart(7)}>`);
  lines.push(`VEL: ${mag(ship.velocity).toFixed(0)}`);
  telemetryEl.textContent = lines.join("\n");

  const catalogLines = [
    `  STAR: ${universe.star.name} (${getSystemDesignation(universe.randomSeed)})`,
    ` CLASS: ${universe.star.cls}`,
    `RADIUS: ${Math.floor(universe.star.radius)}`,
    `  MASS: ${universe.star.mass.toPrecision(3)}`,
    `BODIES: ${explored.length} / ${universe.planets.length}`,
    "",
  ];

  for (const p of explored) {
    catalogLines.push(
      `  BODY: ${p.name}`,
      `  TYPE: ${capitalize(p.description)}`,
      `  ATMO: ${capitalize(p.atmosphere)}`,
      ` FAUNA: ${capitalize(p.fauna)}`,
      ` FLORA: ${capitalize(p.flora)}`,
      "",
    );
  }
  catalogEl.textContent = catalogLines.join("\n");
}

function frame(now) {
  universe.step(now * 1e6);

  const w = window.innerWidth;
  const h = window.innerHeight;

  const result = renderFrame(ctx, universe, w, h, cameraZoom, cameraOffset, dynamicZoom);
  cameraZoom = result.zoom;
  cameraOffset = result.cameraOffset;

  if (stickActive) {
    drawFlightStick(ctx, stickOrigin, stickTarget, MIN_STICK_RADIUS, MAX_STICK_RADIUS);
  }

  updateHud();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(frame);
