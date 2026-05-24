import { MAIN_ENGINE_ACCEL } from "./physics.js";
import { PIf, PI2f, add, angle, dot, expSmooth, mag, makeWithAngleMag, scale, sub } from "./utils.js";

export class Autopilot {
  /** @param {import('./physics.js').Spacecraft} ship @param {import('./universe.js').Universe} universe */
  constructor(ship, universe) {
    this.ship = ship;
    this.universe = universe;
    this.BRAKING_TIME = 5;
    this.SIGHTSEEING_TIME = 15;
    this.LAUNCH_THRUST_TIME = 5;
    this.STRATEGY_MIN_TIME = 0.5;

    this.enabled = false;
    /** @type {import('./universe.js').Planet | null} */
    this.target = null;
    this.landingAltitude = 0;
    this.nextStrategyTime = 0;
    this.brakingDistance = 0;
    this.leadingPos = { x: 0, y: 0 };
    this.leadingVector = { x: 0, y: 0 };
    this.strategy = "NONE";
    this.debug = "";
  }

  get telemetry() {
    if (!this.enabled) return "";
    return [
      "---- AUTOPILOT ENGAGED ----",
      `TGT: ${(this.target?.name ?? "SELECTING...").toUpperCase()}`,
      `EXE: ${this.strategy}${this.debug ? ` (${this.debug})` : ""}`,
    ].join("\n");
  }

  /** @param {import('./physics.js').Simulator} sim @param {number} dt */
  update(sim, dt) {
    if (!this.enabled) return;

    if (sim.now < this.nextStrategyTime) return;

    const currentStrategy = this.strategy;

    if (this.ship.landing) {
      if (this.target) {
        this.strategy = "LANDED";
        this.debug = "";
        this.target = null;
        this.landingAltitude = 0;
        this.nextStrategyTime = sim.now + this.SIGHTSEEING_TIME;
      } else {
        this.ship.thrust = makeWithAngleMag(this.ship.angle, 1);
        this.strategy = "LAUNCHING";
        this.debug = "";
        this.nextStrategyTime = sim.now + this.LAUNCH_THRUST_TIME;
      }
    } else {
      if (!this.target) {
        const unexplored = [...this.universe.planets]
          .sort((a, b) => mag(sub(a.pos, this.ship.pos)) - mag(sub(b.pos, this.ship.pos)))
          .find((p) => !p.explored);
        this.target = unexplored ?? this.universe.planets[Math.floor(sim.rng.nextFloat() * this.universe.planets.length)];
        this.brakingDistance = 0;
      }

      if (this.target) {
        const target = this.target;
        const shipV = this.ship.velocity;
        const targetV = target.velocity;
        const targetVector = sub(target.pos, this.ship.pos);
        const altitude = mag(targetVector) - target.radius;

        this.landingAltitude = Math.min(target.radius, 100);

        const tvMag = mag(targetVector);
        const relativeV = sub(shipV, targetV);
        const projection = dot(relativeV, scale(targetVector, 1 / tvMag));
        const relativeSpeed = mag(relativeV) * Math.sign(projection);
        const timeToTarget = relativeSpeed !== 0 ? altitude / relativeSpeed : 1000;

        const newBrakingDistance =
          this.BRAKING_TIME * (relativeSpeed > 0 ? relativeSpeed : MAIN_ENGINE_ACCEL);
        this.brakingDistance = expSmooth(this.brakingDistance, newBrakingDistance, sim.dt, 5);

        this.leadingPos = add(
          target.pos,
          makeWithAngleMag(
            angle(target.velocity),
            Math.min(altitude / 2, mag(target.velocity)),
          ),
        );
        this.leadingVector = sub(this.leadingPos, this.ship.pos);

        if (altitude < this.landingAltitude) {
          this.strategy = "LANDING";
          this.ship.angle = angle(sub(this.ship.pos, target.pos));
          this.ship.thrust = { x: 0, y: 0 };
        } else if (relativeSpeed < 0 || altitude > this.brakingDistance) {
          this.strategy = "CHASING";
          this.ship.angle = angle(this.leadingVector);
          this.ship.thrust = makeWithAngleMag(this.ship.angle, 1);
        } else {
          this.strategy = "APPROACHING";
          this.ship.angle = angle(scale(this.ship.velocity, -1));
          const decel = relativeSpeed / timeToTarget;
          const decelThrust = (decel / MAIN_ENGINE_ACCEL) * 0.9;
          this.ship.thrust = makeWithAngleMag(this.ship.angle, decelThrust);
        }

        this.debug = `DV=${relativeSpeed.toFixed(0)} D=${altitude.toFixed(0)} T${timeToTarget >= 0 ? "+" : ""}${timeToTarget.toFixed(1)}`;
      }

      if (this.strategy !== currentStrategy) {
        this.nextStrategyTime = sim.now + this.STRATEGY_MIN_TIME;
      }
    }
  }

  /** @param {import('./physics.js').Simulator} sim @param {number} dt */
  postUpdate(sim, dt) {}
}
