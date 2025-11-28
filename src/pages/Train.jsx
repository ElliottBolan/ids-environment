// src/pages/Train.jsx 
// Training UI (front-end only): pick datasets, tweak params, save mock runs.
// Data persists in localStorage under `ids-runs-simple` and is shown in Results.
import React, { useState } from "react";
import toast from "react-hot-toast";
import { API_BASE } from "../api";
import { useForm } from "react-hook-form";
import { HyParamRules } from "./HyParamRules";

const STORAGE_KEY = "ids-runs-simple";
// Available datasets (replace with backend-fed list later)
const DATASETS = ["UNSW-NB15", "CIC-IDS-2017", "KDD'99", "CIC-DDoS-2019"];
//const DATASETS = ["CICIDS2017_sample.csv", "CICIDS2017_sample_km.csv", "IoT_2020_multi_0.05.csv"];
//models in LCCDE
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

  // Runs created this session (also saved to localStorage)
  const [sessionRuns, setSessionRuns] = useState([]);

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

  // Check all fields of all models
  const allValid = MODELS.every(model => {
    const params = paramsByModel[model];
    const rules = HyParamRules[model];
  
    return Object.keys(rules).every(key => {
      const val = params[key];

      if (val === "" || val === null || val === undefined) {
        return false;
      }
  
      const min = rules[key].min;
      const max = rules[key].max;
  
      if (typeof val !== "number" || Number.isNaN(val)) return false;
      if (val < min) return false;
      if (max !== undefined && val > max) return false;
  
      return true;
    });
  }); 

  /**
   * Build dataset×model combos with hyperparams and mock metrics,
   * then append to localStorage and show in the table.
   * Front-end only; replace with backend later.
   */
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
  
          toast.error(`Error running on ${ds}: ${data.error}`);
          continue;
        }
  
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
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Select Datasets</h2>
          <div className="toolbar">
            <button className="btn"
              onClick={() => {
                if (selectedDatasets.length === DATASETS.length) {
                  setSelectedDatasets([]);
                } else {
                  setSelectedDatasets([...DATASETS]);
                }
              }}
            >
              {selectedDatasets.length === DATASETS.length ? "Deselect All" : "Select All"}
            </button>
          </div>
        </div>
        <div className="card grid">
          {/* Dataset checkboxes drive the run matrix */}
          {DATASETS.map(ds => (
            <label key={ds} className="checkbox-row">
              <input type="checkbox" checked={selectedDatasets.includes(ds)} onChange={() => toggle(selectedDatasets, setSelectedDatasets, ds)}/>
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
          <div className="section__hint">Within the LCCDE:</div>
          <div className="grid" style={{ marginTop: 8 }}>
            {/* Read-only list of models (could be toggles later) */}
            {MODELS.map(m => (
              <div key={m} className="checkbox-row" aria-label={`Model ${m}`}>
                <span>{m}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="section__head" style={{ marginBottom: 12 }}>
            <div className="section__hint">Customize hyperparameters</div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
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
          <button
            className="btn"
            onClick={() => {
              if (!canRun) {
                toast.error("Please select at least one dataset.");
                return;
              }
              if (!allValid) {
                toast.error("Please fix invalid hyperparameters first.");
                return;
              }
              // show loading toast
              toast.loading("Starting model run...", { id: "run-status" });
              // call runNow
              runNow();
            }}
          >
            Run Model
          </button>
          <span className="muted">
            {selectedDatasets.length} dataset(s), {MODELS.length} model(s)
          </span>
          <a className="btn" href="#/results" style={{ marginLeft: "auto" }}>Go to Results</a>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Session Results</h2>
          <div className="section__hint">
            {sessionRuns.length ? `${sessionRuns.length} completed` : "no runs yet"}
          </div>
        </div>
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dataset</th><th>Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th>
              </tr>
            </thead>
            <tbody>
              {sessionRuns.length === 0 ? (
                <tr><td className="muted" colSpan={6}>No results yet. Click “Run Model”.</td></tr>
              ) : (
                sessionRuns.map(r => (
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

// Editor for a model's hyperparameters (controlled inputs)
function ModelParamsEditor({ model, value, onChange }) {
  const rules = HyParamRules[model];
  const { register, handleSubmit, formState: { errors } } = useForm({
    mode: "onChange",
    defaultValues: value
  });

  const set = (k, v) => onChange({ ...value, [k]: v });

  const numProps = (k) => ({
    ...register(k, {
      required: "This field is required",  // blank is invalid
      min: rules[k]?.min,
      max: rules[k]?.max,
      valueAsNumber: true
    }),
    value: value[k],
    onChange: (e) => {
      const raw = e.target.value;
    
      // If the field is blank, store blank
      if (raw === "") {
        set(k, ""); 
        return;
      }
    
      // Otherwise parse normally
      const num = Number(raw);
      set(k, num);
    }
    
  });  

  return (
    <form onSubmit={handleSubmit((data) => console.log(data))}>
      <div className="form-grid">
        {Object.keys(rules).map(param => (
          <Field key={param} label={param}>
            <input
              className="input"
              type="number"
              step="any"
              {...numProps(param)}
            />
            {errors[param] && (
              <span className="error-message">{errors[param].message || "Invalid"}</span>
            )}
          </Field>
        ))}
      </div>
    </form>
  );
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
