import {
  PIf, PI2f, Vec2Zero, add, angle, createRng, lerp, mag, makeWithAngleMag, scale, sub, vec2,
} from "./utils.js";

export const TIME_SCALE = 1;
export const MAX_VALID_DT = 1;

export const UNIVERSE_RANGE = 200000;
export const NUM_PLANETS_RANGE = [1, 10];
export const STAR_RADIUS_RANGE = [1000, 8000];
export const PLANET_RADIUS_RANGE = [50, 2000];
export const PLANET_ORBIT_RANGE = [STAR_RADIUS_RANGE[1] * 2, UNIVERSE_RANGE * 0.75];

export const GRAVITATION = 1e-2;
export const KEPLER_CONSTANT = 50;
export const PLANETARY_DENSITY = 2.5;
export const STELLAR_DENSITY = 0.5;
export const SPACECRAFT_MASS = 10;
export const CRAFT_SPEED_LIMIT = 5000;
export const MAIN_ENGINE_ACCEL = 1000;
export const LAUNCH_MECO = 2;
export const LANDING_REMOVAL_TIME = 60 * 15;
export const SCALED_THRUST = true;
export const TRACK_LENGTH = 10000;
export const MAX_SPARKS = 120;

export class Fuse {
  /** @param {number} lifetime */
  constructor(lifetime) {
    this.lifetime = lifetime;
  }
  /** @param {number} dt */
  update(dt) {
    this.lifetime -= dt;
  }
  canBeRemoved() {
    return this.lifetime < 0;
  }
}

export class Body {
  constructor(name = "Unknown") {
    this.name = name;
    /** @type {import('./utils.js').Vec2} */
    this.pos = vec2(0, 0);
    /** @type {import('./utils.js').Vec2} */
    this.opos = vec2(0, 0);
    /** @type {import('./utils.js').Vec2} */
    this.velocity = vec2(0, 0);
    this.mass = 0;
    this.angle = 0;
    this.oangle = 0;
    this.radius = 0;
    this.collides = true;
  }

  /** @param {Simulator} sim @param {number} dt */
  update(sim, dt) {
    if (dt <= 0) return;
    this.opos = { ...this.pos };
    this.pos = add(this.pos, scale(this.velocity, dt));
  }

  /** @param {Simulator} sim @param {number} dt */
  postUpdate(sim, dt) {
    if (dt <= 0) return;
    this.velocity = scale(sub(this.pos, this.opos), 1 / dt);
  }
}

export class Container {
  /** @param {number} radius */
  constructor(radius) {
    this.radius = radius;
    /** @type {Body[]} */
    this.list = [];
    this.softness = 0;
  }

  /** @param {Body} p */
  add(p) {
    this.list.push(p);
  }

  /** @param {Simulator} sim @param {number} dt */
  solve(sim, dt) {
    for (const p of this.list) {
      if (mag(p.pos) + p.radius > this.radius) {
        p.pos = add(
          scale(p.pos, this.softness),
          scale(makeWithAngleMag(angle(p.pos), this.radius - p.radius), 1 - this.softness),
        );
      }
    }
  }
}

export class Simulator {
  /** @param {number} randomSeed */
  constructor(randomSeed) {
    this.randomSeed = randomSeed;
    this.wallClockNanos = 0;
    this.now = 0;
    this.dt = 0;
    this.rng = createRng(randomSeed);
    /** @type {Set<object>} */
    this.entities = new Set();
    /** @type {Set<object>} */
    this.constraints = new Set();
    /** @type {Set<() => void>} */
    this.listeners = new Set();
  }

  /** @param {object} e */
  add(e) {
    this.entities.add(e);
  }

  /** @param {object} e */
  remove(e) {
    this.entities.delete(e);
  }

  /** @param {object} c */
  addConstraint(c) {
    this.constraints.add(c);
  }

  /** @param {object} c */
  removeConstraint(c) {
    this.constraints.delete(c);
  }

  /** @param {() => void} fn @returns {() => void} */
  addSimulationStepListener(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** @param {number} dt @param {Set<object>} entities */
  updateAll(dt, entities) {
    for (const e of entities) {
      if (typeof e.update === "function") e.update(this, dt);
    }
  }

  /** @param {number} dt @param {Set<object>} constraints */
  solveAll(dt, constraints) {
    for (const c of constraints) {
      if (typeof c.solve === "function") c.solve(this, dt);
    }
  }

  /** @param {number} dt @param {Set<object>} entities */
  postUpdateAll(dt, entities) {
    for (const e of entities) {
      if (typeof e.postUpdate === "function") e.postUpdate(this, dt);
    }
  }

  /** @param {number} nanos */
  step(nanos) {
    const firstFrame = this.wallClockNanos === 0;
    this.dt = ((nanos - this.wallClockNanos) / 1e9) * TIME_SCALE;
    this.wallClockNanos = nanos;

    if (firstFrame || this.dt > MAX_VALID_DT) return;

    this.now += this.dt;

    const localEntities = new Set(this.entities);
    const localConstraints = new Set(this.constraints);

    this.updateAll(this.dt, localEntities);
    this.solveAll(this.dt, localConstraints);
    this.postUpdateAll(this.dt, localEntities);

    for (const fn of this.listeners) fn();
  }
}

export class Track {
  constructor() {
    /** @type {import('./utils.js').Vec2[]} */
    this.positions = [];
    /** @type {number[]} */
    this.angles = [];
  }

  /** @param {number} x @param {number} y @param {number} a */
  add(x, y, a) {
    if (this.positions.length >= TRACK_LENGTH - 1) {
      this.positions.shift();
      this.angles.shift();
      this.positions.shift();
      this.angles.shift();
    }
    this.positions.push(vec2(x, y));
    this.angles.push(a);
  }
}

export class Spark extends Body {
  /**
   * @param {number} ttl
   * @param {object} [opts]
   */
  constructor(ttl, opts = {}) {
    super("Spark");
    this.ttl = ttl;
    this.style = opts.style ?? "LINE";
    this.color = opts.color ?? "#888";
    this.size = opts.size ?? 2;
    this.fuse = new Fuse(ttl);
    this.collides = opts.collides ?? false;
    this.mass = opts.mass ?? 0;
  }

  /** @param {Simulator} sim @param {number} dt */
  update(sim, dt) {
    super.update(sim, dt);
    this.fuse.update(dt);
  }
}

Spark.Style = {
  LINE: "LINE",
  LINE_ABSOLUTE: "LINE_ABSOLUTE",
  DOT: "DOT",
  DOT_ABSOLUTE: "DOT_ABSOLUTE",
  RING: "RING",
};

export class Spacecraft extends Body {
  constructor() {
    super();
    this.mass = SPACECRAFT_MASS;
    this.radius = 12;
    /** @type {import('./utils.js').Vec2} */
    this.thrust = Vec2Zero;
    this.launchClock = 0;
    this.transit = false;
    this.track = new Track();
    /** @type {Landing | null} */
    this.landing = null;
    /** @type {import('./autopilot.js').Autopilot | null} */
    this.autopilot = null;
  }

  /** @param {Simulator} sim @param {number} dt */
  update(sim, dt) {
    const thrustMag = mag(this.thrust);
    if (thrustMag > 0) {
      let deltaV = MAIN_ENGINE_ACCEL * dt;
      if (SCALED_THRUST) deltaV *= Math.min(1, Math.max(0, thrustMag));

      if (this.landing) {
        if (this.launchClock === 0) this.launchClock = sim.now + 1;
        if (sim.now > this.launchClock) {
          this.landing.ship = null;
          this.landing = null;
        } else {
          deltaV = 0;
        }
      }

      this.velocity = add(this.velocity, makeWithAngleMag(this.angle, deltaV));
    } else if (this.launchClock !== 0) {
      this.launchClock = 0;
    }

    const vm = mag(this.velocity);
    if (vm > CRAFT_SPEED_LIMIT) {
      this.velocity = makeWithAngleMag(angle(this.velocity), CRAFT_SPEED_LIMIT);
    }

    if (this.landing) return;

    super.update(sim, dt);
  }

  /** @param {Simulator} sim @param {number} dt */
  postUpdate(sim, dt) {
    if (this.landing) {
      this.opos = { ...this.pos };
      return;
    }

    super.postUpdate(sim, dt);
    this.track.add(this.pos.x, this.pos.y, this.angle);

    const thrustMag = mag(this.thrust);
    if (thrustMag > 0 && sim.entities.size < 500) {
      let sparkCount = 0;
      for (const e of sim.entities) {
        if (e instanceof Spark) sparkCount++;
      }
      if (sparkCount < MAX_SPARKS && sim.rng.nextFloat() < thrustMag) {
        const spark = new Spark(sim.rng.nextFloatInRange(0.5, 1), {
        collides: true,
        mass: 1,
        style: Spark.Style.RING,
        size: 1,
        color: "rgba(255,255,255,0.25)",
        });
        spark.pos = { ...this.pos };
        spark.opos = { ...this.pos };
        spark.velocity = add(
          this.velocity,
          makeWithAngleMag(
            this.angle + sim.rng.nextFloatInRange(-0.2, 0.2),
            -MAIN_ENGINE_ACCEL * thrustMag * 10 * dt,
          ),
        );
        sim.add(spark);
      }
    }
  }
}

export class Landing {
  /**
   * @param {Spacecraft | null} ship
   * @param {Planet} planet
   * @param {number} ang
   * @param {string} text
   */
  constructor(ship, planet, ang, text = "") {
    this.ship = ship;
    this.planet = planet;
    this.angle = ang;
    this.text = text;
    this.fuse = new Fuse(LANDING_REMOVAL_TIME);
  }

  /** @param {Simulator} sim @param {number} dt */
  solve(sim, dt) {
    if (this.ship) {
      const landingVector = makeWithAngleMag(this.angle, this.ship.radius + this.planet.radius);
      const desiredPos = add(this.planet.pos, landingVector);
      this.ship.pos = desiredPos;
      this.ship.opos = desiredPos;
      this.ship.velocity = { ...this.planet.velocity };
      this.ship.angle = this.angle;
    }
    this.fuse.update(dt);
  }

  canBeRemoved() {
    return this.fuse.canBeRemoved();
  }
}

export class Planet extends Body {
  /**
   * @param {import('./utils.js').Vec2} orbitCenter
   * @param {number} radius
   * @param {import('./utils.js').Vec2} pos
   * @param {number} speed
   * @param {string} [color]
   */
  constructor(orbitCenter, radius, pos, speed, color = "#a7a7ca") {
    super();
    this.orbitCenter = orbitCenter;
    this.radius = radius;
    this.pos = pos;
    this.speed = speed;
    this.color = color;
    this.orbitRadius = mag(sub(pos, orbitCenter));
    this.mass = (4 / 3) * PIf * radius ** 3 * PLANETARY_DENSITY;
    this.atmosphere = "";
    this.description = "";
    this.flora = "";
    this.fauna = "";
    this.explored = false;
    /** @type {string} */
    this.cls = "";
  }

  /** @param {Simulator} sim @param {number} dt */
  update(sim, dt) {
    const orbitAngle = angle(sub(this.pos, this.orbitCenter));
    this.velocity = makeWithAngleMag(orbitAngle + PIf / 2, this.speed);
    super.update(sim, dt);
  }

  /** @param {Simulator} sim @param {number} dt */
  postUpdate(sim, dt) {
    const orbitAngle = angle(sub(this.pos, this.orbitCenter));
    this.pos = add(this.orbitCenter, makeWithAngleMag(orbitAngle, this.orbitRadius));
    super.postUpdate(sim, dt);
  }
}

function distance(a, b) {
  return mag(sub(a, b));
}

export class Star extends Planet {
  /** @param {string} cls @param {number} radius */
  constructor(cls, radius) {
    super(vec2(0, 0), radius, vec2(0, 0), 0, STAR_COLOR(cls));
    this.cls = cls;
    this.mass = (4 / 3) * PIf * radius ** 3 * STELLAR_DENSITY;
    this.collides = false;
    this.anim = 0;
  }

  /** @param {Simulator} sim @param {number} dt */
  update(sim, dt) {
    this.anim += dt;
  }
}

/** @param {string} cls */
function STAR_COLOR(cls) {
  const map = {
    O: "#6666ff", B: "#ccccff", A: "#eeeeff", F: "#ffffff",
    G: "#ffff66", K: "#ffcc33", M: "#ff8800",
  };
  return map[cls] ?? "#ffffff";
}
