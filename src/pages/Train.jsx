// src/pages/Train.jsx 
import React, { useState } from "react";

const STORAGE_KEY = "ids-runs-simple";
const DATASETS = ["UNSW-NB15", "CIC-IDS-2017", "KDD'99", "CIC-DDoS-2019"];
const MODELS = ["XGBoost", "Random Forest", "SVM", "Logistic Regression", "MLP", "LightGBM", "CatBoost"];

const DEFAULT_HP = {
  "XGBoost": { n_estimators: 400, max_depth: 6, learning_rate: 0.1, subsample: 0.8, colsample_bytree: 0.8, reg_lambda: 1.0 },
  "Random Forest": { n_estimators: 300, max_depth: 20, max_features: "sqrt", min_samples_split: 2 },
  "SVM": { C: 1.0, kernel: "rbf", gamma: "scale" },
  "Logistic Regression": { penalty: "l2", C: 1.0, max_iter: 500, solver: "lbfgs" },
  "MLP": { hidden_layer_sizes: "128,64", activation: "relu", alpha: 0.0001, learning_rate_init: 0.001, max_iter: 300 },
  "LightGBM": { n_estimators: 500, num_leaves: 31, learning_rate: 0.1, max_depth: -1 },
  "CatBoost": { iterations: 500, depth: 6, learning_rate: 0.1, l2_leaf_reg: 3.0 }
};
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

export default function Train() {
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paramsByModel, setParamsByModel] = useState(() => deepClone(DEFAULT_HP));
  const [sessionRuns, setSessionRuns] = useState([]);

  const toggle = (arr, setArr, value) =>
    setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);

  const canRun = selectedDatasets.length > 0 && selectedModels.length > 0;

  const resetSelectedParams = () => {
    setParamsByModel((prev) => {
      const next = deepClone(prev);
      selectedModels.forEach(m => { next[m] = deepClone(DEFAULT_HP[m]); });
      return next;
    });
  };

  const runNow = () => {
    const combos = [];
    selectedDatasets.forEach(ds => {
      selectedModels.forEach(m => {
        combos.push({
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          dataset: ds,
          model: m,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          hyperparams: deepClone(paramsByModel[m]),
          metrics: mockMetrics(),
        });
      });
    });
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, ...combos]));
    setSessionRuns(combos);
  };

  return (
    <>
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Choose Datasets</h2>
          <div className="section__hint">{selectedDatasets.length} selected</div>
        </div>
        <div className="card grid">
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
          <h2 className="section__title">Choose Models</h2>
          <div className="toolbar">
            <button className="btn" onClick={() => setShowAdvanced(s => !s)}>
              {showAdvanced ? "Hide Advanced" : "Advanced"}
            </button>
            {showAdvanced && (
              <button className="btn" onClick={resetSelectedParams}>Reset Selected</button>
            )}
          </div>
        </div>
        <div className="card grid">
          {MODELS.map(m => (
            <label key={m} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedModels.includes(m)}
                onChange={() => toggle(selectedModels, setSelectedModels, m)}
              />
              <span>{m}</span>
            </label>
          ))}
        </div>

        {showAdvanced && selectedModels.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="section__head" style={{ marginBottom: 12 }}>
              <div className="section__hint">Customize hyperparameters (per selected model)</div>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {selectedModels.map((m) => (
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
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">Run</h2>
          <div className="section__hint">Launch experiments</div>
        </div>
        <div className="card toolbar">
          <button className="btn" disabled={!canRun} onClick={runNow}>Run Models</button>
          <span className="muted">
            {selectedDatasets.length} dataset(s), {selectedModels.length} model(s) selected
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
                <tr><td className="muted" colSpan={6}>No results yet. Click “Run Models”.</td></tr>
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

function ModelParamsEditor({ model, value, onChange }) {
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

function Field({ label, children }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function mockMetrics() {
  const rnd = (base = 0.86, span = 0.12) => +(base + Math.random() * span).toFixed(4);
  const precision = rnd(0.84, 0.12);
  const recall = rnd(0.84, 0.12);
  const f1 = +((2 * precision * recall) / (precision + recall)).toFixed(4);
  return { accuracy: rnd(0.86, 0.12), precision, recall, f1 };
}
