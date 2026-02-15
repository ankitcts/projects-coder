const express = require("express");
const ProblemProgress = require("../models/problemProgress");

const router = express.Router();

router.get("/", async (req, res) => {
  const userId = String(req.query?.userId || "").trim();
  if (!userId) {
    return res.status(400).json({ message: "userId query param is required" });
  }

  const progress = await ProblemProgress.find({ userId }).sort({ updatedAt: -1 }).lean();
  return res.json(progress);
});

router.put("/:problemId", async (req, res) => {
  const problemId = String(req.params.problemId || "").trim();
  const userId = String(req.body?.userId || "").trim();
  const codeByLanguage = req.body?.codeByLanguage || {};
  const language = String(req.body?.language || "js").trim();
  const output = Array.isArray(req.body?.output) ? req.body.output.map((line) => String(line)) : [];
  const updatedAtClient = req.body?.updatedAt ? new Date(req.body.updatedAt) : undefined;

  if (!problemId || !userId) {
    return res.status(400).json({ message: "problemId and userId are required" });
  }

  const updated = await ProblemProgress.findOneAndUpdate(
    { problemId, userId },
    {
      $set: {
        codeByLanguage,
        language,
        output,
        updatedAtClient,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  return res.json(updated);
});

module.exports = router;
