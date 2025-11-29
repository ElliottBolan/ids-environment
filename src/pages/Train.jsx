// src/pages/Train.jsx 
// Training UI (front-end only): pick datasets, tweak params, save mock runs.
// Data persists in localStorage under `ids-runs-simple` and is shown in Results.
import React, { useState } from "react";
import { API_BASE } from "../api";

const STORAGE_KEY = "ids-runs-simple";
// Available datasets (replace with backend-fed list later)
// const DATASETS = ["UNSW-NB15", "CIC-IDS-2017", "KDD'99", "CIC-DDoS-2019"];
const DATASETS = [
  "CICIDS2017_sample.csv",
  "CICIDS2017_sample_km.csv",
  "IoT_2020_multi_0.05.csv"
];
// Fixed models (read-only UI for now)
const MODELS = ["LightGBM", "XGBoost", "CatBoost"];

// Default hyperparameters per model (used by the editor below)
const DEFAULT_HP = {
  "LightGBM": { n_estimators: 500, num_leaves: 31, learning_rate: 0.1, max_depth: -1 },
  "XGBoost": { n_estimators: 400, max_depth: 6, learning_rate: 0.1, subsample: 0.8, colsample_bytree: 0.8, reg_lambda: 1.0 },
  "CatBoost": { iterations: 500, depth: 6, learning_rate: 0.1, l2_leaf_reg: 3.0 }
};
// JSON clone for safe immutable updates (avoid non-JSON values)
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

export default function Train() {
  // Selected datasets for the run matrix
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  // Hyperparameter editor is always visible
  // Hyperparameters by model name
  const [paramsByModel, setParamsByModel] = useState(() => deepClone(DEFAULT_HP));
  // Local session state not needed now that Session Results moved to Results page

  const [sessionRuns, setSessionRuns] = useState([]);
  
  // Toggle helper to add/remove an item in an array state
  const toggle = (arr, setArr, value) =>
    setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);

  // Enable Run only when at least one dataset is chosen
  const canRun = selectedDatasets.length > 0;

  // Model selection UI removed; models are fixed.

  /** Reset all model hyperparameters to defaults. */
  const resetSelectedParams = () => {
    setParamsByModel((prev) => {
      const next = deepClone(prev);
      MODELS.forEach(m => { next[m] = deepClone(DEFAULT_HP[m]); });
      return next;
    });
  };

  /**
   * Build dataset×model combos with hyperparams and mock metrics,
   * then append to localStorage and show in the table.
   * Front-end only; replace with backend later.
   */
  // const runNow = () => {
  //   const combos = [];
  //   selectedDatasets.forEach(ds => {
  //     MODELS.forEach(m => {
  //       combos.push({
  //         id: String(Date.now()) + Math.random().toString(36).slice(2),
  //         dataset: ds,
  //         model: m,
  //         startedAt: Date.now(),
  //         finishedAt: Date.now(),
  //         hyperparams: deepClone(paramsByModel[m]),
  //         metrics: mockMetrics(),
  //       });
  //     });
  //   });
  //   // Append new results to any previously saved ones
  //   const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  //   localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, ...combos]));
  //   setSessionRuns(combos);
  // };
  const runNow = async () => {
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
      } else {
          const runRecord = {
            id: Date.now(),
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

          results.push(runRecord);

          // save to database
          try {
            const saveRes = await fetch(`${API_BASE}/api/experiments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model_name: "LCCDE",
                params: body,
                results: data.lccde,
                duration_s: data.duration_s
              })
            });

            const saved = await saveRes.json();
            console.log("Saved to DB:", saved);
          } catch (dbErr) {
            console.error("DB save failed:", dbErr);
          }
        }


    } catch (err) {
      console.error("Training failed:", err);
      results.push({
        dataset: ds,
        model: "LCCDE",
        metrics: { error: err.message }
      });
    }
  }

  setSessionRuns(results);
};


  return (
    <>
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Choose Datasets</h2>
          <div className="section__hint">{selectedDatasets.length} selected</div>
        </div>
        <div className="card grid">
          {/* Dataset checkboxes drive the run matrix */}
          {DATASETS.map(ds => (
            <label key={ds} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedDatasets.includes(ds)}
                onChange={() => toggle(selectedDatasets, setSelectedDatasets, ds)}
              />
              <span>{ds}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Models</h2>
          <div className="toolbar">
            <button className="btn" onClick={resetSelectedParams}>Reset All</button>
          </div>
        </div>
        <div className="card">
          <div className="section__hint">Using all models:</div>
          <div className="grid mt-8">
            {/* Read-only list of models (could be toggles later) */}
            {MODELS.map(m => (
              <div key={m} className="checkbox-row" aria-label={`Model ${m}`}>
                <input type="checkbox" checked readOnly aria-hidden="true" />
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
                <legend className="hp">Hyperparameters — {m}</legend>
                <ModelParamsEditor
                  model={m}
                  value={paramsByModel[m]}
                  onChange={(next) => setParamsByModel(prev => ({ ...prev, [m]: next }))}
                />
              </fieldset>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Run</h2>
          <div className="section__hint">Launch experiments</div>
        </div>
        <div className="card toolbar">
          <button className="wf-oval" disabled={!canRun} onClick={runNow}>Run Models</button>
          <span className="muted">
            {selectedDatasets.length} dataset(s), {MODELS.length} model(s)
          </span>
          <a className="wf-oval ml-auto" href="#/results">Go to Results</a>
        </div>
      </section>

      {/* Session Results moved to Results page */}
    </>
  );
}

// Editor for a model's hyperparameters (controlled inputs)
function ModelParamsEditor({ model, value, onChange }) {
  // Common input bindings: numeric vs text. Empty string permits editing.
  const set = (k, v) => onChange({ ...value, [k]: v });
  const num = (k) => ({ value: value[k], onChange: (e) => set(k, e.target.value === "" ? "" : Number(e.target.value)) });
  const txt = (k) => ({ value: value[k], onChange: (e) => set(k, e.target.value) });

  switch (model) {
    case "XGBoost":
      return (
        <div className="form-grid">
          <Field label="n_estimators"><input className="input" type="number" min="1" step="1" {...num("n_estimators")} /></Field>
          <Field label="max_depth"><input className="input" type="number" min="1" step="1" {...num("max_depth")} /></Field>
          <Field label="learning_rate"><input className="input" type="number" min="0" step="0.01" {...num("learning_rate")} /></Field>
          <Field label="subsample"><input className="input" type="number" min="0.1" max="1" step="0.1" {...num("subsample")} /></Field>
          <Field label="colsample_bytree"><input className="input" type="number" min="0.1" max="1" step="0.1" {...num("colsample_bytree")} /></Field>
          <Field label="reg_lambda"><input className="input" type="number" min="0" step="0.1" {...num("reg_lambda")} /></Field>
        </div>
      );
    case "Random Forest":
      return (
        <div className="form-grid">
          <Field label="n_estimators"><input className="input" type="number" min="1" step="1" {...num("n_estimators")} /></Field>
          <Field label="max_depth"><input className="input" type="number" min="1" step="1" {...num("max_depth")} /></Field>
          <Field label="max_features">
            <select className="select" {...txt("max_features")}>
              <option value="sqrt">sqrt</option><option value="log2">log2</option><option value="auto">auto</option>
            </select>
          </Field>
          <Field label="min_samples_split"><input className="input" type="number" min="2" step="1" {...num("min_samples_split")} /></Field>
        </div>
      );
    case "SVM":
      return (
        <div className="form-grid">
          <Field label="C"><input className="input" type="number" min="0.01" step="0.01" {...num("C")} /></Field>
          <Field label="kernel">
            <select className="select" {...txt("kernel")}><option value="rbf">rbf</option><option value="linear">linear</option></select>
          </Field>
          <Field label="gamma">
            <select className="select" {...txt("gamma")}><option value="scale">scale</option><option value="auto">auto</option></select>
          </Field>
        </div>
      );
    case "Logistic Regression":
      return (
        <div className="form-grid">
          <Field label="penalty"><select className="select" {...txt("penalty")}><option value="l2">l2</option></select></Field>
          <Field label="C"><input className="input" type="number" min="0.01" step="0.01" {...num("C")} /></Field>
          <Field label="max_iter"><input className="input" type="number" min="100" step="50" {...num("max_iter")} /></Field>
          <Field label="solver"><select className="select" {...txt("solver")}><option value="lbfgs">lbfgs</option><option value="saga">saga</option></select></Field>
        </div>
      );
    case "MLP":
      return (
        <div className="form-grid">
          <Field label="hidden_layer_sizes (e.g., 128,64)"><input className="input" type="text" {...txt("hidden_layer_sizes")} /></Field>
          <Field label="activation"><select className="select" {...txt("activation")}><option value="relu">relu</option><option value="tanh">tanh</option></select></Field>
          <Field label="alpha"><input className="input" type="number" min="0" step="0.0001" {...num("alpha")} /></Field>
          <Field label="learning_rate_init"><input className="input" type="number" min="0" step="0.0001" {...num("learning_rate_init")} /></Field>
          <Field label="max_iter"><input className="input" type="number" min="100" step="50" {...num("max_iter")} /></Field>
        </div>
      );
    case "LightGBM":
      return (
        <div className="form-grid">
          <Field label="n_estimators"><input className="input" type="number" min="1" step="1" {...num("n_estimators")} /></Field>
          <Field label="num_leaves"><input className="input" type="number" min="2" step="1" {...num("num_leaves")} /></Field>
          <Field label="learning_rate"><input className="input" type="number" min="0" step="0.01" {...num("learning_rate")} /></Field>
          <Field label="max_depth"><input className="input" type="number" step="1" {...num("max_depth")} /></Field>
        </div>
      );
    case "CatBoost":
      return (
        <div className="form-grid">
          <Field label="iterations"><input className="input" type="number" min="10" step="10" {...num("iterations")} /></Field>
          <Field label="depth"><input className="input" type="number" min="1" step="1" {...num("depth")} /></Field>
          <Field label="learning_rate"><input className="input" type="number" min="0" step="0.01" {...num("learning_rate")} /></Field>
          <Field label="l2_leaf_reg"><input className="input" type="number" min="0" step="0.1" {...num("l2_leaf_reg")} /></Field>
        </div>
      );
    default:
      return <div className="form-grid"><div>No editor for model: {model}</div></div>;
  }
}

/** Small label+control wrapper used across parameter forms. */
function Field({ label, children }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

// Mock metrics with light randomness (placeholder for real training output)
function mockMetrics() {
  const rnd = (base = 0.86, span = 0.12) => +(base + Math.random() * span).toFixed(4);
  const precision = rnd(0.84, 0.12);
  const recall = rnd(0.84, 0.12);
  const f1 = +((2 * precision * recall) / (precision + recall)).toFixed(4);
  return { accuracy: rnd(0.86, 0.12), precision, recall, f1 };
}

// Mock duration: 2.0s to 9.0s (random)
function mockDurationMs() {
  const min = 2000, max = 9000;
  return Math.floor(min + Math.random() * (max - min));
}
