import { GRAVITATION, KEPLER_CONSTANT, LAUNCH_MECO, NUM_PLANETS_RANGE,
  PLANET_ORBIT_RANGE, PLANET_RADIUS_RANGE, STAR_RADIUS_RANGE,
  UNIVERSE_RANGE,
} from "./physics.js";
import {
  Container, Landing, Planet, Simulator, Spacecraft, Spark, Star, MAX_SPARKS,
} from "./physics.js";
import { PIf, PI2f, add, angle, lerp, mag, makeWithAngleMag, scale, sub, vec2 } from "./utils.js";
import { COLORS } from "./utils.js";

export { Planet, Star, Spacecraft, Landing, Spark, Container };

export class Universe extends Simulator {
  /** @param {import('./namer.js').Namer} namer @param {number} randomSeed */
  constructor(namer, randomSeed) {
    super(randomSeed);
    this.namer = namer;
    /** @type {Planet | null} */
    this.latestDiscovery = null;
    /** @type {Star} */
    this.star = null;
    /** @type {Spacecraft} */
    this.ship = null;
    /** @type {Planet[]} */
    this.planets = [];
    /** @type {Body | null} */
    this.follow = null;
    this.ringfence = new Container(UNIVERSE_RANGE);
  }

  initRandom() {
    const systemName = this.namer.nameSystem(this.rng);
    const starClasses = ["O", "B", "A", "F", "G", "K", "M"];
    this.star = new Star(
      this.rng.choose(starClasses),
      this.rng.nextFloatInRange(STAR_RADIUS_RANGE[0], STAR_RADIUS_RANGE[1]),
    );
    this.star.name = systemName;

    const numPlanets = this.rng.nextInt(NUM_PLANETS_RANGE[0], NUM_PLANETS_RANGE[1] + 1);
    for (let i = 0; i < numPlanets; i++) {
      const radius = this.rng.nextFloatInRange(PLANET_RADIUS_RANGE[0], PLANET_RADIUS_RANGE[1]);
      const orbitRadius = lerp(
        PLANET_ORBIT_RANGE[0],
        PLANET_ORBIT_RANGE[1],
        this.rng.nextFloat() ** 1,
      );
      const period = Math.sqrt(orbitRadius ** 3 / this.star.mass) * KEPLER_CONSTANT;
      const speed = (2 * PIf * orbitRadius) / period;

      const p = new Planet(
        this.star.pos,
        radius,
        add(this.star.pos, makeWithAngleMag(this.rng.nextFloat() * PI2f, orbitRadius)),
        speed,
        COLORS.eigengrau4,
      );
      p.description = this.namer.describePlanet(this.rng);
      p.atmosphere = this.namer.describeAtmo(this.rng);
      p.flora = this.namer.describeLife(this.rng);
      p.fauna = this.namer.describeLife(this.rng);
      this.planets.push(p);
      this.add(p);
    }

    this.planets.sort((a, b) => mag(sub(a.pos, this.star.pos)) - mag(sub(b.pos, this.star.pos)));
    this.planets.forEach((planet, idx) => {
      planet.name = `${systemName} ${idx + 1}`;
    });
    this.add(this.star);

    this.ship = new Spacecraft();
    this.ship.pos = add(
      this.star.pos,
      makeWithAngleMag(
        this.rng.nextFloat() * PI2f,
        this.rng.nextFloatInRange(PLANET_ORBIT_RANGE[0], PLANET_ORBIT_RANGE[1]),
      ),
    );
    this.ship.angle = this.rng.nextFloat() * PI2f;
    this.add(this.ship);

    this.ringfence.add(this.ship);
    this.addConstraint(this.ringfence);

    this.follow = this.ship;
  }

  /** @param {number} dt @param {Set<object>} entities */
  updateAll(dt, entities) {
    this.ship.transit = false;

    for (const planet of [...this.planets, this.star]) {
      const vector = sub(planet.pos, this.ship.pos);
      const d = mag(vector);
      if (d < planet.radius) {
        if (planet === this.star) this.ship.transit = true;
      } else if (this.now > this.ship.launchClock + LAUNCH_MECO) {
        this.ship.velocity = add(
          this.ship.velocity,
          scale(
            makeWithAngleMag(angle(vector), (GRAVITATION * this.ship.mass * planet.mass) / d ** 2),
            dt,
          ),
        );
      }
    }

    super.updateAll(dt, entities);
  }

  closestPlanet() {
    let closest = this.star;
    let minDist = mag(sub(this.star.pos, this.ship.pos));
    for (const p of this.planets) {
      const d = mag(sub(p.pos, this.ship.pos));
      if (d < minDist) {
        minDist = d;
        closest = p;
      }
    }
    return closest;
  }

  /** @param {number} dt @param {Set<object>} constraints */
  solveAll(dt, constraints) {
    if (!this.ship.landing) {
      const planet = this.closestPlanet();

      if (planet.collides) {
        const d = mag(sub(this.ship.pos, planet.pos)) - this.ship.radius - planet.radius;
        const a = angle(sub(this.ship.pos, planet.pos));

        if (d < 0) {
          const aDiff = Math.abs(this.ship.angle - a);

          if (aDiff < PIf / 4) {
            const landing = new Landing(
              this.ship,
              planet,
              a,
              this.namer.describeActivity(this.rng, planet),
            );
            if (mag(this.ship.thrust) > 0) this.ship.thrust = vec2(0, 0);
            this.ship.landing = landing;
            this.ship.velocity = { ...planet.velocity };
            this.addConstraint(landing);

            planet.explored = true;
            this.latestDiscovery = planet;
          } else {
            const impact = add(planet.pos, makeWithAngleMag(a, planet.radius));
            this.ship.pos = add(
              planet.pos,
              makeWithAngleMag(a, planet.radius + this.ship.radius - d),
            );

            for (let i = 0; i < 10; i++) {
              const spark = new Spark(this.rng.nextFloatInRange(0.5, 2), {
                style: Spark.Style.DOT,
                color: "#ffffff",
                size: 1,
              });
              spark.pos = add(
                impact,
                makeWithAngleMag(
                  this.rng.nextFloatInRange(0, PI2f),
                  this.rng.nextFloatInRange(0.1, 0.5),
                ),
              );
              spark.opos = { ...spark.pos };
              spark.velocity = add(
                scale(this.ship.velocity, 0.8),
                makeWithAngleMag(
                  this.rng.nextFloatInRange(0, PI2f),
                  this.rng.nextFloatInRange(0.1, 0.5),
                ),
              );
              this.add(spark);
            }
          }
        }
      }
    }

    super.solveAll(dt, constraints);
  }

  /** @param {number} dt @param {Set<object>} entities */
  postUpdateAll(dt, entities) {
    super.postUpdateAll(dt, entities);

    let sparkCount = 0;
    for (const e of this.entities) {
      if (e instanceof Spark) sparkCount++;
    }
    if (sparkCount > MAX_SPARKS) {
      for (const e of this.entities) {
        if (e instanceof Spark) {
          this.remove(e);
          if (--sparkCount <= MAX_SPARKS) break;
        }
      }
    }

    for (const e of [...this.entities]) {
      if (typeof e.canBeRemoved === "function" && e.canBeRemoved()) {
        this.remove(e);
      }
    }
    for (const c of [...this.constraints]) {
      if (typeof c.canBeRemoved === "function" && c.canBeRemoved()) {
        this.removeConstraint(c);
      }
    }
  }
}
