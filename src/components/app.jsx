import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import * as ts from "typescript";

const LANGUAGES = [
  { id: "js", label: "JavaScript" },
  { id: "ts", label: "TypeScript" },
  { id: "python", label: "Python" },
];

const MONACO_LANGUAGE_BY_ID = {
  js: "javascript",
  ts: "typescript",
  python: "python",
};

const DEFAULT_CODE = {
  js: `function solve(input) {\n  console.log("Input:", input);\n  return input.length;\n}\n\nsolve("hello world");`,
  ts: `type Input = string;\n\nfunction solve(input: Input): number {\n  console.log("Input:", input);\n  return input.length;\n}\n\nsolve("hello world");`,
  python: `def solve(text: str) -> int:\n    print("Input:", text)\n    return len(text)\n\nsolve("hello world")`,
};

const PROBLEMS = [
  {
    id: "sum-array",
    title: "Sum of Array",
    difficulty: "Easy",
    source: "Internal Set A",
    statement:
      "Given an integer array, return the sum of all values. Handle empty arrays as 0.",
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "Medium",
    source: "Internal Set B",
    statement:
      "Given a string with only ()[]{} characters, determine if the sequence is valid.",
  },
  {
    id: "longest-substring",
    title: "Longest Unique Substring",
    difficulty: "Medium",
    source: "Partner Bank",
    statement:
      "Return length of the longest substring without repeating characters.",
  },
  {
    id: "word-ladder",
    title: "Word Ladder",
    difficulty: "Hard",
    source: "Partner Bank",
    statement:
      "Find the shortest transformation sequence between begin and end words.",
  },
];

let pyodideInstancePromise;

async function ensurePyodideLoaded() {
  if (window.pyodide) {
    return window.pyodide;
  }

  if (!pyodideInstancePromise) {
    pyodideInstancePromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector("script[data-pyodide='true']");

      const initialize = async () => {
        try {
          const pyodide = await window.loadPyodide();
          window.pyodide = pyodide;
          resolve(pyodide);
        } catch (error) {
          reject(error);
        }
      };

      if (existingScript) {
        if (window.loadPyodide) {
          initialize();
        } else {
          existingScript.addEventListener("load", initialize);
          existingScript.addEventListener("error", reject);
        }
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js";
      script.async = true;
      script.dataset.pyodide = "true";
      script.onload = initialize;
      script.onerror = () => reject(new Error("Unable to load Pyodide runtime."));
      document.body.appendChild(script);
    });
  }

  return pyodideInstancePromise;
}

async function runJavaScriptOrTypeScript(language, code) {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;

  const collector = (...args) => {
    logs.push(args.map((item) => String(item)).join(" "));
  };

  console.log = collector;
  console.error = collector;

  try {
    const executableCode =
      language === "ts"
        ? ts.transpileModule(code, {
            compilerOptions: {
              module: ts.ModuleKind.None,
              target: ts.ScriptTarget.ES2018,
            },
          }).outputText
        : code;

    const run = new Function(`"use strict";\n${executableCode}`);
    const result = run();

    if (result !== undefined) {
      logs.push(`Return: ${String(result)}`);
    }

    return logs.length ? logs : ["Program finished with no output."];
  } catch (error) {
    return [`Error: ${error.message}`];
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function runPython(code) {
  const pyodide = await ensurePyodideLoaded();
  const logs = [];

  pyodide.setStdout({
    batched: (message) => {
      logs.push(message);
    },
  });

  pyodide.setStderr({
    batched: (message) => {
      logs.push(`Error: ${message}`);
    },
  });

  try {
    const result = await pyodide.runPythonAsync(code);
    if (result !== undefined && result !== null) {
      logs.push(`Return: ${String(result)}`);
    }
    return logs.length ? logs : ["Program finished with no output."];
  } catch (error) {
    return [`Error: ${error.message}`];
  }
}

export function App() {
  const [searchText, setSearchText] = useState("");
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [language, setLanguage] = useState("js");
  const [codeByLanguage, setCodeByLanguage] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState(["Pick a problem to begin."]);
  const [isRunning, setIsRunning] = useState(false);
  const debounceTimerRef = useRef();
  const runTokenRef = useRef(0);

  const visibleProblems = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return PROBLEMS;
    }

    return PROBLEMS.filter((problem) => {
      return (
        problem.title.toLowerCase().includes(query) ||
        problem.statement.toLowerCase().includes(query) ||
        problem.source.toLowerCase().includes(query) ||
        problem.difficulty.toLowerCase().includes(query)
      );
    });
  }, [searchText]);

  const currentCode = codeByLanguage[language];

  const executeCode = async () => {
    if (!selectedProblem) {
      return;
    }

    const token = Date.now();
    runTokenRef.current = token;
    setIsRunning(true);

    let nextOutput;
    if (language === "python") {
      nextOutput = await runPython(currentCode);
    } else {
      nextOutput = await runJavaScriptOrTypeScript(language, currentCode);
    }

    if (runTokenRef.current === token) {
      setOutput(nextOutput);
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (!selectedProblem) {
      return;
    }

    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      executeCode();
    }, 450);

    return () => clearTimeout(debounceTimerRef.current);
  }, [selectedProblem, language, currentCode]);

  return (
    <div className="platform">
      <header className="platform__header">
        <h1>Live Coding Dashboard</h1>
        <p>Search a problem, open the editor, choose a language, and see output immediately.</p>
      </header>

      {!selectedProblem ? (
        <section className="panel">
          <div className="toolbar">
            <input
              className="search"
              type="text"
              placeholder="Search by title, source, statement, difficulty"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          <table className="problem-table">
            <thead>
              <tr>
                <th>Problem</th>
                <th>Difficulty</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleProblems.map((problem) => (
                <tr key={problem.id}>
                  <td>
                    <div className="problem-title">{problem.title}</div>
                    <div className="problem-statement">{problem.statement}</div>
                  </td>
                  <td>{problem.difficulty}</td>
                  <td>{problem.source}</td>
                  <td>
                    <button className="primary-btn" onClick={() => setSelectedProblem(problem)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {!visibleProblems.length && (
                <tr>
                  <td colSpan="4">No problems found for the current search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="workspace">
          <div className="workspace__topbar">
            <button className="ghost-btn" onClick={() => setSelectedProblem(null)}>
              Back to dashboard
            </button>
            <label htmlFor="language">Language</label>
            <select
              id="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {LANGUAGES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <button className="primary-btn" onClick={executeCode}>
              Run
            </button>
            {isRunning && <span className="status">Running...</span>}
          </div>

          <div className="workspace__grid">
            <article className="panel">
              <h2>{selectedProblem.title}</h2>
              <p>{selectedProblem.statement}</p>
              <p>
                <strong>Difficulty:</strong> {selectedProblem.difficulty}
              </p>
            </article>

            <article className="panel">
              <h2>Editor ({language})</h2>
              <div className="editor">
                <Editor
                  height="320px"
                  language={MONACO_LANGUAGE_BY_ID[language]}
                  theme="vs-light"
                  value={currentCode}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    tabSize: 2,
                    automaticLayout: true,
                  }}
                  onChange={(value) =>
                    setCodeByLanguage((prev) => ({
                      ...prev,
                      [language]: value || "",
                    }))
                  }
                />
              </div>
            </article>

            <article className="panel">
              <h2>Console Output</h2>
              <pre className="console">{output.join("\n")}</pre>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
