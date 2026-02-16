function makeStableId(value) {
  return `${String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${Date.now()}`;
}

const FUN_CODE_NAMES = [
  "IRONMAN",
  "SPIDERMAN",
  "METAVERSE",
  "BATMAN",
  "SUPERMAN",
  "WONDERWOMAN",
  "FLASH",
  "THOR",
  "HULK",
  "LOKI",
  "GROOT",
  "VIBRANIUM",
  "PANTHER",
  "PHOENIX",
  "QUASAR",
  "NOVA",
  "MATRIX",
  "NEBULA",
  "ORBIT",
  "COSMOS",
  "TITAN",
  "APEX",
  "ZENITH",
  "AURORA",
  "GALAXY",
  "INFINITY",
  "QUANTUM",
  "VELOCITY",
  "FALCON",
  "RAPTOR",
];

function makeUniqueProblemCodeName(problemNumber, existingNames = new Set()) {
  const base = FUN_CODE_NAMES[(Math.max(problemNumber, 1) - 1) % FUN_CODE_NAMES.length];
  let candidate = `${base}-${String(problemNumber).padStart(3, "0")}`;
  let suffix = 1;
  while (existingNames.has(candidate)) {
    candidate = `${base}-${String(problemNumber).padStart(3, "0")}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

module.exports = {
  makeStableId,
  makeUniqueProblemCodeName,
};
