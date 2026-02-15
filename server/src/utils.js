function makeStableId(value) {
  return `${String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${Date.now()}`;
}

module.exports = {
  makeStableId,
};
