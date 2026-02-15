const express = require("express");
const Client = require("../models/client");
const Problem = require("../models/problem");
const { makeStableId } = require("../utils");

const router = express.Router();

router.get("/", async (_req, res) => {
  const clients = await Client.find({}).sort({ name: 1 }).lean();
  return res.json(clients);
});

router.post("/", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const abbreviation = String(req.body?.abbreviation || "").trim().toUpperCase();

  if (!name || !abbreviation) {
    return res.status(400).json({ message: "name and abbreviation are required" });
  }

  const existing = await Client.findOne({
    $or: [{ name: new RegExp(`^${name}$`, "i") }, { abbreviation: new RegExp(`^${abbreviation}$`, "i") }],
  }).lean();

  if (existing) {
    return res.status(409).json({ message: "Client name or abbreviation already exists" });
  }

  const client = await Client.create({
    id: makeStableId(name),
    name,
    abbreviation,
  });

  return res.status(201).json(client);
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const usage = await Problem.countDocuments({ clientId: id });
  if (usage > 0) {
    return res.status(409).json({ message: "Client is used by problems and cannot be deleted" });
  }

  const deleted = await Client.findOneAndDelete({ id }).lean();
  if (!deleted) {
    return res.status(404).json({ message: "Client not found" });
  }

  return res.status(204).send();
});

module.exports = router;
