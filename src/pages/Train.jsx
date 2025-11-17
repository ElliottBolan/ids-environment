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
<<<<<<< HEAD
// Models 
=======
//models in LCCDE
>>>>>>> e6ce22b (landing page additons)
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
  
  // select all button for datasets
  //const [allDatasets, setAllDatasets] = dataList.map(item => item.id)

  // Hyperparameter editor is always visible
  // Hyperparameters by model name
  const [paramsByModel, setParamsByModel] = useState(() => deepClone(DEFAULT_HP));
  // Local session state not needed now that Session Results moved to Results page

  // Session results moved to Results; no preloading needed here

  // Toggle helper to add/remove an item in an array state
  const toggle = (arr, setArr, value) =>
    setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);

  // Enable Run only when at least one dataset is chosen 
  const canRun = selectedDatasets.length > 0;

  //const selectAllDs = (allDatasets, setArr) => {
    //const isAllSelected = selectedIds.length === allItemIds.length && allItemIds.length > 0;
    //setArr(allDatasets);
  //}

  //const deselectAll = (setSelectedArr) => {
    //setSelectedArr([]); // Clear the selected array
  //};

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
  const runNow = () => {
    const combos = [];
    // Determine a session number for this run batch
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const maxSession = existing.reduce((max, r) => Math.max(max, Number.isFinite(r?.session) ? r.session : 0), 0);
    const session = maxSession + 1;

    selectedDatasets.forEach(ds => {
      MODELS.forEach(m => {
        const startedAt = Date.now();
        const durationMs = mockDurationMs();
        const finishedAt = startedAt + durationMs;
        combos.push({
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          dataset: ds,
          model: m,
          session,
          startedAt,
          finishedAt,
          durationMs,
          hyperparams: deepClone(paramsByModel[m]),
          metrics: mockMetrics(),
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
    });
    // Append new results to any previously saved ones
    const updated = [...existing, ...combos];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // Navigate to Results to view the newly created session
    window.location.hash = "#/results";
  };

  return (
    <>
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Select Datasets</h2>
          <div className="section__hint">{selectedDatasets.length} selected</div>
        </div>
        <div className="card grid">
          {/* Dataset checkboxes drive the run matrix */}
          {DATASETS.map(ds => (
            <label key={ds} className="checkbox-row">
              {/*<input type="checkbox" checked={allDatasets.includes(ds)} onChange={() => toggle(allDatasets,selectedDatasets, ds)}></input>*/}
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
          <div className="section__hint">Within the LCCDDE:</div>
          <div className="grid" style={{ marginTop: 8 }}>
            {/* Read-only list of models (could be toggles later) */}
            {MODELS.map(m => (
              <div key={m} className="checkbox-row" aria-label={`Model ${m}`}>
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
          <button className="btn" disabled={!canRun} onClick={runNow}>Run Model</button>
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

  const {register, handleSubmit, formState: {errors} } = useForm();

  const onSubmit = (data) => {
    console.log(data);
  };

  // Common input bindings: numeric vs text. Empty string permits editing.
  const set = (k, v) => onChange({ ...value, [k]: v });
  const num = (k) => ({ value: value[k], onChange: (e) => set(k, e.target.value === "" ? "" : Number(e.target.value)) });

  //inputing hyper params with form validation
  switch (model) {
    case "XGBoost":
      return (
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="form-grid">
            <Field label="n_estimators"><input className="input" type="number" 
              {...register("estim", { required: "Please enter a value", min:{ value: 1, message:'Please enter a hyperparameter value'}})} />
            </Field>
            <Field label="learning_rate"><input className="input" required type="number" min="0" step="0.01" {...num("learning_rate")} /></Field>
            {errors.estim && (<span className= "error-message">{errors.estim.message}</span>)}
          </div>
        </form>
      );
    case "LightGBM":
      return (
        <form>
          <div className="form-grid">
            <Field label="Number of Estimators"><input className="input" required type="number" 
            {...register("estim", { required: "Please enter a value", min:{ value: 1, message:'Please enter a hyperparameter value'}})} /></Field>
            <Field label="Learning Rate"><input className="input"required type="number" min="0" step="0.01" {...num("learning_rate")} /></Field>
          </div>
        </form>
      );
    case "CatBoost":
      return (
        <form>
          <div className="form-grid">
            <Field label="Number of Iterations"><input className="input"  type="number" min="10" step="10" {...num("iterations")} /></Field>
            <Field label="Learning Rate"><input className="input"  type="number" min="0" step="0.01" {...num("learning_rate")} /></Field>
          </div>
        </form>
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
