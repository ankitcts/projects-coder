const mongoose = require("mongoose");

const problemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    statement: { type: String, required: true, trim: true },
    difficulty: {
      type: String,
      required: true,
      enum: ["Easy", "Medium", "Hard"],
      default: "Easy",
    },
    clientId: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["Active", "Disabled", "Redundant"],
      default: "Active",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Problem", problemSchema);
