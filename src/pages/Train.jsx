import React, { useState } from "react";

const STORAGE_KEY = "ids-runs-simple";
const DATASETS = ["UNSW-NB15", "CIC-IDS-2017", "KDD'99", "CIC-DDoS-2019"];
const MODELS = ["XGBoost", "Random Forest", "SVM", "Logistic Regression", "MLP", "LightGBM", "CatBoost"];

export default function Train() {
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [sessionRuns, setSessionRuns] = useState([]);

  const grid = { display:"grid", gap:8, gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))" };

  const toggle = (arr, setArr, value) =>
    setArr(arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);

  const canRun = selectedDatasets.length > 0 && selectedModels.length > 0;

  const runNow = () => {
    // Create simple (dataset, model) combos with mock metrics
    const combos = [];
    selectedDatasets.forEach(ds => {
      selectedModels.forEach(m => {
        combos.push({
          id: String(Date.now()) + Math.random().toString(36).slice(2),
          dataset: ds,
          model: m,
          startedAt: Date.now(),
          finishedAt: Date.now(),
          metrics: mockMetrics(),
        });
      });
    });

    // Save to localStorage so Results page can read them
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const merged = [...existing, ...combos];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

    setSessionRuns(combos);
  };

  return (
    <div>
      <div className="card">
        <h2 style={{marginTop:0}}>Choose Datasets</h2>
        <div style={grid}>
          {DATASETS.map(ds => (
            <label key={ds} style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input
                type="checkbox"
                checked={selectedDatasets.includes(ds)}
                onChange={() => toggle(selectedDatasets, setSelectedDatasets, ds)}
              />
              <span>{ds}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card" style={{marginTop:16}}>
        <h2 style={{marginTop:0}}>Choose Models</h2>
        <div style={grid}>
          {MODELS.map(m => (
            <label key={m} style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input
                type="checkbox"
                checked={selectedModels.includes(m)}
                onChange={() => toggle(selectedModels, setSelectedModels, m)}
              />
              <span>{m}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", gap:12, alignItems:"center", margin:"12px 0 16px" }}>
        <button className={`btn ${canRun ? "primary" : "ghost"}`} disabled={!canRun} onClick={runNow}>
          Run Models
        </button>
        <span style={{ color:"#6b7280" }}>
          {selectedDatasets.length} dataset(s), {selectedModels.length} model(s) selected
        </span>
      </div>

      <div className="card">
        <h2 style={{marginTop:0}}>Session Results</h2>
        <ResultsTable rows={sessionRuns}/>
      </div>
    </div>
  );
}

function ResultsTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <div style={{ color:"#6b7280" }}>No results yet. Click “Run Models”.</div>;
  }
  return (
    <div style={{ overflowX:"auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Dataset</th><th>Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.dataset}</td>
              <td>{r.model}</td>
              <td>{r.metrics.accuracy}</td>
              <td>{r.metrics.precision}</td>
              <td>{r.metrics.recall}</td>
              <td>{r.metrics.f1}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
