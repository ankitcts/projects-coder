import React, { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import * as ts from "typescript";

const LANGUAGES = [
  { id: "js", label: "JavaScript" },
  { id: "ts", label: "TypeScript" },
  { id: "python", label: "Python" },
];

const STATUS_OPTIONS = ["Active", "Disabled", "Redundant"];

const MONACO_LANGUAGE_BY_ID = {
  js: "javascript",
  ts: "typescript",
  python: "python",
};

const LANGUAGE_LABEL_BY_ID = LANGUAGES.reduce((acc, language) => {
  acc[language.id] = language.label;
  return acc;
}, {});

const DEFAULT_CODE = {
  js: `function solve(input) {\n  console.log("Input:", input);\n  return input.length;\n}\n\nsolve("hello world");`,
  ts: `type Input = string;\n\nfunction solve(input: Input): number {\n  console.log("Input:", input);\n  return input.length;\n}\n\nsolve("hello world");`,
  python: `def solve(text: str) -> int:\n    print("Input:", text)\n    return len(text)\n\nsolve("hello world")`,
};

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

const SOLUTION_SELECTION_STORAGE_KEY = "single_user_solution_selection_v1";
const RUNTIME_USER_ID_STORAGE_KEY = "runtime_user_id_v1";
const LEGACY_SOLUTIONS_STORAGE_KEY = "single_user_problem_solutions_v1";
const LEGACY_PROGRESS_STORAGE_KEY = "single_user_problem_progress_v1";

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

const makeSolutionForm = () => ({
  title: "",
  tag: "",
  content: "",
});

const getSolutionContextKey = (problemId, language) => {
  if (!problemId || !language) {
    return "";
  }
  return `${problemId}:${language}`;
};

const getOrCreateRuntimeUserId = () => {
  if (typeof window === "undefined") {
    return "runtime-user";
  }

  const existing = localStorage.getItem(RUNTIME_USER_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `runtime-${crypto.randomUUID()}`
      : `runtime-${Date.now()}`;
  localStorage.setItem(RUNTIME_USER_ID_STORAGE_KEY, generated);
  return generated;
};

const mapSolutionsByContext = (solutions = []) => {
  return solutions.reduce((acc, solution) => {
    const key = getSolutionContextKey(solution.problemId, solution.language);
    if (!key) {
      return acc;
    }

    const normalized = {
      id: solution.id,
      problemId: solution.problemId,
      title: solution.title,
      tag: solution.tag || "General",
      language: solution.language,
      content: solution.content,
      createdAt: solution.createdAt,
      updatedAt: solution.updatedAt,
    };

    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(normalized);
    return acc;
  }, {});
};

const mapProgressByProblem = (records = []) => {
  return records.reduce((acc, record) => {
    if (!record.problemId) {
      return acc;
    }

    acc[record.problemId] = {
      codeByLanguage: record.codeByLanguage || {},
      language: record.language || "js",
      output: Array.isArray(record.output) ? record.output : [],
      updatedAt: record.updatedAtClient || record.updatedAt || new Date().toISOString(),
    };
    return acc;
  }, {});
};

const parseLegacySolutions = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(LEGACY_SOLUTIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    return Object.entries(parsed).flatMap(([contextKey, entries]) => {
      if (!Array.isArray(entries)) {
        return [];
      }

      const [problemId, language] = String(contextKey).split(":");
      if (!problemId || !language) {
        return [];
      }

      return entries
        .filter((entry) => entry && entry.content)
        .map((entry) => ({
          problemId,
          language,
          title: String(entry.title || "").trim() || "Recovered Solution",
          tag: String(entry.tag || "General").trim() || "General",
          content: String(entry.content || ""),
        }));
    });
  } catch (_error) {
    return [];
  }
};

const parseLegacyProgress = () => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(LEGACY_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch (_error) {
    return {};
  }
};

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) {
        message = payload.message;
      }
    } catch (_error) {
      // Ignore json parse errors.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

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
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [activePage, setActivePage] = useState("dashboard");
  const [clients, setClients] = useState([]);
  const [problems, setProblems] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [isProblemModalOpen, setIsProblemModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [editingProblemId, setEditingProblemId] = useState(null);
  const [isSolutionModalOpen, setIsSolutionModalOpen] = useState(false);
  const [solutionModalProblemId, setSolutionModalProblemId] = useState(null);
  const [solutionModalLanguage, setSolutionModalLanguage] = useState("js");
  const [editingModalSolutionId, setEditingModalSolutionId] = useState(null);
  const [problemForm, setProblemForm] = useState(makeProblemForm(""));
  const [clientForm, setClientForm] = useState(makeClientForm);
  const [language, setLanguage] = useState("js");
  const [isSolutionsDrawerOpen, setIsSolutionsDrawerOpen] = useState(false);
  const [solutionsDrawerSide, setSolutionsDrawerSide] = useState("left");
  const [solutionsDrawerWidth, setSolutionsDrawerWidth] = useState(40);
  const [runtimeUserId] = useState(getOrCreateRuntimeUserId);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 1024 : false
  );
  const [codeByLanguage, setCodeByLanguage] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState(["Pick a problem to begin."]);
  const [solutionModalForm, setSolutionModalForm] = useState(makeSolutionForm);
  const [problemSolutions, setProblemSolutions] = useState({});
  const [selectedSolutionByContext, setSelectedSolutionByContext] = useState(() => {
    try {
      const raw = localStorage.getItem(SOLUTION_SELECTION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  });
  const [problemProgress, setProblemProgress] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const debounceTimerRef = useRef();
  const progressPersistTimerRef = useRef();
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

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setIsDataLoading(true);
        setDataError("");

        const [fetchedClients, fetchedProblems, fetchedSolutions, fetchedProgress] = await Promise.all([
          apiRequest("/api/clients"),
          apiRequest("/api/problems"),
          apiRequest("/api/solutions"),
          apiRequest(`/api/progress?userId=${encodeURIComponent(runtimeUserId)}`),
        ]);

        if (!isMounted) {
          return;
        }

        let nextSolutions = fetchedSolutions || [];
        let nextProgress = fetchedProgress || [];

        if (!nextProgress.length) {
          const legacyProgress = parseLegacyProgress();
          const progressEntries = Object.entries(legacyProgress);
          if (progressEntries.length) {
            await Promise.all(
              progressEntries.map(([problemId, payload]) =>
                apiRequest(`/api/progress/${problemId}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    userId: runtimeUserId,
                    codeByLanguage: payload?.codeByLanguage || {},
                    language: payload?.language || "js",
                    output: Array.isArray(payload?.output) ? payload.output : [],
                    updatedAt: payload?.updatedAt || new Date().toISOString(),
                  }),
                }).catch(() => null)
              )
            );
            nextProgress = await apiRequest(`/api/progress?userId=${encodeURIComponent(runtimeUserId)}`);
          }
        }

        if (!nextSolutions.length) {
          const legacySolutions = parseLegacySolutions();
          if (legacySolutions.length) {
            await Promise.all(
              legacySolutions.map((solution) =>
                apiRequest("/api/solutions", {
                  method: "POST",
                  body: JSON.stringify(solution),
                }).catch(() => null)
              )
            );
            nextSolutions = await apiRequest("/api/solutions");
          }
        }

        setClients(fetchedClients || []);
        setProblems(fetchedProblems || []);
        setProblemSolutions(mapSolutionsByContext(nextSolutions));
        setProblemProgress(mapProgressByProblem(nextProgress));
        setProblemForm((prev) => ({
          ...prev,
          clientId: prev.clientId || fetchedClients?.[0]?.id || "",
        }));
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setDataError(error.message || "Failed to load data.");
      } finally {
        if (isMounted) {
          setIsDataLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [runtimeUserId]);

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
  const liveSolutionSelectionKey = selectedProblem ? `live:${selectedProblem.id}` : "";
  const solutionModalProblem = useMemo(() => {
    if (!solutionModalProblemId) {
      return null;
    }
    return problems.find((problem) => problem.id === solutionModalProblemId) || null;
  }, [problems, solutionModalProblemId]);
  const solutionModalContextKey = solutionModalProblem
    ? getSolutionContextKey(solutionModalProblem.id, solutionModalLanguage)
    : "";
  const liveSolutionsForProblem = useMemo(() => {
    if (!selectedProblem) {
      return [];
    }

    const prefix = `${selectedProblem.id}:`;
    return Object.entries(problemSolutions).flatMap(([key, entries]) => {
      if (!key.startsWith(prefix) || !Array.isArray(entries)) {
        return [];
      }

      const contextLanguage = key.slice(prefix.length);
      return entries.map((entry) => ({
        ...entry,
        contextLanguage: contextLanguage || entry.language || "js",
      }));
    });
  }, [selectedProblem, problemSolutions]);
  const solutionsForModalContext = solutionModalContextKey ? problemSolutions[solutionModalContextKey] || [] : [];
  const selectedSolutionId = selectedSolutionByContext[liveSolutionSelectionKey] || "";
  const selectedModalSolutionId = selectedSolutionByContext[solutionModalContextKey] || "";
  const activeSolution = liveSolutionsForProblem.find((entry) => entry.id === selectedSolutionId) || null;
  const activeModalSolution = solutionsForModalContext.find((entry) => entry.id === selectedModalSolutionId) || null;

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
    setIsSolutionsDrawerOpen(true);
    setSolutionsDrawerSide("left");
    setSolutionsDrawerWidth(40);
    setSelectedProblem(problem);
  };

  const appendSolutionToContext = async (contextKey, targetLanguage, formValue, existingCount) => {
    if (!contextKey) {
      return null;
    }

    const [problemId] = contextKey.split(":");
    if (!problemId) {
      return null;
    }

    const title = formValue.title.trim() || `Solution ${existingCount + 1}`;
    const tag = formValue.tag.trim() || "General";
    const content = formValue.content.trim();

    if (!content) {
      return null;
    }

    const created = await apiRequest("/api/solutions", {
      method: "POST",
      body: JSON.stringify({
        problemId,
        language: targetLanguage,
        title,
        tag,
        content,
      }),
    });

    const item = {
      id: created.id,
      problemId: created.problemId,
      title: created.title,
      tag: created.tag,
      language: created.language,
      content: created.content,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };

    setProblemSolutions((prev) => ({
      ...prev,
      [contextKey]: [item, ...(prev[contextKey] || [])],
    }));

    setSelectedSolutionByContext((prev) => ({
      ...prev,
      [contextKey]: item.id,
    }));

    return item;
  };

  const handleAddSolutionFromModal = async (event) => {
    event.preventDefault();
    try {
      if (editingModalSolutionId) {
        const title = solutionModalForm.title.trim();
        const tag = solutionModalForm.tag.trim() || "General";
        const content = solutionModalForm.content.trim();

        if (!title || !content || !solutionModalContextKey) {
          return;
        }

        const updated = await apiRequest(`/api/solutions/${editingModalSolutionId}`, {
          method: "PUT",
          body: JSON.stringify({
            language: solutionModalLanguage,
            title,
            tag,
            content,
          }),
        });

        setProblemSolutions((prev) => ({
          ...prev,
          [solutionModalContextKey]: (prev[solutionModalContextKey] || []).map((entry) =>
            entry.id === editingModalSolutionId
              ? {
                  ...entry,
                  title: updated.title,
                  tag: updated.tag,
                  content: updated.content,
                  language: updated.language,
                  updatedAt: updated.updatedAt,
                }
              : entry
          ),
        }));

        setSelectedSolutionByContext((prev) => ({
          ...prev,
          [solutionModalContextKey]: editingModalSolutionId,
        }));
        setEditingModalSolutionId(null);
        setSolutionModalForm(makeSolutionForm());
        return;
      }

      await appendSolutionToContext(
        solutionModalContextKey,
        solutionModalLanguage,
        solutionModalForm,
        solutionsForModalContext.length
      );
      setSolutionModalForm(makeSolutionForm());
    } catch (error) {
      window.alert(error.message || "Failed to save solution.");
    }
  };

  const handleEditSolutionFromModal = () => {
    if (!activeModalSolution) {
      return;
    }

    setEditingModalSolutionId(activeModalSolution.id);
    setSolutionModalForm({
      title: activeModalSolution.title || "",
      tag: activeModalSolution.tag || "",
      content: activeModalSolution.content || "",
    });
  };

  const handleCancelSolutionEdit = () => {
    setEditingModalSolutionId(null);
    setSolutionModalForm(makeSolutionForm());
  };

  const handleSelectSolution = (solutionId, contextKey = liveSolutionSelectionKey) => {
    if (!contextKey) {
      return;
    }
    setSelectedSolutionByContext((prev) => ({
      ...prev,
      [contextKey]: solutionId,
    }));
  };

  const closeProblemModal = () => {
    setIsProblemModalOpen(false);
    setEditingProblemId(null);
    setProblemForm(makeProblemForm(clients[0]?.id || ""));
  };

  const closeSolutionModal = () => {
    setIsSolutionModalOpen(false);
    setSolutionModalProblemId(null);
    setSolutionModalLanguage("js");
    setEditingModalSolutionId(null);
    setSolutionModalForm(makeSolutionForm());
  };

  const openSolutionModal = (problem) => {
    setSolutionModalProblemId(problem.id);
    setSolutionModalLanguage("js");
    setEditingModalSolutionId(null);
    setSolutionModalForm(makeSolutionForm());
    setIsSolutionModalOpen(true);
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

  const handleUpsertProblem = async (event) => {
    event.preventDefault();
    const title = problemForm.title.trim();
    const statement = problemForm.statement.trim();

    if (!title || !statement || !problemForm.clientId) {
      return;
    }

    if (!clientsById[problemForm.clientId]) {
      return;
    }

    try {
      if (modalMode === "edit" && editingProblemId) {
        const updated = await apiRequest(`/api/problems/${editingProblemId}`, {
          method: "PUT",
          body: JSON.stringify({
            title,
            statement,
            difficulty: problemForm.difficulty,
            clientId: problemForm.clientId,
            status: problemForm.status,
          }),
        });

        setProblems((prev) =>
          prev.map((problem) => (problem.id === editingProblemId ? updated : problem))
        );
        closeProblemModal();
        return;
      }

      const created = await apiRequest("/api/problems", {
        method: "POST",
        body: JSON.stringify({
          title,
          statement,
          difficulty: problemForm.difficulty,
          clientId: problemForm.clientId,
          status: problemForm.status,
        }),
      });

      setProblems((prev) => [created, ...prev]);
      closeProblemModal();
    } catch (error) {
      window.alert(error.message || "Failed to save problem.");
    }
  };

  const handleDeleteProblem = async (problemId) => {
    const target = problems.find((problem) => problem.id === problemId);
    if (!target) {
      return;
    }

    const shouldDelete = window.confirm(`Delete problem \"${target.title}\"?`);
    if (!shouldDelete) {
      return;
    }

    try {
      await apiRequest(`/api/problems/${problemId}`, {
        method: "DELETE",
      });
    } catch (error) {
      window.alert(error.message || "Failed to delete problem.");
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

  const handleStatusChange = async (problemId, nextStatus) => {
    try {
      const updated = await apiRequest(`/api/problems/${problemId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });

      setProblems((prev) => prev.map((problem) => (problem.id === problemId ? updated : problem)));
    } catch (error) {
      window.alert(error.message || "Failed to update problem status.");
    }
  };

  const handleAddClient = async (event) => {
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

    try {
      const created = await apiRequest("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          name,
          abbreviation,
        }),
      });

      setClients((prev) => [...prev, created]);
      setClientForm(makeClientForm());
    } catch (error) {
      window.alert(error.message || "Failed to add client.");
    }
  };

  const handleDeleteClient = async (clientId) => {
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

    try {
      await apiRequest(`/api/clients/${clientId}`, {
        method: "DELETE",
      });
    } catch (error) {
      window.alert(error.message || "Failed to delete client.");
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
    localStorage.setItem(SOLUTION_SELECTION_STORAGE_KEY, JSON.stringify(selectedSolutionByContext));
  }, [selectedSolutionByContext]);

  useEffect(() => {
    if (!selectedProblem || !runtimeUserId) {
      return;
    }

    clearTimeout(progressPersistTimerRef.current);
    progressPersistTimerRef.current = setTimeout(async () => {
      try {
        await apiRequest(`/api/progress/${selectedProblem.id}`, {
          method: "PUT",
          body: JSON.stringify({
            userId: runtimeUserId,
            codeByLanguage,
            language,
            output,
            updatedAt: new Date().toISOString(),
          }),
        });
      } catch (error) {
        console.error("Failed to persist progress:", error);
      }
    }, 700);

    return () => clearTimeout(progressPersistTimerRef.current);
  }, [selectedProblem, runtimeUserId, codeByLanguage, language, output]);

  useEffect(() => {
    if (!liveSolutionSelectionKey) {
      return;
    }
    if (!selectedSolutionId) {
      return;
    }
    const exists = liveSolutionsForProblem.some((entry) => entry.id === selectedSolutionId);
    if (!exists) {
      setSelectedSolutionByContext((prev) => ({
        ...prev,
        [liveSolutionSelectionKey]: "",
      }));
    }
  }, [liveSolutionSelectionKey, liveSolutionsForProblem, selectedSolutionId]);

  useEffect(() => {
    if (!solutionModalContextKey || !selectedModalSolutionId) {
      return;
    }
    const exists = solutionsForModalContext.some((entry) => entry.id === selectedModalSolutionId);
    if (!exists) {
      setSelectedSolutionByContext((prev) => ({
        ...prev,
        [solutionModalContextKey]: "",
      }));
    }
  }, [solutionModalContextKey, solutionsForModalContext, selectedModalSolutionId]);

  useEffect(() => {
    if (!isSolutionModalOpen) {
      return;
    }
    setEditingModalSolutionId(null);
    setSolutionModalForm(makeSolutionForm());
  }, [solutionModalLanguage, isSolutionModalOpen]);

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth <= 1024);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isProblemModalOpen && !isSolutionModalOpen) {
      if (!isSolutionsDrawerOpen || !isMobileViewport) {
        return;
      }
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (isProblemModalOpen) {
          closeProblemModal();
        }
        if (isSolutionModalOpen) {
          closeSolutionModal();
        }
        if (isSolutionsDrawerOpen && isMobileViewport) {
          setIsSolutionsDrawerOpen(false);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isProblemModalOpen, isSolutionModalOpen, isSolutionsDrawerOpen, isMobileViewport]);

  const solutionsPanelContent = (
    <>
      <h3 className="solutions-panel__title">Solutions (All Languages)</h3>
      <select
        className="solutions-select"
        value={selectedSolutionId}
        onChange={(event) => handleSelectSolution(event.target.value, liveSolutionSelectionKey)}
      >
        <option value="">Select solution</option>
        {liveSolutionsForProblem.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.title} - {LANGUAGE_LABEL_BY_ID[entry.contextLanguage] || entry.contextLanguage}
          </option>
        ))}
      </select>
      {selectedSolutionId && activeSolution ? (
        <div className="solution-preview solution-preview--live">
          <div className="solution-meta">
            <strong>{activeSolution.title}</strong>
            <span>{activeSolution.tag}</span>
          </div>
          <div className="solution-readonly-editor">
            <Editor
              height="100%"
              language={MONACO_LANGUAGE_BY_ID[activeSolution.contextLanguage || activeSolution.language || "js"]}
              theme={theme === "dark" ? "vs-dark" : "vs-light"}
              value={activeSolution.content || ""}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>
      ) : (
        <p className="hint-text">Select a solution from the dropdown to view details.</p>
      )}
    </>
  );

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

      {isDataLoading && <p className="hint-text">Loading dashboard data from MongoDB...</p>}
      {dataError && <p className="hint-text">{dataError}</p>}

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
            <button className="ghost-btn" onClick={() => setIsSolutionsDrawerOpen((prev) => !prev)}>
              {isSolutionsDrawerOpen ? "Hide Solutions" : "Solutions"}
            </button>
            {isSolutionsDrawerOpen && (
              <button
                className="ghost-btn"
                onClick={() => setSolutionsDrawerSide((prev) => (prev === "right" ? "left" : "right"))}
              >
                {solutionsDrawerSide === "right" ? "Dock Left" : "Dock Right"}
              </button>
            )}
            {isSolutionsDrawerOpen && (
              <label className="drawer-width-control">
                Drawer Width
                <input
                  type="range"
                  min="30"
                  max="70"
                  step="1"
                  value={solutionsDrawerWidth}
                  onChange={(event) => setSolutionsDrawerWidth(Number(event.target.value))}
                />
                <span>{solutionsDrawerWidth}%</span>
              </label>
            )}
            {isRunning && <span className="status status--running">Running...</span>}
          </div>

          <div className="workspace__grid">
            <article className="panel problem-panel">
              <p>{selectedProblem.statement}</p>
            </article>

            <article className="panel editor-panel">
              <h2 className="panel-title">Editor ({language})</h2>
              <div
                className={`editor-with-solutions ${
                  isSolutionsDrawerOpen
                    ? `editor-with-solutions--drawer-open editor-with-solutions--${solutionsDrawerSide}`
                    : ""
                }`}
              >
                <div className="editor">
                  <Editor
                    height="100%"
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
              </div>
            </article>

            <article className="panel console-panel">
              <h2 className="panel-title">Console Output</h2>
              <pre className="console">{output.join("\n")}</pre>
            </article>
          </div>
          {isSolutionsDrawerOpen && !isMobileViewport && (
            <aside
              className={`solutions-panel solutions-panel--drawer solutions-panel--${solutionsDrawerSide}`}
              style={{ "--solutions-drawer-width": `${solutionsDrawerWidth}%` }}
            >
              {solutionsPanelContent}
            </aside>
          )}
          {isSolutionsDrawerOpen && isMobileViewport && (
            <div className="modal-backdrop modal-backdrop--fullscreen" onClick={() => setIsSolutionsDrawerOpen(false)}>
              <div className="modal modal--mobile-solutions" onClick={(event) => event.stopPropagation()}>
                <div className="modal__header">
                  <h2>Solutions</h2>
                  <button className="ghost-btn" type="button" onClick={() => setIsSolutionsDrawerOpen(false)}>
                    Close
                  </button>
                </div>
                <div className="solutions-panel solutions-panel--modal">{solutionsPanelContent}</div>
              </div>
            </div>
          )}
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
              <div className="table-scroll">
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
              </div>
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

          <div className="table-scroll">
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
                          <div className="client-info">
                            <button
                              className="info-icon"
                              type="button"
                              aria-label={client?.name || "Client not found"}
                            >
                              i
                            </button>
                            <span className="client-tooltip">{client?.name || "Client not found"}</span>
                          </div>
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
                            className="primary-btn action-icon-btn"
                            onClick={() => openProblemWorkspace(problem)}
                            disabled={problem.status !== "Active"}
                            title={problem.status !== "Active" ? "Open: only active problems can be opened" : "Open Problem"}
                            aria-label={problem.status !== "Active" ? "Open problem disabled" : "Open problem"}
                          >
                            <span aria-hidden="true">▶</span>
                          </button>
                          <button
                            className="ghost-btn action-icon-btn"
                            onClick={() => openEditProblemModal(problem)}
                            title="Edit Problem"
                            aria-label="Edit problem"
                          >
                            <span aria-hidden="true">✎</span>
                          </button>
                          <button
                            className="ghost-btn action-icon-btn"
                            onClick={() => openSolutionModal(problem)}
                            title="Manage Solutions"
                            aria-label="Manage solutions"
                          >
                            <span aria-hidden="true">☰</span>
                          </button>
                          <button
                            className="danger-btn action-icon-btn"
                            onClick={() => handleDeleteProblem(problem.id)}
                            title="Delete Problem"
                            aria-label="Delete problem"
                          >
                            <span aria-hidden="true">✕</span>
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
          </div>

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
          {isSolutionModalOpen && solutionModalProblem && (
            <div className="modal-backdrop modal-backdrop--fullscreen" onClick={closeSolutionModal}>
              <div className="modal modal--fullscreen" onClick={(event) => event.stopPropagation()}>
                <div className="modal__header">
                  <h2>Add Solutions - {solutionModalProblem.title}</h2>
                  <button className="ghost-btn" type="button" onClick={closeSolutionModal}>
                    Close
                  </button>
                </div>
                <div className="solutions-modal-layout">
                  <form className="solutions-form" onSubmit={handleAddSolutionFromModal}>
                    <label>
                      Language
                      <select
                        className="solutions-select"
                        value={solutionModalLanguage}
                        onChange={(event) => setSolutionModalLanguage(event.target.value)}
                      >
                        {LANGUAGES.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      type="text"
                      placeholder="Solution title"
                      value={solutionModalForm.title}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSolutionModalForm((prev) => ({ ...prev, title: value }));
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Tag (e.g. DP)"
                      value={solutionModalForm.tag}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSolutionModalForm((prev) => ({ ...prev, tag: value }));
                      }}
                    />
                    <textarea
                      hidden
                      value={solutionModalForm.content}
                      readOnly
                    />
                    <div className="solutions-editor">
                      <Editor
                        height="360px"
                        language={MONACO_LANGUAGE_BY_ID[solutionModalLanguage]}
                        theme={theme === "dark" ? "vs-dark" : "vs-light"}
                        value={solutionModalForm.content}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          tabSize: 2,
                          automaticLayout: true,
                        }}
                        onChange={(value) => {
                          setSolutionModalForm((prev) => ({ ...prev, content: value || "" }));
                        }}
                      />
                    </div>
                    <button className="primary-btn" type="submit">
                      {editingModalSolutionId ? "Save Changes" : "Save Solution"}
                    </button>
                    {editingModalSolutionId && (
                      <button className="ghost-btn" type="button" onClick={handleCancelSolutionEdit}>
                        Cancel Edit
                      </button>
                    )}
                  </form>
                  <div className="solutions-modal-preview">
                    <h3 className="solutions-panel__title">Saved ({solutionModalLanguage})</h3>
                    <select
                      className="solutions-select"
                      value={selectedModalSolutionId}
                      onChange={(event) => handleSelectSolution(event.target.value, solutionModalContextKey)}
                    >
                      <option value="">Select solution</option>
                      {solutionsForModalContext.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.title} [{entry.tag}]
                        </option>
                      ))}
                    </select>
                    {selectedModalSolutionId && activeModalSolution ? (
                      <div className="table-actions">
                        <button className="ghost-btn" type="button" onClick={handleEditSolutionFromModal}>
                          Edit Selected
                        </button>
                      </div>
                    ) : null}
                    {selectedModalSolutionId && activeModalSolution ? (
                      <div className="solution-preview">
                        <div className="solution-meta">
                          <strong>{activeModalSolution.title}</strong>
                          <span>{activeModalSolution.tag}</span>
                        </div>
                        <pre>{activeModalSolution.content}</pre>
                      </div>
                    ) : (
                      <p className="hint-text">
                        {solutionsForModalContext.length
                          ? "Select a saved solution to preview or edit."
                          : "No saved solutions for this language yet."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
