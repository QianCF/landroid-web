export const PIf = Math.PI;
export const PI2f = Math.PI * 2;

/** @typedef {{ x: number, y: number }} Vec2 */

/** @param {number} x @param {number} y @returns {Vec2} */
export function vec2(x, y) {
  return { x, y };
}

export const Vec2Zero = vec2(0, 0);

/** @param {Vec2} v @returns {number} */
export function mag(v) {
  return Math.hypot(v.x, v.y);
}

/** @param {Vec2} a @param {Vec2} b @returns {number} */
export function distance(a, b) {
  return mag({ x: a.x - b.x, y: a.y - b.y });
}

/** @param {Vec2} v @returns {number} */
export function angle(v) {
  return Math.atan2(v.y, v.x);
}

/** @param {Vec2} a @param {Vec2} b @returns {number} */
export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

/** @param {number} a @param {number} m @returns {Vec2} */
export function makeWithAngleMag(a, m) {
  return vec2(m * Math.cos(a), m * Math.sin(a));
}

/** @param {Vec2} a @param {Vec2} b @returns {Vec2} */
export function add(a, b) {
  return vec2(a.x + b.x, a.y + b.y);
}

/** @param {Vec2} a @param {Vec2} b @returns {Vec2} */
export function sub(a, b) {
  return vec2(a.x - b.x, a.y - b.y);
}

/** @param {Vec2} v @param {number} s @returns {Vec2} */
export function scale(v, s) {
  return vec2(v.x * s, v.y * s);
}

/** @param {Vec2} v @param {string} [fmt] @returns {string} */
export function vecStr(v, fmt = "%+.2f") {
  const fx = fmt.replace("%", "").replace("f", "");
  const fy = fmt.replace("%", "").replace("f", "");
  return `<${v.x.toFixed(2)},${v.y.toFixed(2)}>`;
}

/** @param {number} start @param {number} end @param {number} t @returns {number} */
export function lerp(start, end, t) {
  return start + (end - start) * t;
}

/** @param {number} start @param {number} end @param {number} progress @returns {number} */
export function lexp(start, end, progress) {
  return (progress - start) / (end - start);
}

/** @param {number} current @param {number} target @param {number} [dt] @param {number} [speed] */
export function expSmooth(current, target, dt = 1 / 60, speed = 5) {
  return current + (target - current) * (1 - Math.exp(-dt * speed));
}

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** @param {string} s @returns {string} */
export function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const COLORS = {
  eigengrau: "#16161d",
  eigengrau2: "#292936",
  eigengrau3: "#3c3c4f",
  eigengrau4: "#a7a7ca",
  console: "#b7b7ff",
  autopilot: "#4285f4",
  track: "#34a853",
  flag: "#c6ff00",
};

/** @type {Record<string, string>} */
export const STAR_COLORS = {
  O: "#6666ff",
  B: "#ccccff",
  A: "#eeeeff",
  F: "#ffffff",
  G: "#ffff66",
  K: "#ffcc33",
  M: "#ff8800",
};

export const STAR_CLASSES = ["O", "B", "A", "F", "G", "K", "M"];

/** @param {number} seed */
export function createRng(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 1;

  return {
    /** @returns {number} [0, 1) */
    nextFloat() {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** @param {number} min @param {number} max [min, max) */
    nextInt(min, max) {
      return Math.floor(this.nextFloat() * (max - min)) + min;
    },
    /** @param {number} from @param {number} until [from, until) */
    nextFloatInRange(from, until) {
      return from + (until - from) * this.nextFloat();
    },
    /** @template T @param {T[]} arr */
    choose(arr) {
      return arr[this.nextInt(0, arr.length)];
    },
  };
}

/** @template T @param {T[]} arr @param {ReturnType<typeof createRng>} rng */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** @template T */
export class Bag {
  /** @param {T[]} items */
  constructor(items) {
    this.original = [...items];
    /** @type {T[]} */
    this.remaining = [];
    this.next = items.length;
  }

  /** @param {ReturnType<typeof createRng>} rng @returns {T} */
  pull(rng) {
    if (this.next >= this.remaining.length) {
      this.remaining = [...this.original];
      shuffle(this.remaining, rng);
      this.next = 0;
    }
    return this.remaining[this.next++];
  }
}

/** @template T */
export class RandomTable {
  /** @param {...[number, T]} pairs */
  constructor(...pairs) {
    /** @type {[number, T][]} */
    this.pairs = pairs;
    this.total = pairs.reduce((s, [w]) => s + w, 0);
  }

  /** @param {ReturnType<typeof createRng>} rng @returns {T} */
  roll(rng) {
    let x = rng.nextFloatInRange(0, this.total);
    for (const [weight, result] of this.pairs) {
      x -= weight;
      if (x < 0) return result;
    }
    return this.pairs[this.pairs.length - 1][1];
  }
}

/** @param {number} radius @param {number} sides @returns {Path2D} */
export function createPolygonPath(radius, sides) {
  const path = new Path2D();
  path.moveTo(radius, 0);
  const step = PI2f / sides;
  for (let i = 1; i < sides; i++) {
    path.lineTo(radius * Math.cos(step * i), radius * Math.sin(step * i));
  }
  path.closePath();
  return path;
}

/** @param {number} r1 @param {number} r2 @param {number} points @returns {Path2D} */
export function createStarPath(r1, r2, points) {
  const path = new Path2D();
  const step = PI2f / points;
  path.moveTo(r1, 0);
  path.lineTo(r2 * Math.cos(step * 0.5), r2 * Math.sin(step * 0.5));
  for (let i = 1; i < points; i++) {
    path.lineTo(r1 * Math.cos(step * i), r1 * Math.sin(step * i));
    path.lineTo(r2 * Math.cos(step * (i + 0.5)), r2 * Math.sin(step * (i + 0.5)));
  }
  path.closePath();
  return path;
}

/** @param {string} d @returns {Path2D} */
export function parseSvgPath(d) {
  const path = new Path2D();
  const re = /([A-Za-z])\s*([-.,0-9e ]+)/g;
  let m;
  while ((m = re.exec(d.trim())) !== null) {
    const cmd = m[1];
    const args = m[2].trim().split(/\s+/).map(Number);
    switch (cmd) {
      case "M":
        path.moveTo(args[0], args[1]);
        break;
      case "C":
        path.bezierCurveTo(args[0], args[1], args[2], args[3], args[4], args[5]);
        break;
      case "L":
        path.lineTo(args[0], args[1]);
        break;
      case "l":
        // relative line — not used in ship paths after first absolute move
        break;
      case "Z":
        path.closePath();
        break;
      default:
        break;
    }
  }
  return path;
}

/** Parse relative SVG path segments (for legs) */
export function parseRelativeSvgPath(d) {
  const path = new Path2D();
  let cx = 0;
  let cy = 0;
  const re = /([A-Za-z])\s*([-.,0-9e ]+)/g;
  let m;
  while ((m = re.exec(d.trim())) !== null) {
    const cmd = m[1];
    const args = m[2].trim().split(/\s+/).map(Number);
    switch (cmd) {
      case "M":
        cx = args[0];
        cy = args[1];
        path.moveTo(cx, cy);
        break;
      case "l":
        cx += args[0];
        cy += args[1];
        path.lineTo(cx, cy);
        break;
      case "Z":
        path.closePath();
        break;
      default:
        break;
    }
  }
  return path;
}

export const SPACESHIP_PATH = parseSvgPath(`
M11.853 0
C11.853 -4.418 8.374 -8 4.083 -8
L-5.5 -8
C-6.328 -8 -7 -7.328 -7 -6.5
C-7 -5.672 -6.328 -5 -5.5 -5
L-2.917 -5
C-1.26 -5 0.083 -3.657 0.083 -2
L0.083 2
C0.083 3.657 -1.26 5 -2.917 5
L-5.5 5
C-6.328 5 -7 5.672 -7 6.5
C-7 7.328 -6.328 8 -5.5 8
L4.083 8
C8.374 8 11.853 4.418 11.853 0
Z
`);

export const SPACESHIP_LEGS = parseRelativeSvgPath(`
M-7   -6.5
l-3.5  0
l-1   -2
l 0    4
l 1   -2
Z
M-7    6.5
l-3.5  0
l-1   -2
l 0    4
l 1   -2
Z
`);

export const THRUST_PATH = (() => {
  const p = createPolygonPath(3, 3);
  // translate -5, 0 — applied at draw time
  return p;
})();

export const DESSERT_CODE = "BKL";

export function dailySeed() {
  const today = new Date();
  return today.getFullYear() * 10000 + today.getMonth() * 100 + today.getDate();
}

export const FIXED_RANDOM_SEED = 5038;
export const RANDOM_SEED = dailySeed();

/** @param {number} seed */
export function getSystemDesignation(seed) {
  return `${DESSERT_CODE}-${seed % 100000}`;
}
