// src/pages/Train.jsx
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { API_BASE } from "../api";
import { HyParamRules } from "./HyParamRules";

const BASE_MODELS = ["LightGBM", "XGBoost", "CatBoost"];

const DEFAULT_HP = {
  LightGBM: { n_estimators: 500, num_leaves: 31, learning_rate: 0.1, max_depth: -1 },
  XGBoost: {
    n_estimators: 400,
    max_depth: 6,
    learning_rate: 0.1,
    subsample: 0.8,
    colsample_bytree: 0.8,
    reg_lambda: 1.0,
  },
  CatBoost: { iterations: 500, depth: 6, learning_rate: 0.1, l2_leaf_reg: 3.0 },
};

const PARAM_OPTIONS = {
  criterion: ["gini", "entropy", "log_loss"],
};

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

export default function Train() {
  const [datasets, setDatasets] = useState([]);
  const [uploadedDatasets, setUploadedDatasets] = useState([]);
  const [models, setModels] = useState([{ name: "LCCDE", type: "ensemble" }]);
  const [selectedModel, setSelectedModel] = useState("LCCDE");
  const [customParams, setCustomParams] = useState({});
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [sessionRuns, setSessionRuns] = useState([]);
  const [recentRuns, setRecentRuns] = useState([]);
  const [paramsByModel, setParamsByModel] = useState(() => deepClone(DEFAULT_HP));
  const [isRunning, setIsRunning] = useState(false);
  const [runController, setRunController] = useState(null);

  // Debug: log sessionRuns changes to help diagnose rendering issues
  useEffect(() => {
    try {
      // Keep logs readable but avoid spamming in production
      if (sessionRuns && sessionRuns.length > 0) {
        // eslint-disable-next-line no-console
        console.debug("[Train] sessionRuns updated:", sessionRuns);
      } else {
        // eslint-disable-next-line no-console
        console.debug("[Train] sessionRuns is empty");
      }
    } catch (e) {
      // ignore logging errors
    }
  }, [sessionRuns]);

  // Load the most recent experiments from the backend (limit 3)
  const loadRecentRuns = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/experiments?limit=3`);
      const data = await res.json();
      setRecentRuns(data.results || []);
    } catch (err) {
      console.error("Failed to load recent runs", err);
    }
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/datasets`)
      .then((res) => res.json())
      .then((data) => {
        setDatasets(data.datasets || []);
        setUploadedDatasets(data.uploads || []);
      })
      .catch((err) => console.error("Failed to load datasets", err));
  }, []);

  // Prefill from hash query if present (e.g., #/train?model=...&dataset=...&params=...)
  useEffect(() => {
    try {
      const hash = window.location.hash || "";
      const qidx = hash.indexOf("?");
      if (qidx === -1) return;
      const qs = hash.slice(qidx + 1);
      const sp = new URLSearchParams(qs);
      const model = sp.get("model");
      const dataset = sp.get("dataset");
      const paramsRaw = sp.get("params");
      if (model) {
        setSelectedModel(model);
      }
      if (dataset) {
        setSelectedDatasets([dataset]);
      }
      if (paramsRaw) {
        let parsed = {};
        try {
          const decoded = decodeURIComponent(paramsRaw);
          parsed = JSON.parse(decoded || "{}");
        } catch (err) {
          try {
            parsed = JSON.parse(paramsRaw);
          } catch (e) {
            parsed = {};
          }
        }
        // If LCCDE (ensemble), expect nested lgb_params/xgb_params/cbt_params
        if ((model === "LCCDE" || !model) && (parsed.lgb_params || parsed.xgb_params || parsed.cbt_params)) {
          setParamsByModel((prev) => ({
            ...prev,
            LightGBM: parsed.lgb_params || prev.LightGBM,
            XGBoost: parsed.xgb_params || prev.XGBoost,
            CatBoost: parsed.cbt_params || prev.CatBoost,
          }));
        } else if (model && model !== "LCCDE") {
          // Custom model: set customParams for that model name
          setCustomParams((prev) => ({ ...prev, [model]: parsed }));
        }
      }
    } catch (err) {
      // ignore parsing errors
      console.error("Failed to parse train prefill params:", err);
    }
  }, []);

  // Session runs should only contain results produced during this client session.
  // Also load the 3 most recent experiments from the backend for quick access.
  useEffect(() => {
    loadRecentRuns();
  }, []);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/models`);
        const data = await res.json();
        const list = data.models || [{ name: "LCCDE", type: "ensemble" }];
        setModels(list);
        const defaults = {};
        list
          .filter((m) => m.name !== "LCCDE")
          .forEach((m) => {
            defaults[m.name] = { ...(m.hyperparams || {}) };
          });
        // Merge defaults into existing customParams without overwriting user-edited
        // values or existing empty entries. Only fill keys that are missing.
        setCustomParams((prev) => {
          const next = { ...prev };
          Object.keys(defaults).forEach((k) => {
            if (!Object.prototype.hasOwnProperty.call(next, k) || next[k] === undefined || next[k] === null || (typeof next[k] === 'object' && Object.keys(next[k]).length === 0)) {
              next[k] = defaults[k];
            }
          });
          return next;
        });
        if (!list.find((m) => m.name === selectedModel)) {
          setSelectedModel("LCCDE");
        }
      } catch (err) {
        console.error("Failed to load models", err);
      }
    };
    loadModels();
  }, [selectedModel]);

  const toggle = (arr, setArr, value) =>
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);

  const canRun = selectedDatasets.length > 0;

  const resetSelectedParams = () => setParamsByModel(() => deepClone(DEFAULT_HP));

  const resetToDefaults = () => {
    // Reset defaults for the currently selected model
    if (selectedModel === "LCCDE") {
      setParamsByModel(() => deepClone(DEFAULT_HP));
      toast.success("Reset LightGBM/XGBoost/CatBoost to defaults");
      return;
    }

    const found = models.find((m) => m.name === selectedModel);
    const defaults = (found && (found.hyperparams || {})) || {};
    setCustomParams((prev) => ({ ...prev, [selectedModel]: deepClone(defaults) }));
    toast.success(`Reset ${selectedModel} hyperparameters to defaults`);
  };

  const allValid =
    selectedModel === "LCCDE" &&
    BASE_MODELS.every((model) => {
      const params = paramsByModel[model];
      const rules = HyParamRules[model];

      return Object.keys(rules).every((key) => {
        const val = params[key];
        if (val === "" || val === null || val === undefined) return false;

        const min = rules[key].min?.value;
        const max = rules[key].max?.value;

        if (typeof val !== "number" || Number.isNaN(val)) return false;
        if (min !== undefined && val < min) return false;
        if (max !== undefined && val > max) return false;

        return true;
      });
    });

  const handleUploadClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ipynb,.py";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        toast.loading("Uploading model...", { id: "upload" });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("name", file.name.replace(/\.(ipynb|py)$/i, ""));

        const res = await fetch(`${API_BASE}/api/models/upload`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (data.error) {
          toast.error(data.error, { id: "upload" });
          return;
        }

        const refreshed = await fetch(`${API_BASE}/api/models`).then((r) => r.json());
        const list = refreshed.models || [];
        setModels(list);
        list
          .filter((m) => m.name !== "LCCDE")
          .forEach((m) => {
            setCustomParams((prev) => ({ ...prev, [m.name]: { ...(m.hyperparams || {}) } }));
          });
        if (data.model?.name) {
          setSelectedModel(data.model.name);
        }
        toast.success("Model uploaded", { id: "upload" });
      } catch (err) {
        console.error(err);
        toast.error("Upload failed", { id: "upload" });
      }
    };
    input.click();
  };

  const runNow = async () => {
    if (!canRun) {
      toast.error("Please select at least one dataset.");
      return;
    }
    if (selectedModel === "LCCDE" && !allValid) {
      toast.error("Please fix invalid hyperparameters first.");
      return;
    }
    // Create an AbortController so the run can be cancelled
    const controller = new AbortController();
    setRunController(controller);
    setIsRunning(true);
    toast.loading("Running model...", { id: "run-status" });
    const results = [];

    for (const ds of selectedDatasets) {
      if (controller.signal.aborted) break;
      try {
        const body =
          selectedModel === "LCCDE"
            ? {
                model_name: "LCCDE",
                dataset: ds,
                lgb_params: paramsByModel.LightGBM,
                xgb_params: paramsByModel.XGBoost,
                cbt_params: paramsByModel.CatBoost,
              }
            : {
                model_name: selectedModel,
                dataset: ds,
                params: customParams[selectedModel] || {},
              };
        const res = await fetch(`${API_BASE}/train_model`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json();

        if (data.error) {
          results.push({ dataset: ds, model: selectedModel, metrics: { error: data.error } });
          toast.error(`Error running ${ds}: ${data.error}`);
          continue;
        }

        results.push({
          id: data.run_id || Date.now() + Math.random(),
          dataset: ds,
          model: selectedModel,
          metrics: data.metrics,
          duration_s: data.duration_s,
          params: body,
          created_at: data.created_at,
        });
        toast.success(`Finished training ${selectedModel} on ${ds}!`);
      } catch (err) {
        // Handle user-initiated abort differently for clarity
        if (err && err.name === "AbortError") {
          toast('Run cancelled', { id: 'run-status' });
          break;
        }
        console.error("Training failed:", err);
        results.push({ dataset: ds, model: selectedModel, metrics: { error: err.message } });
        toast.error(`Training failed on ${ds}: ${err.message}`);
      }
    }
    // Prepend new results so newest appear first in session results
    // Normalize shapes of results we just collected
    const normalized = results.map((r) => ({
      id: r.id,
      dataset: r.dataset || r.params?.dataset || "",
      model: r.model,
      metrics: r.metrics || r.results || {},
      created_at: r.created_at,
    }));

    // Debug: log the raw results and normalized payload so we can trace issues
    try {
      // eslint-disable-next-line no-console
      console.debug("[Train] raw results:", results);
      // eslint-disable-next-line no-console
      console.debug("[Train] normalized session entries to add:", normalized);
    } catch (e) {
      // ignore logging errors
    }

    setSessionRuns((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      return [...normalized, ...next];
    });
    // Refresh the Recent Results list from the server so it includes saved runs
    try {
      loadRecentRuns();
    } catch (e) {
      // non-fatal
    }
    // Clear running state
    setIsRunning(false);
    setRunController(null);
    toast.success("All tasks completed!", { id: "run-status" });
  };

  const cancelRun = () => {
    if (runController) {
      // Signal client-side abort
      runController.abort();
      // Also request server-side cancellation
      fetch(`${API_BASE}/api/cancel`, { method: 'POST' }).catch(() => {});
      setIsRunning(false);
      setRunController(null);
      toast('Cancelling run...', { id: 'run-status' });
    }
  };

  // Rerun a session result: prefill the train form with the run's params
  const rerunFromSession = (run) => {
    try {
      if (!run) return;
      setSelectedModel(run.model || "LCCDE");
      if (run.dataset) setSelectedDatasets([run.dataset]);

      // If run.params contains ensemble subparams
      const p = run.params || {};
      if (p.lgb_params || p.xgb_params || p.cbt_params) {
        setParamsByModel((prev) => ({
          ...prev,
          LightGBM: p.lgb_params || prev.LightGBM,
          XGBoost: p.xgb_params || prev.XGBoost,
          CatBoost: p.cbt_params || prev.CatBoost,
        }));
      } else if (p.params) {
        // custom model params
        setCustomParams((prev) => ({ ...prev, [run.model]: p.params }));
      }
      // scroll to Run section to make it obvious
      const runHead = document.querySelector('.section__title');
      if (runHead) runHead.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('Failed to prefill run params:', err);
    }
  };

  return (
    <>
      {/* Dataset Selection */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Select Datasets</h2>
          <div className="toolbar">
            <button
              className="btn"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    toast.loading('Uploading dataset...', { id: 'upload-ds' });
                    const fd = new FormData();
                    fd.append('file', file);
                    const res = await fetch(`${API_BASE}/api/datasets/upload`, {
                      method: 'POST',
                      body: fd,
                    });
                    const data = await res.json();
                    if (data.error) {
                      toast.error(data.error, { id: 'upload-ds' });
                      return;
                    }
                    // Refresh dataset list
                    const refreshed = await fetch(`${API_BASE}/api/datasets`).then((r) => r.json());
                    setDatasets(refreshed.datasets || []);
                    setUploadedDatasets(refreshed.uploads || []);
                    toast.success('Dataset uploaded', { id: 'upload-ds' });
                  } catch (err) {
                    console.error(err);
                    toast.error('Upload failed', { id: 'upload-ds' });
                  }
                };
                input.click();
              }}
            >
              Upload Dataset
            </button>
            <button
              className="btn"
              onClick={async () => {
                // Only allow deletion of user-uploaded datasets
                const deletable = (selectedDatasets || []).filter((d) => uploadedDatasets.includes(d));
                if (!deletable || deletable.length === 0) {
                  toast.error('No uploaded datasets selected to remove.');
                  return;
                }
                const ok = window.confirm(
                  `Delete ${deletable.length} selected uploaded dataset(s)? This cannot be undone.`
                );
                if (!ok) return;

                try {
                  toast.loading('Removing selected datasets...', { id: 'remove-selected' });
                  for (const ds of deletable) {
                    /* eslint-disable no-await-in-loop */
                    const res = await fetch(`${API_BASE}/api/datasets/${encodeURIComponent(ds)}`, {
                      method: 'DELETE',
                    });
                    const data = await res.json();
                    if (data?.error) {
                      // show but continue with other deletions
                      toast.error(`Failed to delete ${ds}: ${data.error}`);
                    }
                    /* eslint-enable no-await-in-loop */
                  }
                  const refreshed = await fetch(`${API_BASE}/api/datasets`).then((r) => r.json());
                  setDatasets(refreshed.datasets || []);
                  setUploadedDatasets(refreshed.uploads || []);
                  setSelectedDatasets([]);
                  toast.success('Selected datasets removed', { id: 'remove-selected' });
                } catch (err) {
                  console.error('Remove selected failed', err);
                  toast.error('Failed to remove selected datasets', { id: 'remove-selected' });
                }
              }}
            >
              Remove Selected
            </button>
          </div>
        </div>

        <div className="card grid">
          {datasets.map((ds) => (
            <label key={ds} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedDatasets.includes(ds)}
                onChange={() => toggle(selectedDatasets, setSelectedDatasets, ds)}
              />
              <span>{ds.replace('.csv', '')}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Models + Hyperparameters */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Ensembles and Models</h2>
          <div className="toolbar">
            <button className="btn" onClick={handleUploadClick}>
              Upload Model
            </button>
            <button
              className="btn"
              onClick={async () => {
                const sel = models.find((mm) => mm.name === selectedModel);
                if (!sel || sel.name === "LCCDE" || sel.type !== "custom") {
                  toast.error("No custom model selected to delete.");
                  return;
                }
                const ok = window.confirm(
                  `Delete model '${sel.name}'? This action cannot be undone.`
                );
                if (!ok) return;
                try {
                  toast.loading("Deleting model...", { id: "delete" });
                  const res = await fetch(`${API_BASE}/api/models/${encodeURIComponent(sel.name)}`, {
                    method: "DELETE",
                  });
                  const data = await res.json();
                  if (data.error) {
                    toast.error(data.error, { id: "delete" });
                    return;
                  }
                  const refreshed = await fetch(`${API_BASE}/api/models`).then((r) => r.json());
                  const list = refreshed.models || [];
                  setModels(list);
                  setSelectedModel("LCCDE");
                  toast.success("Model deleted", { id: "delete" });
                } catch (err) {
                  console.error(err);
                  toast.error("Delete failed", { id: "delete" });
                }
              }}
            >
              Remove Selected
            </button>
          </div>
        </div>

        <div className="card">
          <div className="grid">
            {models.map((m) => (
              <label key={m.name} className="checkbox-row">
                <input
                  type="radio"
                  name="model-select"
                  checked={selectedModel === m.name}
                  onChange={() => setSelectedModel(m.name)}
                />
                <span>{m.name}</span>
                <span className="muted" style={{ marginLeft: 8 }}>
                  {m.type || (m.name === "LCCDE" ? "ensemble" : "custom")}
                </span>
              </label>
            ))}
            {models.length === 0 && <div className="muted">No models found.</div>}
          </div>
        </div>
      </section>
        <section className="section" style={{ marginTop: 24 }}>
        <div className="section__head">
          <h2 className="section__title">Hyperparameter Tuning</h2>
          <div className="toolbar">
            <button className="btn" onClick={resetToDefaults}>
              Reset to Defaults
            </button>
          </div>
        </div>
        <div className="card mt-12">
          {selectedModel === "LCCDE" ? (
            <div className="grid gap-12">
              {BASE_MODELS.map((m) => (
                <fieldset key={m} className="hp">
                  <legend className="hp">{m}</legend>
                  <ModelParamsEditor
                    model={m}
                    value={paramsByModel[m]}
                    onChange={(next) => setParamsByModel((prev) => ({ ...prev, [m]: next }))}
                  />
                </fieldset>
              ))}
            </div>
          ) : (
            <fieldset className="hp">
              <legend className="hp">{selectedModel}</legend>
              <CustomParamsEditor
                params={customParams[selectedModel] || {}}
                onChange={(next) => setCustomParams((prev) => ({ ...prev, [selectedModel]: next }))}
              />
            </fieldset>
          )}
        </div>
      </section>

      {/* Run */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Run</h2>
        </div>
        <div className="card toolbar">
          <button
            className="btn"
            disabled={isRunning}
            onClick={() => {
              if (!canRun) {
                toast.error("Please select at least one dataset.");
                return;
              }
              if (selectedModel === "LCCDE" && !allValid) {
                toast.error("Please fix invalid hyperparameters first.");
                return;
              }
              toast.loading("Starting model run...", { id: "run-status" });
              runNow();
            }}
          >
            {isRunning ? "Running..." : "Run Model"}
          </button>
          {/* Cancel Run removed (non-functional) */}
          <span className="muted">{selectedDatasets.length} dataset(s)</span>
          <a className="wf-oval ml-auto" href="#/results">
            Go to Results
          </a>
        </div>
      </section>

      {/* Recent Results */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Recent Results</h2>
        </div>

        <div className="card table-wrap">
          <table className="table experiments-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Dataset</th>
                <th>Model</th>
                <th>Accuracy</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1</th>
                <th>Created</th>
                <th aria-hidden="true" style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted">
                    No recent results.
                  </td>
                </tr>
              ) : (
                recentRuns.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => {
                      // allow quick selection / inspection by prefilling
                      setSelectedModel(r.model_name || "LCCDE");
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{r.id}</td>
                    <td>{r.params?.dataset || r.params?.dataset_path || r.dataset || ""}</td>
                    <td>{r.model_name}</td>
                    <td>{fmt(r.results?.accuracy)}</td>
                    <td>{fmt(r.results?.precision)}</td>
                    <td>{fmt(r.results?.recall)}</td>
                    <td>{fmt(r.results?.f1)}</td>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
                    <td className="actions">
                      <div className="row-actions">
                        <button
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            rerunFromSession(r);
                          }}
                        >
                          Rerun
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------- Helpers ---------- */
function fmt(v) {
  if (typeof v !== "number") return "—";
  return (v * 100).toFixed(2) + "%";
}


function ModelParamsEditor({ model, value, onChange }) {
  const rules = HyParamRules[model];
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({ mode: "onChange", defaultValues: value });

  useEffect(() => {
    reset(value);
  }, [value, reset]);

  const set = (k, v) => onChange({ ...value, [k]: v });

  const numProps = (k) => ({
    ...register(k, {
      required: "This field is required",
      min: rules[k]?.min,
      max: rules[k]?.max,
      valueAsNumber: true,
    }),
    value: value[k],
    onChange: (e) => {
      const raw = e.target.value;
      if (raw === "") {
        set(k, "");
        return;
      }
      const num = Number(raw);
      set(k, num);
    },
  });

  const outOfRange = (param) => {
    const min = rules[param]?.min?.value;
    const max = rules[param]?.max?.value;
    if (value[param] === "" || value[param] === null || value[param] === undefined) return true;
    if (typeof value[param] !== "number" || Number.isNaN(value[param])) return true;
    if (min !== undefined && value[param] < min) return true;
    if (max !== undefined && value[param] > max) return true;
    return false;
  };

  return (
    <form onSubmit={handleSubmit(() => {})}>
      <div className="form-grid">
        {Object.keys(rules).map((param) => (
          <Field key={param} label={param}>
            <input
              className="input"
              type="number"
              step="any"
              {...numProps(param)}
              style={
                outOfRange(param)
                  ? { border: "1.5px solid red", backgroundColor: "#ffe6e6" }
                  : undefined
              }
            />
            {errors[param] && <span className="error-message">{errors[param].message}</span>}
          </Field>
        ))}
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function CustomParamsEditor({ params, onChange }) {
  const entries = Object.entries(params || {});

  return (
    <div className="form-grid">
      {entries.length === 0 && (
        <div className="muted" style={{ gridColumn: "1 / -1" }}>
          No hyperparameters provided for this model.
        </div>
      )}

      {entries.map(([key, val]) => (
        <Field key={key} label={key}>
          {PARAM_OPTIONS[key] ? (
            <select
              className="input"
              value={val}
              onChange={(e) => onChange({ ...params, [key]: e.target.value })}
            >
              {PARAM_OPTIONS[key].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              type={typeof val === "number" ? "number" : "text"}
              value={val}
              onChange={(e) => {
                const raw = e.target.value;
                const next = typeof val === "number" ? Number(raw) : raw;
                onChange({ ...params, [key]: next });
              }}
            />
          )}
        </Field>
      ))}
    </div>
  );
}
