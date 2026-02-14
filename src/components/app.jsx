import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import * as ts from "typescript";

const LANGUAGES = [
  { id: "js", label: "JavaScript" },
  { id: "ts", label: "TypeScript" },
  { id: "python", label: "Python" },
];

const STATUS_OPTIONS = ["Active", "Disabled", "Redundant"];

const INITIAL_CLIENTS = [
  { id: "acme", name: "Acme Corporation", abbreviation: "ACM" },
  { id: "globex", name: "Globex Corporation", abbreviation: "GLX" },
  { id: "initech", name: "Initech", abbreviation: "INT" },
  { id: "umbrella", name: "Umbrella Corp", abbreviation: "UMB" },
  { id: "wayne", name: "Wayne Enterprises", abbreviation: "WNE" },
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
    clientId: "acme",
    statement:
      "Given an integer array, return the sum of all values. Handle empty arrays as 0.",
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "Medium",
    clientId: "globex",
    statement:
      "Given a string with only ()[]{} characters, determine if the sequence is valid.",
  },
  {
    id: "longest-substring",
    title: "Longest Unique Substring",
    difficulty: "Medium",
    clientId: "initech",
    statement:
      "Return length of the longest substring without repeating characters.",
  },
  {
    id: "word-ladder",
    title: "Word Ladder",
    difficulty: "Hard",
    clientId: "umbrella",
    statement:
      "Find the shortest transformation sequence between begin and end words.",
  },
];

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatTimestamp = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return DATE_TIME_FORMAT.format(date);
};

const USER_PROGRESS_STORAGE_KEY = "single_user_problem_progress_v1";

const makeProblemForm = (defaultClientId = "") => ({
  title: "",
  difficulty: "Easy",
  clientId: defaultClientId,
  status: "Active",
  statement: "",
});

const makeClientForm = () => ({
  name: "",
  abbreviation: "",
});

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

const prepareInitialProblems = () => {
  const now = new Date().toISOString();
  return PROBLEMS.map((problem) => ({
    ...problem,
    status: problem.status || "Active",
    createdAt: problem.createdAt || now,
    updatedAt: problem.updatedAt || now,
  }));
};

export function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [activePage, setActivePage] = useState("dashboard");
  const [clients, setClients] = useState(INITIAL_CLIENTS);
  const [problems, setProblems] = useState(prepareInitialProblems);
  const [searchText, setSearchText] = useState("");
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [isProblemModalOpen, setIsProblemModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [editingProblemId, setEditingProblemId] = useState(null);
  const [problemForm, setProblemForm] = useState(makeProblemForm(INITIAL_CLIENTS[0]?.id || ""));
  const [clientForm, setClientForm] = useState(makeClientForm);
  const [language, setLanguage] = useState("js");
  const [codeByLanguage, setCodeByLanguage] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState(["Pick a problem to begin."]);
  const [problemProgress, setProblemProgress] = useState(() => {
    try {
      const raw = localStorage.getItem(USER_PROGRESS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  });
  const [isRunning, setIsRunning] = useState(false);
  const debounceTimerRef = useRef();
  const runTokenRef = useRef(0);

  const clientsById = useMemo(() => {
    return clients.reduce((acc, client) => {
      acc[client.id] = client;
      return acc;
    }, {});
  }, [clients]);

  const clientUsage = useMemo(() => {
    return problems.reduce((acc, problem) => {
      acc[problem.clientId] = (acc[problem.clientId] || 0) + 1;
      return acc;
    }, {});
  }, [problems]);

  const visibleProblems = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return problems;
    }

    return problems.filter((problem) => {
      const client = clientsById[problem.clientId];
      return (
        problem.title.toLowerCase().includes(query) ||
        problem.statement.toLowerCase().includes(query) ||
        problem.difficulty.toLowerCase().includes(query) ||
        problem.status.toLowerCase().includes(query) ||
        (client?.name || "").toLowerCase().includes(query) ||
        (client?.abbreviation || "").toLowerCase().includes(query)
      );
    });
  }, [searchText, problems, clientsById]);

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

  const openProblemWorkspace = (problem) => {
    const saved = problemProgress[problem.id];
    const restoredCode = saved?.codeByLanguage
      ? { ...DEFAULT_CODE, ...saved.codeByLanguage }
      : { ...DEFAULT_CODE };

    setCodeByLanguage(restoredCode);
    setLanguage(saved?.language || "js");
    setOutput(saved?.output || ["Program ready. Click Run or start typing."]);
    setSelectedProblem(problem);
  };

  const closeProblemModal = () => {
    setIsProblemModalOpen(false);
    setEditingProblemId(null);
    setProblemForm(makeProblemForm(clients[0]?.id || ""));
  };

  const openAddProblemModal = () => {
    if (!clients.length) {
      return;
    }

    setModalMode("add");
    setEditingProblemId(null);
    setProblemForm(makeProblemForm(clients[0].id));
    setIsProblemModalOpen(true);
  };

  const openEditProblemModal = (problem) => {
    setModalMode("edit");
    setEditingProblemId(problem.id);
    setProblemForm({
      title: problem.title,
      difficulty: problem.difficulty,
      clientId: problem.clientId,
      status: problem.status,
      statement: problem.statement,
    });
    setIsProblemModalOpen(true);
  };

  const handleUpsertProblem = (event) => {
    event.preventDefault();
    const now = new Date().toISOString();
    const title = problemForm.title.trim();
    const statement = problemForm.statement.trim();

    if (!title || !statement || !problemForm.clientId) {
      return;
    }

    if (!clientsById[problemForm.clientId]) {
      return;
    }

    if (modalMode === "edit" && editingProblemId) {
      setProblems((prev) =>
        prev.map((problem) => {
          if (problem.id !== editingProblemId) {
            return problem;
          }

          return {
            ...problem,
            title,
            statement,
            difficulty: problemForm.difficulty,
            clientId: problemForm.clientId,
            status: problemForm.status,
            updatedAt: now,
          };
        })
      );
      closeProblemModal();
      return;
    }

    setProblems((prev) => [
      {
        id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
        title,
        statement,
        difficulty: problemForm.difficulty,
        clientId: problemForm.clientId,
        status: problemForm.status,
        createdAt: now,
        updatedAt: now,
      },
      ...prev,
    ]);

    closeProblemModal();
  };

  const handleDeleteProblem = (problemId) => {
    const target = problems.find((problem) => problem.id === problemId);
    if (!target) {
      return;
    }

    const shouldDelete = window.confirm(`Delete problem \"${target.title}\"?`);
    if (!shouldDelete) {
      return;
    }

    setProblems((prev) => prev.filter((problem) => problem.id !== problemId));
    setProblemProgress((prev) => {
      if (!prev[problemId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[problemId];
      return next;
    });
  };

  const handleStatusChange = (problemId, nextStatus) => {
    const now = new Date().toISOString();
    setProblems((prev) =>
      prev.map((problem) => {
        if (problem.id !== problemId) {
          return problem;
        }

        return {
          ...problem,
          status: nextStatus,
          updatedAt: now,
        };
      })
    );
  };

  const handleAddClient = (event) => {
    event.preventDefault();
    const name = clientForm.name.trim();
    const abbreviation = clientForm.abbreviation.trim().toUpperCase();

    if (!name || !abbreviation) {
      return;
    }

    const nameExists = clients.some((client) => client.name.toLowerCase() === name.toLowerCase());
    const abbreviationExists = clients.some(
      (client) => client.abbreviation.toLowerCase() === abbreviation.toLowerCase()
    );

    if (nameExists || abbreviationExists) {
      return;
    }

    setClients((prev) => [
      ...prev,
      {
        id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
        name,
        abbreviation,
      },
    ]);

    setClientForm(makeClientForm());
  };

  const handleDeleteClient = (clientId) => {
    if (clientUsage[clientId]) {
      return;
    }

    const client = clientsById[clientId];
    if (!client) {
      return;
    }

    const shouldDelete = window.confirm(
      `Delete client \"${client.name}\" (${client.abbreviation})?`
    );
    if (!shouldDelete) {
      return;
    }

    setClients((prev) => prev.filter((clientEntry) => clientEntry.id !== clientId));

    setProblemForm((prev) => {
      if (prev.clientId !== clientId) {
        return prev;
      }

      const nextClientId = clients.find((entry) => entry.id !== clientId)?.id || "";
      return {
        ...prev,
        clientId: nextClientId,
      };
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!selectedProblem) {
      return;
    }

    const refreshed = problems.find((problem) => problem.id === selectedProblem.id);
    if (!refreshed) {
      setSelectedProblem(null);
      return;
    }

    if (
      refreshed.updatedAt !== selectedProblem.updatedAt ||
      refreshed.status !== selectedProblem.status ||
      refreshed.clientId !== selectedProblem.clientId
    ) {
      setSelectedProblem(refreshed);
    }
  }, [problems, selectedProblem]);

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

  useEffect(() => {
    if (!selectedProblem) {
      return;
    }

    setProblemProgress((prev) => ({
      ...prev,
      [selectedProblem.id]: {
        codeByLanguage,
        language,
        output,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [selectedProblem, codeByLanguage, language, output]);

  useEffect(() => {
    localStorage.setItem(USER_PROGRESS_STORAGE_KEY, JSON.stringify(problemProgress));
  }, [problemProgress]);

  useEffect(() => {
    if (!isProblemModalOpen) {
      return;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeProblemModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isProblemModalOpen]);

  return (
    <div className="platform">
      <header className="platform__header">
        <div className="platform__header-row">
          <h1>Live Coding Dashboard</h1>
          <div className="platform__header-actions">
            {!selectedProblem && (
              <div className="view-switch">
                <button
                  className={`ghost-btn tab-btn ${activePage === "dashboard" ? "tab-btn--active" : ""}`}
                  onClick={() => setActivePage("dashboard")}
                >
                  Problems
                </button>
                <button
                  className={`ghost-btn tab-btn ${activePage === "clients" ? "tab-btn--active" : ""}`}
                  onClick={() => setActivePage("clients")}
                >
                  Clients
                </button>
              </div>
            )}
            <button className="ghost-btn theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? "Dark Mode" : "Light Mode"}
            </button>
          </div>
        </div>
        <p>Search problems, manage client references, and launch coding workspace instantly.</p>
      </header>

      {selectedProblem ? (
        <section className="workspace">
          <div className="workspace__topbar">
            <button className="ghost-btn" onClick={() => setSelectedProblem(null)}>
              Back to dashboard
            </button>
            <label htmlFor="language">Language</label>
            <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
              {LANGUAGES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <button className="primary-btn" onClick={executeCode}>
              Run
            </button>
            {isRunning && <span className="status status--running">Running...</span>}
          </div>

          <div className="workspace__grid">
            <article className="panel problem-panel">
              <p>{selectedProblem.statement}</p>
            </article>

            <article className="panel editor-panel">
              <h2 className="panel-title">Editor ({language})</h2>
              <div className="editor">
                <Editor
                  height="320px"
                  language={MONACO_LANGUAGE_BY_ID[language]}
                  theme={theme === "dark" ? "vs-dark" : "vs-light"}
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

            <article className="panel console-panel">
              <h2 className="panel-title">Console Output</h2>
              <pre className="console">{output.join("\n")}</pre>
            </article>
          </div>
        </section>
      ) : activePage === "clients" ? (
        <section className="panel dashboard-panel">
          <div className="clients-layout">
            <article className="panel clients-form-card">
              <h2 className="panel-title">Add Client</h2>
              <form className="client-form" onSubmit={handleAddClient}>
                <label>
                  Client Name (detail)
                  <input
                    type="text"
                    placeholder="e.g. OpenAI Enterprise"
                    value={clientForm.name}
                    onChange={(event) => {
                      const value = event.target.value;
                      setClientForm((prev) => ({
                        ...prev,
                        name: value,
                      }));
                    }}
                    required
                  />
                </label>
                <label>
                  Abbreviation
                  <input
                    type="text"
                    placeholder="e.g. OAI"
                    value={clientForm.abbreviation}
                    onChange={(event) => {
                      const value = event.target.value;
                      setClientForm((prev) => ({
                        ...prev,
                        abbreviation: value,
                      }));
                    }}
                    required
                  />
                </label>
                <button className="primary-btn" type="submit">
                  Save Client
                </button>
              </form>
            </article>

            <article className="panel clients-table-card">
              <h2 className="panel-title">Client Directory</h2>
              <table className="problem-table">
                <thead>
                  <tr>
                    <th>Abbreviation</th>
                    <th>Client Name</th>
                    <th>Used In Problems</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const usage = clientUsage[client.id] || 0;
                    const isLocked = usage > 0;
                    return (
                      <tr key={client.id}>
                        <td>
                          <span className="client-chip">{client.abbreviation}</span>
                        </td>
                        <td>{client.name}</td>
                        <td>{usage}</td>
                        <td>
                          {isLocked ? (
                            <span className="locked-chip">Locked: Remove references first</span>
                          ) : (
                            <button className="danger-btn" onClick={() => handleDeleteClient(client.id)}>
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </article>
          </div>
        </section>
      ) : (
        <section className="panel dashboard-panel">
          <div className="toolbar">
            <input
              className="search"
              type="text"
              placeholder="Search by title, client, statement, difficulty, status"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <button className="primary-btn" onClick={openAddProblemModal} disabled={!clients.length}>
              Add Problem
            </button>
          </div>
          {!clients.length && (
            <p className="hint-text">Add at least one client in the Clients page before creating problems.</p>
          )}

          <table className="problem-table">
            <thead>
              <tr>
                <th>Problem</th>
                <th>Difficulty</th>
                <th>Client</th>
                <th>Date Added</th>
                <th>Last Modified</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProblems.map((problem) => {
                const client = clientsById[problem.clientId];
                return (
                  <tr key={problem.id} className="problem-row">
                    <td>
                      <div className="problem-title">{problem.title}</div>
                      <div className="problem-statement">{problem.statement}</div>
                    </td>
                    <td>
                      <span className={`difficulty-badge difficulty-badge--${problem.difficulty.toLowerCase()}`}>
                        {problem.difficulty}
                      </span>
                    </td>
                    <td>
                      <div className="client-cell">
                        <span className="client-chip">{client?.abbreviation || "N/A"}</span>
                        <button
                          className="info-icon"
                          type="button"
                          title={client?.name || "Client not found"}
                          aria-label={client?.name || "Client not found"}
                        >
                          i
                        </button>
                      </div>
                    </td>
                    <td>{formatTimestamp(problem.createdAt)}</td>
                    <td>{formatTimestamp(problem.updatedAt)}</td>
                    <td>
                      <select
                        className="status-select"
                        value={problem.status}
                        onChange={(event) => handleStatusChange(problem.id, event.target.value)}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="primary-btn"
                          onClick={() => openProblemWorkspace(problem)}
                          disabled={problem.status !== "Active"}
                          title={problem.status !== "Active" ? "Only active problems can be opened" : "Open"}
                        >
                          Open
                        </button>
                        <button className="ghost-btn" onClick={() => openEditProblemModal(problem)}>
                          Edit
                        </button>
                        <button className="danger-btn" onClick={() => handleDeleteProblem(problem.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleProblems.length && (
                <tr>
                  <td colSpan="7">No problems found for the current search.</td>
                </tr>
              )}
            </tbody>
          </table>

          {isProblemModalOpen && (
            <div className="modal-backdrop" onClick={closeProblemModal}>
              <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal__header">
                  <h2>{modalMode === "edit" ? "Edit Problem Statement" : "Add Problem Statement"}</h2>
                  <button className="ghost-btn" type="button" onClick={closeProblemModal}>
                    Close
                  </button>
                </div>
                <form className="add-problem-form" onSubmit={handleUpsertProblem}>
                  <label>
                    Problem Title
                    <input
                      type="text"
                      placeholder="e.g. Two Sum"
                      value={problemForm.title}
                      onChange={(event) => {
                        const value = event.target.value;
                        setProblemForm((prev) => ({
                          ...prev,
                          title: value,
                        }));
                      }}
                      required
                    />
                  </label>
                  <label>
                    Difficulty
                    <select
                      value={problemForm.difficulty}
                      onChange={(event) => {
                        const value = event.target.value;
                        setProblemForm((prev) => ({
                          ...prev,
                          difficulty: value,
                        }));
                      }}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </label>
                  <label>
                    Client Name
                    <select
                      value={problemForm.clientId}
                      onChange={(event) => {
                        const value = event.target.value;
                        setProblemForm((prev) => ({
                          ...prev,
                          clientId: value,
                        }));
                      }}
                      required
                    >
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.abbreviation} - {client.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      value={problemForm.status}
                      onChange={(event) => {
                        const value = event.target.value;
                        setProblemForm((prev) => ({
                          ...prev,
                          status: value,
                        }));
                      }}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="add-problem-form__full">
                    Problem Statement
                    <textarea
                      placeholder="Describe the problem, constraints, and expected output."
                      value={problemForm.statement}
                      onChange={(event) => {
                        const value = event.target.value;
                        setProblemForm((prev) => ({
                          ...prev,
                          statement: value,
                        }));
                      }}
                      required
                    />
                  </label>
                  <div className="modal__actions">
                    <button className="ghost-btn" type="button" onClick={closeProblemModal}>
                      Cancel
                    </button>
                    <button className="primary-btn" type="submit">
                      {modalMode === "edit" ? "Save Changes" : "Save Problem"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
