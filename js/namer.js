import { NAME_DATA } from "./data.js";
import { Bag, RandomTable } from "./utils.js";

const SUFFIX_PROB = 0.75;
const LETTER_PROB = 0.3;
const NUMBER_PROB = 0.3;
const RARE_PROB = 0.05;

export class Namer {
  constructor() {
    const d = NAME_DATA;
    this.planetDescriptors = new Bag(d.planetDescriptors);
    this.lifeDescriptors = new Bag(d.lifeDescriptors);
    this.anyDescriptors = new Bag(d.anyDescriptors);
    this.atmoDescriptors = new Bag(d.atmoDescriptors);
    this.planetTypes = new Bag(d.planetTypes);
    this.constellations = new Bag(d.constellations);
    this.constellationsRare = new Bag(d.constellationsRare);
    this.suffixes = new Bag(d.starSuffixes);
    this.suffixesRare = new Bag(d.starSuffixesRare);
    this.floraGenericPlurals = new Bag(d.floraGenericPlurals);
    this.faunaGenericPlurals = new Bag(d.faunaGenericPlurals);
    this.atmoGenericPlurals = new Bag(d.atmoGenericPlurals);
    this.activities = new Bag(d.activities);

    this.planetTable = new RandomTable([0.75, this.planetDescriptors], [0.25, this.anyDescriptors]);
    this.lifeTable = new RandomTable([0.75, this.lifeDescriptors], [0.25, this.anyDescriptors]);
    this.constellationsTable = new RandomTable(
      [RARE_PROB, this.constellationsRare],
      [1 - RARE_PROB, this.constellations],
    );
    this.suffixesTable = new RandomTable([RARE_PROB, this.suffixesRare], [1 - RARE_PROB, this.suffixes]);
    this.atmoTable = new RandomTable([0.75, this.atmoDescriptors], [0.25, this.anyDescriptors]);
    this.delimiterTable = new RandomTable(
      [15, " "], [3, "-"], [1, "_"], [1, "/"], [1, "."], [1, "*"], [1, "^"], [1, "#"], [0.1, "(^*!%@##!!"],
    );
  }

  /** @param {ReturnType<import('./utils.js').createRng>} rng */
  describePlanet(rng) {
    return `${this.planetTable.roll(rng).pull(rng)} ${this.planetTypes.pull(rng)}`;
  }

  /** @param {ReturnType<import('./utils.js').createRng>} rng */
  describeLife(rng) {
    return this.lifeTable.roll(rng).pull(rng);
  }

  /** @param {ReturnType<import('./utils.js').createRng>} rng */
  nameSystem(rng) {
    let parts = this.constellationsTable.roll(rng).pull(rng);
    if (rng.nextFloat() <= SUFFIX_PROB) {
      parts += this.delimiterTable.roll(rng);
      parts += this.suffixesTable.roll(rng).pull(rng);
      if (rng.nextFloat() <= RARE_PROB) parts += ` ${this.suffixesRare.pull(rng)}`;
    }
    if (rng.nextFloat() <= LETTER_PROB) {
      parts += this.delimiterTable.roll(rng);
      parts += String.fromCharCode(65 + rng.nextInt(0, 26));
      if (rng.nextFloat() <= RARE_PROB) parts += this.delimiterTable.roll(rng);
    }
    if (rng.nextFloat() <= NUMBER_PROB) {
      parts += this.delimiterTable.roll(rng);
      parts += String(rng.nextInt(2, 5039));
    }
    return parts;
  }

  /** @param {ReturnType<import('./utils.js').createRng>} rng */
  describeAtmo(rng) {
    return this.atmoTable.roll(rng).pull(rng);
  }

  /** @param {ReturnType<import('./utils.js').createRng>} rng @param {import('./universe.js').Planet | null} target */
  describeActivity(rng, target) {
    const template = /{(flora|fauna|planet|atmo)}/g;
    return this.activities.pull(rng).replace(template, (_, tag) => {
      switch (tag) {
        case "flora":
          return `${target?.flora ?? "SOME"} ${this.floraGenericPlurals.pull(rng)}`;
        case "fauna":
          return `${target?.fauna ?? "SOME"} ${this.faunaGenericPlurals.pull(rng)}`;
        case "atmo":
          return `${target?.atmosphere ?? "SOME"} ${this.atmoGenericPlurals.pull(rng)}`;
        case "planet":
          return target?.description ?? "SOME BODY";
        default:
          return "unknown";
      }
    });
  }
}
