const mongoose = require("mongoose");

const solutionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    problemId: { type: String, required: true, index: true },
    language: {
      type: String,
      required: true,
      enum: ["js", "ts", "python"],
      default: "js",
    },
    title: { type: String, required: true, trim: true },
    tag: { type: String, default: "General", trim: true },
    content: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

solutionSchema.index({ problemId: 1, language: 1, updatedAt: -1 });

module.exports = mongoose.model("Solution", solutionSchema);
