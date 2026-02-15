const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, unique: true },
    abbreviation: { type: String, required: true, trim: true, uppercase: true, unique: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Client", clientSchema);
