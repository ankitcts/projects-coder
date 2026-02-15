const express = require("express");
const Solution = require("../models/solution");
const Problem = require("../models/problem");
const { makeStableId } = require("../utils");

const router = express.Router();

router.get("/", async (req, res) => {
  const { problemId } = req.query;
  const query = problemId ? { problemId: String(problemId) } : {};
  const solutions = await Solution.find(query).sort({ updatedAt: -1 }).lean();
  return res.json(solutions);
});

router.post("/", async (req, res) => {
  const problemId = String(req.body?.problemId || "").trim();
  const language = String(req.body?.language || "js").trim();
  const title = String(req.body?.title || "").trim();
  const tag = String(req.body?.tag || "General").trim() || "General";
  const content = String(req.body?.content || "");

  if (!problemId || !title || !content) {
    return res.status(400).json({ message: "problemId, title and content are required" });
  }

  const problemExists = await Problem.exists({ id: problemId });
  if (!problemExists) {
    return res.status(400).json({ message: "problemId does not exist" });
  }

  const created = await Solution.create({
    id: makeStableId(`${problemId}-${title}`),
    problemId,
    language,
    title,
    tag,
    content,
  });

  return res.status(201).json(created);
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const language = String(req.body?.language || "js").trim();
  const title = String(req.body?.title || "").trim();
  const tag = String(req.body?.tag || "General").trim() || "General";
  const content = String(req.body?.content || "");

  if (!title || !content) {
    return res.status(400).json({ message: "title and content are required" });
  }

  const updated = await Solution.findOneAndUpdate(
    { id },
    {
      $set: {
        language,
        title,
        tag,
        content,
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return res.status(404).json({ message: "Solution not found" });
  }

  return res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const deleted = await Solution.findOneAndDelete({ id }).lean();

  if (!deleted) {
    return res.status(404).json({ message: "Solution not found" });
  }

  return res.status(204).send();
});

module.exports = router;
