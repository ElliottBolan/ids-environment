// src/pages/Compare.jsx
// Compares 2 previous runs stored in the database, styled to match the LCCDE UI

import React, { useEffect, useState } from "react";
import { API_BASE } from "../api";

export default function Compare() {
  const [experiments, setExperiments] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

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

    // poll running state for active training jobs
    let mounted = true;
    async function pollRunning() {
      try {
        const r = await fetch(`${API_BASE}/api/running`);
        const j = await r.json();
        if (!mounted) return;
        setIsRunning(Boolean(j.running));
      } catch (err) {
        // ignore
      }
    }
    pollRunning();
    const iv = setInterval(pollRunning, 3000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  async function refreshExperiments() {
    try {
      const res = await fetch(`${API_BASE}/api/experiments`);
      const data = await res.json();
      setExperiments(data.results || []);
    } catch (err) {
      console.error("Failed to refresh experiments:", err);
    }
  }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 className="section__title" style={{ fontSize: 28, marginBottom: 20 }}>
          Compare Experiments
        </h1>
      </div>

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
            <RunCard title="Run A" run={runA} index={0} refreshExperiments={refreshExperiments} setSelected={setSelected} />
            <RunCard title="Run B" run={runB} index={1} refreshExperiments={refreshExperiments} setSelected={setSelected} />
          </div>

          {/* Small bar charts for each run (Accuracy, Precision, Recall, F1) */}
          <div className="grid" style={{ gap: 16, marginBottom: 20 }}>
            <div className="card">
              <h3 className="section__title" style={{ marginBottom: 8 }}>Run A Metrics</h3>
              <BarChart metrics={runA?.results} labels={["accuracy", "precision", "recall", "f1"]} />
            </div>
            <div className="card">
              <h3 className="section__title" style={{ marginBottom: 8 }}>Run B Metrics</h3>
              <BarChart metrics={runB?.results} labels={["accuracy", "precision", "recall", "f1"]} />
            </div>
          </div>

          {/* Metrics Table */}
          <div className="card table-wrap">
            <h3 className="section__title" style={{ marginBottom: 12 }}>
              Metrics
            </h3>
            <table className="table metrics-table">
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

function RunCard({ title, run, index = 0, refreshExperiments, setSelected }) {
  const handleRerun = async (e) => {
    e && e.stopPropagation();
    if (!run) return;
    const params = Object.assign({}, run.params || {});
    if (params.dataset) delete params.dataset;
    const q = new URLSearchParams();
    q.set("model", run.model_name);
    q.set("dataset", run.params?.dataset || "");
    try {
      q.set("params", JSON.stringify(params));
    } catch (err) {
      q.set("params", "{}");
    }
    window.location.hash = `#/train?${q.toString()}`;
  };

  return (
    <div className="card" style={{ textAlign: "left", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 className="section__title" style={{ marginBottom: 8 }}>{title}</h3>
        <div style={{ marginLeft: 12 }}>
          <button className="btn" onClick={handleRerun}>Rerun</button>
        </div>
      </div>

      {!run ? (
        <div className="muted">No run selected</div>
      ) : (
        <>
          <div className="muted">Dataset:</div>
          <div>{run.params?.dataset}</div>

          <div className="muted" style={{ marginTop: 8 }}>Model:</div>
          <div>{run.model_name}</div>

          <div className="muted" style={{ marginTop: 8 }}>Created:</div>
          <div>{new Date(run.created_at).toLocaleString()}</div>
        </>
      )}
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

function BarChart({ metrics = {}, labels = [] }) {
  // metrics may be nested in different shapes; normalize to numeric 0..1
  const getVal = (k) => {
    const v = metrics?.[k] ?? metrics?.results?.[k] ?? null;
    if (v == null) return 0;
    const n = Number(v);
    if (Number.isNaN(n)) return 0;
    // If metric looks like a percentage (e.g., 95) convert to 0..1
    if (n > 1) return Math.min(1, n / 100);
    return Math.max(0, Math.min(1, n));
  };

  const rows = labels.map((label) => ({ label, value: getVal(label) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 84, fontSize: 13, color: "#444" }}>{r.label}</div>
          <div style={{ flex: 1, background: "#f1f1f1", height: 18, borderRadius: 6, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.round(r.value * 100)}%`,
                height: "100%",
                background: `linear-gradient(90deg, #4f46e5, #06b6d4)`,
              }}
            />
          </div>
          <div style={{ width: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(r.value * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
}
