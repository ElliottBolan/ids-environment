// src/pages/Results.jsx
// Backend-only results browser with trend line visualization (Option 2)

import React, { useEffect, useState, useRef } from "react";
import { API_BASE } from "../api";


export default function Results() {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);

  const MODELS = ["LightGBM", "XGBoost", "CatBoost", "LCCDE"];
  const [activeModel, setActiveModel] = useState("LCCDE");

  const [model, setModel] = useState("");
  const [runId, setRunId] = useState("");
  const [startDate, setStartDate] = useState("");

  const [datasets, setDatasets] = useState([]);
  const [dataset, setDataset] = useState("");

  const [selectedRun, setSelectedRun] = useState(null);

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

    async function loadDatasets() {
      try {
        const res = await fetch(`${API_BASE}/api/datasets`);
        const data = await res.json();
        setDatasets(data.datasets || []);
      } catch (err) {
        console.error("Failed to load datasets:", err);
      }
    }

    load();
    loadDatasets();
  }, []);

  // Runs for the active model
  const view = experiments.filter((e) => e.model_name === activeModel);

  const latest = view[0];
  const activeRun = selectedRun || latest;

  const applyFilters = async () => {
    const params = new URLSearchParams();
    if (model) params.append("model", model);
    if (runId) params.append("run_id", runId);
    if (startDate) params.append("start_date", startDate);
    if (dataset) params.append("dataset", dataset);

    const res = await fetch(`${API_BASE}/api/experiments?${params.toString()}`);
    const data = await res.json();
    setExperiments(data.results || []);
  };

  return (
    <>
      {/* HEADER */}
      <section className="wf-shell">
        <div className="wf-topbar">
          <a className="wf-back" href="#/train">
            ← Go back
          </a>
          <h1 className="wf-title">LCCDE Model Results</h1>
        </div>

        {/* MODEL TABS */}
        <div className="wf-tabs">
          {MODELS.map((m) => (
            <button
              key={m}
              className={`wf-tab ${activeModel === m ? "is-active" : ""}`}
              onClick={() => {
                setActiveModel(m);
                setSelectedRun(null);
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* MAIN PANEL */}
        <div className="wf-content">
          {!activeRun ? (
            <div className="muted p-4">No runs found for {activeModel}.</div>
          ) : (
            <>
              {/* <div style={{ width: "360px" }}>
                <MetricTrendChart runs={view} />
              </div> */}

              <div className="wf-times muted">
                Duration: {activeRun?.duration_s ?? "—"} s
              </div>

              {/* Metrics Panel */}
              <div className="wf-metrics">
                {metricLine("Accuracy", activeRun.results?.accuracy)}
                {metricLine("Precision", activeRun.results?.precision)}
                {metricLine("Recall", activeRun.results?.recall)}
                {metricLine("F1", activeRun.results?.f1)}
              </div>

              <button
                className="btn btn-lg"
                onClick={() => (window.location.hash = "#/compare")}
              >
                Compare Previous Runs
              </button>
            </>
          )}
        </div>
      </section>

      {/* FILTER PANEL */}
      <div className="card mb-12" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Filter Results</h3>

        <div className="form-grid">
          <div className="field">
            <label className="label">Model</label>
            <select
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">All Models</option>
              <option value="LCCDE">LCCDE</option>
              <option value="XGBoost">XGBoost</option>
              <option value="CatBoost">CatBoost</option>
              <option value="LightGBM">LightGBM</option>
            </select>
          </div>

          <div className="field">
            <label className="label">Dataset</label>
            <select
              className="input"
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
            >
              <option value="">All Datasets</option>
              {datasets.map((d) => (
                <option key={d} value={d}>
                  {d.replace(".csv", "")}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label">Run ID</label>
            <input
              type="number"
              className="input"
              placeholder="e.g. 12"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label">Start Date</label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>

        <button className="btn mt-12" onClick={applyFilters}>
          Apply Filters
        </button>
      </div>

      {/* FULL EXPERIMENT TABLE */}
      <section className="section">
        <div className="section__head">
          <h2 className="section__title">All Experiments</h2>
          <div className="section__hint">{experiments.length} total</div>
        </div>

        <div className="card table-wrap">
          {loading ? (
            <div className="muted p-4">Loading...</div>
          ) : experiments.length === 0 ? (
            <div className="muted p-4">No experiments available.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Model</th>
                  <th>Accuracy</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((exp) => (
                  <tr
                    key={exp.id}
                    onClick={() => {
                      setSelectedRun(exp);
                      setActiveModel(exp.model_name);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{exp.params?.dataset}</td>
                    <td>{exp.model_name}</td>
                    <td>{fmt(exp.results?.accuracy)}</td>
                    <td>{fmt(exp.results?.precision)}</td>
                    <td>{fmt(exp.results?.recall)}</td>
                    <td>{fmt(exp.results?.f1)}</td>
                    <td>{new Date(exp.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

/* ---------- Helpers ---------- */
function metricLine(label, val) {
  return (
    <div>
      <span className="wf-metric__label">{label}:</span>{" "}
      <span className="wf-metric__val">{fmt(val)}</span>
    </div>
  );
}

function fmt(v) {
  if (typeof v !== "number") return "—";
  return (v * 100).toFixed(2) + "%";
}
