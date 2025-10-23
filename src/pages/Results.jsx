import React, { useMemo, useState } from "react";

const STORAGE_KEY = "ids-runs-simple";

export default function Results() {
  const [runs, setRuns] = useState(() => readRuns());
  const [selected, setSelected] = useState({}); // {id: true}

  const selectedRows = useMemo(
    () => runs.filter(r => selected[r.id]),
    [runs, selected]
  );

  const refresh = () => setRuns(readRuns());
  const clearAll = () => {
    if (window.confirm("Delete all saved runs?")) {
      localStorage.removeItem(STORAGE_KEY);
      setRuns([]); setSelected({});
    }
  };
  const toggle = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));

  const downloadCSV = () => {
    const rows = selectedRows.length ? selectedRows : runs;
    const headers = ["id","dataset","model","accuracy","precision","recall","f1","finishedAt"];
    const mapped = rows.map(r => ({
      id: r.id,
      dataset: r.dataset,
      model: r.model,
      accuracy: r.metrics?.accuracy,
      precision: r.metrics?.precision,
      recall: r.metrics?.recall,
      f1: r.metrics?.f1,
      finishedAt: new Date(r.finishedAt).toLocaleString(),
    }));
    const csv = toCSV(mapped, headers);
    downloadText("ids_runs.csv", csv, "text/csv");
  };

  return (
    <div>
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <button className="btn ghost" onClick={refresh}>Refresh</button>
        <button className="btn primary" onClick={downloadCSV}>Download CSV</button>
        <button className="btn ghost" onClick={clearAll}>Delete All</button>
      </div>

      {selectedRows.length >= 2 && (
        <div className="card">
          <div style={{ marginBottom:8, fontWeight:600 }}>Compare ({selectedRows.length})</div>
          <SmallTable rows={selectedRows}/>
        </div>
      )}

      <div className="card">
        <div style={{ marginBottom:8, fontWeight:600 }}>All Runs ({runs.length})</div>
        {runs.length === 0 ? (
          <div style={{ color:"#6b7280" }}>No runs yet. Run some experiments on the Train page.</div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Pick</th><th>Dataset</th><th>Model</th>
                  <th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>Finished</th>
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
          </div>
        )}
      </div>
    </div>
  );
}

function readRuns() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function SmallTable({ rows }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Dataset</th><th>Model</th><th>Acc</th><th>Prec</th><th>Rec</th><th>F1</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.dataset}</td>
              <td>{r.model}</td>
              <td>{r.metrics?.accuracy}</td>
              <td>{r.metrics?.precision}</td>
              <td>{r.metrics?.recall}</td>
              <td>{r.metrics?.f1}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toCSV(rows, headers) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (/[,\"\n]/.test(s)) return '"' + s.replace(/\"/g, '""') + '"';
    return s;
  };
  const head = headers.map(esc).join(",");
  const body = rows.map(r => headers.map(h => esc(r[h])).join(",")).join("\n");
  return head + "\n" + body;
}

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
