const express = require("express");
const Problem = require("../models/problem");
const Client = require("../models/client");
const { makeStableId, makeUniqueProblemCodeName } = require("../utils");

const router = express.Router();

router.get("/", async (_req, res) => {
  const problems = await Problem.find({}).sort({ updatedAt: -1 }).lean();
  return res.json(problems);
});

router.post("/", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const statement = String(req.body?.statement || "").trim();
  const difficulty = String(req.body?.difficulty || "Easy");
  const clientId = String(req.body?.clientId || "").trim();
  const status = String(req.body?.status || "Active");

  if (!title || !statement || !clientId) {
    return res.status(400).json({ message: "title, statement and clientId are required" });
  }

  const clientExists = await Client.exists({ id: clientId });
  if (!clientExists) {
    return res.status(400).json({ message: "clientId does not exist" });
  }

  const [lastProblem, existingCodeNames] = await Promise.all([
    Problem.findOne({}).sort({ problemNumber: -1 }).lean(),
    Problem.distinct("problemCodeName"),
  ]);

  const nextProblemNumber = Math.max((lastProblem?.problemNumber || 0) + 1, 1);
  const nextCodeName = makeUniqueProblemCodeName(nextProblemNumber, new Set(existingCodeNames.filter(Boolean)));

  const created = await Problem.create({
    id: makeStableId(title),
    problemNumber: nextProblemNumber,
    problemCodeName: nextCodeName,
    title,
    statement,
    difficulty,
    clientId,
    status,
  });

  return res.status(201).json(created);
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const title = String(req.body?.title || "").trim();
  const statement = String(req.body?.statement || "").trim();
  const difficulty = String(req.body?.difficulty || "Easy");
  const clientId = String(req.body?.clientId || "").trim();
  const status = String(req.body?.status || "Active");

  if (!title || !statement || !clientId) {
    return res.status(400).json({ message: "title, statement and clientId are required" });
  }

  const clientExists = await Client.exists({ id: clientId });
  if (!clientExists) {
    return res.status(400).json({ message: "clientId does not exist" });
  }

  const updated = await Problem.findOneAndUpdate(
    { id },
    {
      $set: {
        title,
        statement,
        difficulty,
        clientId,
        status,
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return res.status(404).json({ message: "Problem not found" });
  }

  return res.json(updated);
});

router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const status = String(req.body?.status || "");

  if (!["Active", "Disabled", "Redundant"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const updated = await Problem.findOneAndUpdate(
    { id },
    { $set: { status } },
    { new: true }
  ).lean();

  if (!updated) {
    return res.status(404).json({ message: "Problem not found" });
  }

  return res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const deleted = await Problem.findOneAndDelete({ id }).lean();

  if (!deleted) {
    return res.status(404).json({ message: "Problem not found" });
  }

  return res.status(204).send();
});

module.exports = router;
