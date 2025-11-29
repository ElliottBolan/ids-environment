// src/pages/Train.jsx 
import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { API_BASE } from "../api";
import { useForm } from "react-hook-form";
import { HyParamRules } from "./HyParamRules";

// LCCDE models
const MODELS = ["LightGBM", "XGBoost", "CatBoost"];

// Default hyperparameters
const DEFAULT_HP = {
  LightGBM: {
    n_estimators: 500,
    num_leaves: 31,
    learning_rate: 0.1,
    max_depth: -1,
  },
  XGBoost: {
    n_estimators: 400,
    max_depth: 6,
    learning_rate: 0.1,
    subsample: 0.8,
    colsample_bytree: 0.8,
    reg_lambda: 1.0,
  },
  CatBoost: {
    iterations: 500,
    depth: 6,
    learning_rate: 0.1,
    l2_leaf_reg: 3.0,
  },
};

// Deep clone safe helper
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

export default function Train() {
  // dataset list from backend
  const [datasets, setDatasets] = useState([]);

  // Selected datasets
  const [selectedDatasets, setSelectedDatasets] = useState([]);

  // Load dataset list from backend
  useEffect(() => {
    fetch(`${API_BASE}/api/datasets`)
      .then((res) => res.json())
      .then((data) => setDatasets(data.datasets || []))
      .catch((err) => console.error("Failed to load datasets", err));
  }, []);

  // session results
  const [sessionRuns, setSessionRuns] = useState([]);

  // hyperparams
  const [paramsByModel, setParamsByModel] = useState(() =>
    deepClone(DEFAULT_HP)
  );

  // toggle helper
  const toggle = (arr, setArr, value) =>
    setArr(
      arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value]
    );

  const canRun = selectedDatasets.length > 0;

  // Reset hyperparameters
  const resetSelectedParams = () => {
    setParamsByModel(() => deepClone(DEFAULT_HP));
  };

  // hyperparameter validation
  const allValid = MODELS.every((model) => {
    const params = paramsByModel[model];
    const rules = HyParamRules[model];

    return Object.keys(rules).every((key) => {
      const val = params[key];
      if (val === "" || val === null || val === undefined) return false;

      const min = rules[key].min;
      const max = rules[key].max;

      if (typeof val !== "number" || Number.isNaN(val)) return false;
      if (val < min) return false;
      if (max !== undefined && val > max) return false;

      return true;
    });
  });

  // Run model
  const runNow = async () => {
  if (!canRun || !allValid) {
    toast.error("Please select datasets and fix invalid fields.");
    return;
  }

  toast.loading("Running model...", { id: "run-status" });

  const results = [];

  for (const ds of selectedDatasets) {
    try {
      const body = {
        dataset: ds,
        lgb_params: paramsByModel.LightGBM,
        xgb_params: paramsByModel.XGBoost,
        cbt_params: paramsByModel.CatBoost
      };

      console.log("Sending to backend:", body);

      const res = await fetch(`${API_BASE}/train_lccde`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      console.log("Backend returned:", data);

      if (data.error) {
        results.push({
          dataset: ds,
          model: "LCCDE",
          metrics: { error: data.error }
        });
        toast.error(`Error running ${ds}: ${data.error}`);
        continue;
      }

      // Build frontend run record
      const runRecord = {
        id: Date.now() + Math.random(),
        dataset: ds,
        model: "LCCDE",
        metrics: {
          accuracy: data.lccde.accuracy,
          precision: data.lccde.precision,
          recall: data.lccde.recall,
          f1: data.lccde.f1_weighted
        },
        duration_s: data.duration_s,
        params: body
      };

      // push locally for Session Results UI
      results.push(runRecord);

      // ---- SAVE TO DATABASE ----
      try {
        const saveRes = await fetch(`${API_BASE}/api/experiments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_name: "LCCDE",
            params: body,
            results: {
              accuracy: data.lccde.accuracy,
              precision: data.lccde.precision,
              recall: data.lccde.recall,
              f1: data.lccde.f1_weighted
            },
            duration_s: data.duration_s
          })
        });

        const saved = await saveRes.json();
        console.log("Saved to database:", saved);
      } catch (dbErr) {
        console.error("Database save failed:", dbErr);
        toast.error("Failed to save to database.");
      }

      toast.success(`Finished training on ${ds}!`);

    } catch (err) {
      console.error("Training failed:", err);
      results.push({
        dataset: ds,
        model: "LCCDE",
        metrics: { error: err.message }
      });
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
              {selectedDatasets.length === datasets.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
        </div>

        <div className="card grid">
          {datasets.map((ds) => (
            <label key={ds} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedDatasets.includes(ds)}
                onChange={() =>
                  toggle(selectedDatasets, setSelectedDatasets, ds)
                }
              />
              <span>{ds.replace(".csv", "")}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Models + Hyperparameters */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Models</h2>
          <div className="toolbar">
            <button className="btn" onClick={resetSelectedParams}>
              Reset All
            </button>
          </div>
        </div>

        <div className="card">
          <div className="section__hint">Within the LCCDE:</div>
          <div className="grid">
            {MODELS.map((m) => (
              <div key={m} className="checkbox-row">
                <span>{m}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card mt-12">
          <div className="section__head mb-12">
            <div className="section__hint">Customize hyperparameters</div>
          </div>
          <div className="grid gap-12">
            {MODELS.map((m) => (
              <fieldset key={m} className="hp">
                <legend className="hp">{m}</legend>
                <ModelParamsEditor
                  model={m}
                  value={paramsByModel[m]}
                  onChange={(next) =>
                    setParamsByModel((prev) => ({ ...prev, [m]: next }))
                  }
                />
              </fieldset>
            ))}
          </div>
        </div>
      </section>

      {/* Run */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Run</h2>
          <div className="section__hint">Launch experiments</div>
        </div>
        <div className="card toolbar">
          <button className="btn" onClick={runNow}>
            Run Model
          </button>
          <span className="muted">
            {selectedDatasets.length} dataset(s), {MODELS.length} model(s)
          </span>
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
                <th>Model</th>
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
                    No results yet. Click “Run Model”.
                  </td>
                </tr>
              ) : (
                sessionRuns.map((r) => (
                  <tr key={r.id}>
                    <td>{r.dataset}</td>
                    <td>{r.model}</td>
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

// Hyperparameter editor
function ModelParamsEditor({ model, value, onChange }) {
  const rules = HyParamRules[model];
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    mode: "onChange",
    defaultValues: value,
  });

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
      set(k, Number(raw));
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => console.log(data))}>
      <div className="form-grid">
        {Object.keys(rules).map((param) => (
          <Field key={param} label={param}>
            <input className="input" type="number" step="any" {...numProps(param)} />
            {errors[param] && (
              <span className="error-message">{errors[param].message}</span>
            )}
          </Field>
        ))}
      </div>
    </form>
  );
}

// Label wrapper
function Field({ label, children }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}