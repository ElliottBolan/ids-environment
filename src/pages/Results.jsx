// src/pages/Results.jsx
// Backend-only results browser for LCCDE experiments

import React, { useEffect, useState } from "react";
import { API_BASE } from "../api";

export default function Results() {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);

  const MODELS = ["LightGBM", "XGBoost", "CatBoost", "LCCDE"];
  const [activeModel, setActiveModel] = useState("LCCDE");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/experiments`);
        const data = await res.json();

        console.log("Loaded experiment data:", data);

        setExperiments(data.results || []);
      } catch (err) {
        console.error("Failed to load experiments:", err);
      }
      setLoading(false);
    }

    load();
  }, []);

  // Filter by model (default: LCCDE)
  const view = experiments.filter((e) => e.model_name === activeModel);

  // Most recent run
  const latest = view[0];

  return (
    <>
      {/* HEADER */}
      <section className="wf-shell">
        <div className="wf-topbar">
          <a className="wf-back" href="#/train">← Go back</a>
          <h1 className="wf-title">LCCDE Model Results</h1>
        </div>

        {/* MODEL TABS */}
        <div className="wf-tabs">
          {MODELS.map((m) => (
            <button
              key={m}
              className={`wf-tab ${activeModel === m ? "is-active" : ""}`}
              onClick={() => setActiveModel(m)}
            >
              {m}
            </button>
          ))}
        </div>

        {/* MAIN PANEL */}
        <div className="wf-content">
          {!latest ? (
            <div className="muted p-4">No runs found for {activeModel}.</div>
          ) : (
            <>
              <div className="wf-heatmap">
                <div className="wf-heatmap__placeholder">Confusion Matrix</div>
                <div className="wf-times muted">
                  Duration: {latest.duration_s ?? "—"} s
                </div>
              </div>

              <div className="wf-metrics">
                {metricLine("Accuracy", latest.results?.accuracy)}
                {metricLine("Precision", latest.results?.precision)}
                {metricLine("Recall", latest.results?.recall)}
                {metricLine("F1", latest.results?.f1)}
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
                  <tr key={exp.id}>
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
