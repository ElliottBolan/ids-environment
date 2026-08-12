// src/pages/Results.jsx
// Backend-only results browser with trend line visualization (Option 2)

import React, { useEffect, useState, useRef } from "react";
import { API_BASE } from "../api";


export default function Results() {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [models, setModels] = useState(["LCCDE"]);
  const [activeModel, setActiveModel] = useState("LCCDE");

  const [model, setModel] = useState("");
  const [runId, setRunId] = useState("");
  const [startDate, setStartDate] = useState("");

  const [datasets, setDatasets] = useState([]);
  const [dataset, setDataset] = useState("");

  const [selectedRun, setSelectedRun] = useState(null);
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

    async function loadModels() {
      try {
        const res = await fetch(`${API_BASE}/api/models`);
        const data = await res.json();
        const names = data.names || (data.models || []).map((m) => m.name);
        if (names && names.length) {
          setModels(names);
          if (!names.includes(activeModel)) {
            setActiveModel("LCCDE");
          }
        }
      } catch (err) {
        console.error("Failed to load models:", err);
      }
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
    loadModels();
    loadDatasets();

    // poll running state for any in-progress runs
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
          {models.map((m) => (
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

              {/* One panel per result set. An LCCDE run produces four: the three
                  base learners plus the ensemble that combines them. */}
              {resultSets(activeRun).map((set) => (
                <div key={set.key} className="card" style={{ marginTop: 16, padding: 16 }}>
                  <h3 style={{ marginBottom: 8 }}>{set.label}</h3>

                  <div className="wf-metrics">
                    {metricLine("Accuracy", set.accuracy)}
                    {metricLine("Precision", set.precision)}
                    {metricLine("Recall", set.recall)}
                    {metricLine("F1", set.f1)}
                  </div>

                  {hasMatrix(activeRun, set.key) ? (
                    <div style={{ marginTop: 12 }}>
                      <img
                        alt={`confusion-matrix-${set.key}`}
                        src={`${API_BASE}/api/confusion/${activeRun.id}?source=${encodeURIComponent(set.key)}`}
                        style={{ maxWidth: "100%", border: "1px solid #ddd" }}
                      />
                      <div style={{ marginTop: 8 }}>
                        <button
                          className="btn"
                          onClick={() =>
                            window.open(
                              `${API_BASE}/api/confusion/${activeRun.id}?source=${encodeURIComponent(set.key)}`,
                              "_blank"
                            )
                          }
                        >
                          Open Full Size
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="muted" style={{ marginTop: 12 }}>
                      No confusion matrix stored for this result set.
                    </div>
                  )}
                </div>
              ))}
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
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
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
            <table className="table experiments-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Dataset</th>
                  <th>Model</th>
                  <th>Accuracy</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                  <th>Created</th>
                  <th aria-hidden="true" style={{ width: 80 }}></th>
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
                    <td>{exp.id}</td>
                    <td>{exp.params?.dataset}</td>
                    <td>{exp.model_name}</td>
                    <td>{fmt(exp.results?.accuracy)}</td>
                    <td>{fmt(exp.results?.precision)}</td>
                    <td>{fmt(exp.results?.recall)}</td>
                    <td>{fmt(exp.results?.f1)}</td>
                    <td>{new Date(exp.created_at).toLocaleString()}</td>
                    <td className="actions">
                      <div className="row-actions">
                        <button
                          className="btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            const params = Object.assign({}, exp.params || {});
                            if (params.dataset) delete params.dataset;
                            const q = new URLSearchParams();
                            q.set("model", exp.model_name);
                            q.set("dataset", exp.params?.dataset || exp.dataset || "");
                            try {
                              q.set("params", JSON.stringify(params));
                            } catch (err) {
                              q.set("params", "{}");
                            }
                            window.location.hash = `#/train?${q.toString()}`;
                          }}
                        >
                          Rerun
                        </button>
                      </div>
                    </td>
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
// Runs saved before per-model results existed only have the flat top-level
// metrics, so fall back to showing those as a single set.
function resultSets(run) {
  const perModel = run?.results?.per_model;
  if (Array.isArray(perModel) && perModel.length > 0) return perModel;

  return [
    {
      key: "top",
      label: run?.model_name || "Results",
      accuracy: run?.results?.accuracy,
      precision: run?.results?.precision,
      recall: run?.results?.recall,
      f1: run?.results?.f1,
    },
  ];
}

function hasMatrix(run, key) {
  const stored = run?.confusion_matrices || [];
  if (stored.length === 0) return false;
  // A single-set run stores its matrix under "top" regardless of the label.
  if (stored.some((c) => c.source === key)) return true;
  return key === "top" && stored.some((c) => c.source === "top");
}

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
