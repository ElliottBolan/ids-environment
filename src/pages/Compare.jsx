// src/pages/Compare.jsx
// Compares 2 previous runs stored in the database, styled to match the LCCDE UI

import React, { useEffect, useState } from "react";
import { API_BASE } from "../api";

export default function Compare() {
  const [experiments, setExperiments] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/experiments`);
        const data = await res.json();
        setExperiments(data.results || []);
      } catch (err) {
        console.error("Failed to load experiments:", err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  if (loading)
    return <div className="muted" style={{ marginTop: 40 }}>Loading…</div>;

  const runA = experiments.find((e) => e.id === selected[0]) || null;
  const runB = experiments.find((e) => e.id === selected[1]) || null;

  return (
    <div className="container" style={{ marginTop: 40 }}>
      <h1 className="section__title" style={{ fontSize: 28, marginBottom: 20 }}>
        Compare Experiments
      </h1>

      {/* Experiment List */}
      <div className="section card" style={{ textAlign: "left" }}>
        <h2 className="section__title">Select Two Experiments</h2>
        <div className="section__hint">
          Pick exactly two to compare side-by-side
        </div>

        <div className="grid" style={{ marginTop: 12 }}>
          {experiments.map((exp) => (
            <label
              key={exp.id}
              className="card checkbox-row"
              style={{ padding: 12 }}
            >
              <input
                type="checkbox"
                checked={selected.includes(exp.id)}
                disabled={
                  !selected.includes(exp.id) && selected.length === 2
                }
                onChange={() => toggleSelect(exp.id)}
              />
              <div>
                <div className="font-semibold">
                  {exp.params?.dataset} — {exp.model_name}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {new Date(exp.created_at).toLocaleString()}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Comparison Display */}
      {selected.length === 2 && (
        <div className="section">
          <h2 className="section__title" style={{ marginBottom: 16 }}>
            Side-by-Side Comparison
          </h2>

          {/* Run cards */}
          <div className="grid" style={{ marginBottom: 20 }}>
            <RunCard title="Run A" run={runA} />
            <RunCard title="Run B" run={runB} />
          </div>

          {/* Metrics Table */}
          <div className="card table-wrap">
            <h3 className="section__title" style={{ marginBottom: 12 }}>
              Metrics
            </h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Run A</th>
                  <th>Run B</th>
                </tr>
              </thead>
              <tbody>
                {metricRow("Accuracy", runA.results?.accuracy, runB.results?.accuracy)}
                {metricRow("Precision", runA.results?.precision, runB.results?.precision)}
                {metricRow("Recall", runA.results?.recall, runB.results?.recall)}
                {metricRow("F1", runA.results?.f1, runB.results?.f1)}
              </tbody>
            </table>
          </div>

          {/* Hyperparameters */}
          <div className="card" style={{ marginTop: 20 }}>
            <h3 className="section__title" style={{ marginBottom: 12 }}>
              Hyperparameters
            </h3>

            <div className="grid">
              <pre className="textarea">{JSON.stringify(runA.params, null, 2)}</pre>
              <pre className="textarea">{JSON.stringify(runB.params, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Subcomponents --- */

function RunCard({ title, run }) {
  return (
    <div className="card" style={{ textAlign: "left" }}>
      <h3 className="section__title" style={{ marginBottom: 8 }}>{title}</h3>
      <div className="muted">Dataset:</div>
      <div>{run.params?.dataset}</div>

      <div className="muted" style={{ marginTop: 8 }}>Model:</div>
      <div>{run.model_name}</div>

      <div className="muted" style={{ marginTop: 8 }}>Created:</div>
      <div>{new Date(run.created_at).toLocaleString()}</div>
    </div>
  );
}

function metricRow(label, a, b) {
  return (
    <tr key={label}>
      <td className="p-3">{label}</td>
      <td className="p-3">{a ?? "—"}</td>
      <td className="p-3">{b ?? "—"}</td>
    </tr>
  );
}
