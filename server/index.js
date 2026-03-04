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

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://localhost:8080"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
}));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "projects-coder-api" });
});

app.use("/api/clients", clientsRouter);
app.use("/api/problems", problemsRouter);
app.use("/api/solutions", solutionsRouter);
app.use("/api/progress", progressRouter);

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
