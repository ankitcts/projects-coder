const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { connectDatabase } = require("./src/db");
const clientsRouter = require("./src/routes/clients");
const problemsRouter = require("./src/routes/problems");
const solutionsRouter = require("./src/routes/solutions");
const progressRouter = require("./src/routes/progress");

dotenv.config({ path: `${__dirname}/.env` });

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "projects-coder-api" });
});

app.use("/api/clients", clientsRouter);
app.use("/api/problems", problemsRouter);
app.use("/api/solutions", solutionsRouter);
app.use("/api/progress", progressRouter);

// Serve frontend static files
const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*splat", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  return res.status(500).json({ message: "Internal server error" });
});

async function start() {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start API:", error.message);
  process.exit(1);
});
