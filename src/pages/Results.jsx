// src/pages/Results.jsx 
// Results browser backed by localStorage: list, select, export CSV, delete all.
import React, { useMemo, useState } from "react";
const STORAGE_KEY = "ids-runs-simple";

export default function Results() {
  const [runs, setRuns] = useState(() => readRuns());
  // Selected rows map: { [id]: true }
  const [selected, setSelected] = useState({});
  const selectedRows = useMemo(() => runs.filter(r => selected[r.id]), [runs, selected]);

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
  );
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
