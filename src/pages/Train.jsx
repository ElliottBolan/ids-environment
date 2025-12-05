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
  const [models, setModels] = useState([{ name: "LCCDE", type: "ensemble" }]);
  const [selectedModel, setSelectedModel] = useState("LCCDE");
  const [customParams, setCustomParams] = useState({});
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [sessionRuns, setSessionRuns] = useState([]);
  const [paramsByModel, setParamsByModel] = useState(() => deepClone(DEFAULT_HP));

  useEffect(() => {
    fetch(`${API_BASE}/api/datasets`)
      .then((res) => res.json())
      .then((data) => setDatasets(data.datasets || []))
      .catch((err) => console.error("Failed to load datasets", err));
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/experiments?limit=10`);
        const data = await res.json();
        if (data?.results) {
          setSessionRuns(
            data.results.map((r) => ({
              id: r.id,
              dataset: r.params?.dataset || r.params?.dataset_path || "",
              model: r.model_name,
              metrics: r.results || {},
              created_at: r.created_at,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load prior runs", err);
      }
    };
    loadHistory();
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
        setCustomParams((prev) => ({ ...defaults, ...prev }));
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

    toast.loading("Running model...", { id: "run-status" });
    const results = [];

    for (const ds of selectedDatasets) {
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
        console.error("Training failed:", err);
        results.push({ dataset: ds, model: selectedModel, metrics: { error: err.message } });
        toast.error(`Training failed on ${ds}: ${err.message}`);
      }
    }

    setSessionRuns(results);
    toast.success("All tasks completed!", { id: "run-status" });
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
                if (selectedDatasets.length === datasets.length) {
                  setSelectedDatasets([]);
                } else {
                  setSelectedDatasets([...datasets]);
                }
              }}
            >
              {selectedDatasets.length === datasets.length ? "Deselect All" : "Select All"}
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
              <span>{ds.replace(".csv", "")}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Models + Hyperparameters */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Ensembles and Models</h2>
          <div className="toolbar">
            <button className="btn" onClick={resetSelectedParams}>
              Reset All
            </button>
            <button className="btn" onClick={handleUploadClick}>
              Upload Model
            </button>
          </div>
        </div>

        <div className="card">          <div className="section__hint">Select one model to tune and run</div>
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

        <div className="card mt-12">
          <div className="section__head mb-12">
            <div className="section__hint">Hyperparameter Tuning</div>
          </div>
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
          <div className="section__hint">Launch experiments</div>
        </div>
        <div className="card toolbar">
          <button
            className="btn"
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
            Run Model
          </button>
          <span className="muted">{selectedDatasets.length} dataset(s)</span>
          <a className="wf-oval ml-auto" href="#/results">
            Go to Results
          </a>
        </div>
      </section>

      {/* Session Results */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Session Results</h2>
        </div>

        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>ID</th>
                <th>Model</th>
                <th>Ran At</th>
                <th>Accuracy</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>F1</th>
              </tr>
            </thead>
            <tbody>
              {sessionRuns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No results yet. Click "Run Model".
                  </td>
                </tr>
              ) : (
                sessionRuns.map((r) => (
                  <tr key={r.id}>
                    <td>{r.dataset}</td>
                    <td>{r.id}</td>
                    <td>{r.model}</td>
                    <td>{r.created_at || ""}</td>
                    <td>{r.metrics.accuracy}</td>
                    <td>{r.metrics.precision}</td>
                    <td>{r.metrics.recall}</td>
                    <td>{r.metrics.f1}</td>
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
