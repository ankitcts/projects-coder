const dotenv = require("dotenv");
const { connectDatabase } = require("../src/db");
const Client = require("../src/models/client");
const Problem = require("../src/models/problem");

dotenv.config({ path: `${__dirname}/../.env` });

const INITIAL_CLIENTS = [
  { id: "acme", name: "Acme Corporation", abbreviation: "ACM" },
  { id: "globex", name: "Globex Corporation", abbreviation: "GLX" },
  { id: "initech", name: "Initech", abbreviation: "INT" },
  { id: "umbrella", name: "Umbrella Corp", abbreviation: "UMB" },
  { id: "wayne", name: "Wayne Enterprises", abbreviation: "WNE" },
];

const INITIAL_PROBLEMS = [
  {
    id: "sum-array",
    title: "Sum of Array",
    difficulty: "Easy",
    clientId: "acme",
    statement: "Given an integer array, return the sum of all values. Handle empty arrays as 0.",
    status: "Active",
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "Medium",
    clientId: "globex",
    statement: "Given a string with only ()[]{} characters, determine if the sequence is valid.",
    status: "Active",
  },
  {
    id: "longest-substring",
    title: "Longest Unique Substring",
    difficulty: "Medium",
    clientId: "initech",
    statement: "Return length of the longest substring without repeating characters.",
    status: "Active",
  },
  {
    id: "word-ladder",
    title: "Word Ladder",
    difficulty: "Hard",
    clientId: "umbrella",
    statement: "Find the shortest transformation sequence between begin and end words.",
    status: "Active",
  },
];

async function seed() {
  await connectDatabase();

  for (const client of INITIAL_CLIENTS) {
    await Client.findOneAndUpdate(
      { id: client.id },
      { $set: client },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  for (const problem of INITIAL_PROBLEMS) {
    await Problem.findOneAndUpdate(
      { id: problem.id },
      { $set: problem },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const [clientCount, problemCount] = await Promise.all([
    Client.countDocuments({}),
    Problem.countDocuments({}),
  ]);

  console.log(`Seed complete. clients=${clientCount}, problems=${problemCount}`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
