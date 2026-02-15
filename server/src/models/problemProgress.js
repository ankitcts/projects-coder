const mongoose = require("mongoose");

const problemProgressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    problemId: { type: String, required: true, index: true },
    codeByLanguage: {
      type: Object,
      default: {},
    },
    language: {
      type: String,
      enum: ["js", "ts", "python"],
      default: "js",
    },
    output: {
      type: [String],
      default: [],
    },
    updatedAtClient: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

problemProgressSchema.index({ userId: 1, problemId: 1 }, { unique: true });

module.exports = mongoose.model("ProblemProgress", problemProgressSchema);
