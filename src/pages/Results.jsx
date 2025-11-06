// src/pages/Results.jsx 
// Results browser backed by localStorage: list, select, export CSV, delete all.
import React, { useMemo, useState } from "react";
const STORAGE_KEY = "ids-runs-simple";

export default function Results() {
  const [runs, setRuns] = useState(() => readRuns());
  // Selected rows map: { [id]: true }
  const [selected, setSelected] = useState({});
  const selectedRows = useMemo(() => runs.filter(r => selected[r.id]), [runs, selected]);
  // Wireframe: simple tab state to preview the latest run per model
  const MODELS = ["LightGBM","XGBoost","CatBoost"];
  const [activeModel, setActiveModel] = useState(MODELS[1]);
  // Show/hide legacy Results blocks below the wireframe
  const SHOW_LEGACY = false;

  const latestForModel = (m) => runs
    .filter(r => r.model === m)
    .slice()
    .sort((a,b) => b.finishedAt - a.finishedAt)[0];
  const activeRun = latestForModel(activeModel);

  // Pick the model with the highest accuracy among latest-per-model runs
  const selectBestByAccuracy = () => {
    const latest = MODELS.map(m => latestForModel(m)).filter(Boolean);
    if (!latest.length) return;
    const best = latest.reduce((a, b) => ((a?.metrics?.accuracy ?? -Infinity) >= (b?.metrics?.accuracy ?? -Infinity) ? a : b));
    if (best?.model) setActiveModel(best.model);
  };

  const refresh = () => setRuns(readRuns());
  const clearAll = () => {
    if (window.confirm("Delete all saved runs?")) {
      localStorage.removeItem(STORAGE_KEY);
      setRuns([]); setSelected({});
    }
  };
  const toggle = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));

  const downloadCSV = () => {
    // Export selected rows, or everything if none selected
    const rows = selectedRows.length ? selectedRows : runs;
    const headers = ["id","dataset","model","accuracy","precision","recall","f1","finishedAt","hyperparams"];
    const mapped = rows.map(r => ({
      id: r.id,
      dataset: r.dataset,
      model: r.model,
      accuracy: r.metrics?.accuracy,
      precision: r.metrics?.precision,
      recall: r.metrics?.recall,
      f1: r.metrics?.f1,
      finishedAt: new Date(r.finishedAt).toLocaleString(),
      hyperparams: JSON.stringify(r.hyperparams ?? {}),
    }));
    const csv = toCSV(mapped, headers);
    downloadText("ids_runs.csv", csv, "text/csv");
  };

  return (
    <>
      {/* Wireframe-style header and model display */}
      <section className="wf-shell">
        <div className="wf-topbar">
          <a className="wf-back" href="#/train">← Go back</a>
          <h1 className="wf-title">LCCDE Model Display</h1>
        </div>

        <div className="wf-tabs">
          {MODELS.map(m => (
            <button
              key={m}
              className={`wf-tab ${activeModel === m ? 'is-active' : ''}`}
              onClick={() => setActiveModel(m)}
            >{m}</button>
          ))}
        </div>

        <div className="wf-content">
          <div className="wf-heatmap">
            {/* Placeholder image area; swap to real confusion matrix when available */}
            <div className="wf-heatmap__placeholder">Confusion Matrix</div>
            <div className="wf-times muted">
              Cpu time(total): 18.1 s · Wall time: 11.7 s
            </div>
          </div>

          <div className="wf-metrics">
            <div><span className="wf-metric__label">Accuracy:</span> <span className="wf-metric__val">{fmt(activeRun?.metrics?.accuracy)}</span></div>
            <div><span className="wf-metric__label">Precision:</span> <span className="wf-metric__val">{fmt(activeRun?.metrics?.precision)}</span></div>
            <div><span className="wf-metric__label">Recall:</span> <span className="wf-metric__val">{fmt(activeRun?.metrics?.recall)}</span></div>
            <div><span className="wf-metric__label">F1 :</span> <span className="wf-metric__val">{fmt(activeRun?.metrics?.f1)}</span></div>
          </div>

          <div className="wf-actions">
            <button className="wf-oval" onClick={selectBestByAccuracy}>Compare Models</button>
            <button className="wf-oval" onClick={() => downloadCSV()}>Download CSV</button>
          </div>
        </div>
      </section>

      {SHOW_LEGACY && (
        <>
          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Results</h2>
              <div className="section__hint">{runs.length} total</div>
            </div>
            <div className="card toolbar">
              <button className="btn" onClick={refresh}>Refresh</button>
              <button className="btn" onClick={downloadCSV}>Download CSV</button>
              <button className="btn" onClick={clearAll}>Delete All</button>
            </div>
          </section>

          {selectedRows.length >= 1 && (
            <section className="section">
              <div className="section__head">
                <h2 className="section__title">Hyperparameters</h2>
                <div className="section__hint">{selectedRows.length} selected</div>
              </div>
              <div className="card" style={{ display: "grid", gap: 12 }}>
                {selectedRows.map(r => (
                  <div key={r.id} className="card" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {r.dataset} — {r.model} <span className="muted">({new Date(r.finishedAt).toLocaleString()})</span>
                    </div>
                    <pre className="textarea" style={{ margin: 0 }}>
{JSON.stringify(r.hyperparams ?? {}, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <div className="section__head">
              <h2 className="section__title">All Runs</h2>
              <div className="section__hint">Newest first</div>
            </div>
            <div className="card table-wrap">
              {runs.length === 0 ? (
                <div className="muted">No runs yet. Run some experiments on the Train page.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Pick</th>
                      <th>Dataset</th>
                      <th>Model</th>
                      <th>Accuracy</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1</th>
                      <th>Finished</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.slice().sort((a,b) => b.finishedAt - a.finishedAt).map(r => (
                      <tr key={r.id}>
                        <td><input type="checkbox" checked={!!selected[r.id]} onChange={() => toggle(r.id)} /></td>
                        <td>{r.dataset}</td>
                        <td>{r.model}</td>
                        <td>{r.metrics?.accuracy}</td>
                        <td>{r.metrics?.precision}</td>
                        <td>{r.metrics?.recall}</td>
                        <td>{r.metrics?.f1}</td>
                        <td>{new Date(r.finishedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}

// Format metric (0..1) to percentage with one decimal; dash if missing
function fmt(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function readRuns() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function toCSV(rows, headers) {
  // Minimal CSV with escaping for quotes/newlines/commas
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    // eslint-disable-next-line no-useless-escape
    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map(r => headers.map(h => esc(r[h])).join(",")).join("\n");
  return head + "\n" + body;
}
function downloadText(filename, text, type = "text/plain") {
  // Blob + temporary link to trigger a download
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
