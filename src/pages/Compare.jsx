import React, { useEffect, useState } from "react";

// Local storage key must match Results.jsx
const STORAGE_KEY = "ids-runs-simple";

export default function Compare() {
  const [runA, setRunA] = useState(null);
  const [runB, setRunB] = useState(null);
  const [loading, setLoading] = useState(true);

  // Grab exp1 & exp2 from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idA = params.get("exp1");
    const idB = params.get("exp2");

    const all = readRuns();
    setRunA(all.find(r => r.id === idA) || null);
    setRunB(all.find(r => r.id === idB) || null);
    setLoading(false);
  }, []);

  if (loading) return <div className="p-6 text-white">Loading...</div>;
  if (!runA || !runB) {
    return (
      <div className="p-6 text-white">
        <h1 className="text-2xl font-bold mb-4">Comparison</h1>
        <div className="text-red-400">One or both run IDs are missing or invalid.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-black text-white p-6">
      <h1 className="text-3xl font-bold mb-6">Compare Run Results</h1>

      {/* Search & Selection */}
        <SearchSelectSection setRunA={setRunA} setRunB={setRunB} />

      {/* Side-by-side summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <RunCard title="Run A" run={runA} />
        <RunCard title="Run B" run={runB} />
      </div>

      {/* Metrics table */}
      <h2 className="text-2xl font-semibold mb-3">Metrics Comparison</h2>
      <div className="overflow-x-auto mb-10">
        <table className="min-w-full bg-gray-900 rounded-2xl">
          <thead>
            <tr className="text-left border-b border-gray-700">
              <th className="p-3">Metric</th>
              <th className="p-3">Run A</th>
              <th className="p-3">Run B</th>
            </tr>
          </thead>
          <tbody>
            {metricRow("Accuracy", runA.metrics?.accuracy, runB.metrics?.accuracy)}
            {metricRow("Precision", runA.metrics?.precision, runB.metrics?.precision)}
            {metricRow("Recall", runA.metrics?.recall, runB.metrics?.recall)}
            {metricRow("F1 Score", runA.metrics?.f1, runB.metrics?.f1)}
          </tbody>
        </table>
      </div>

      {/* Hyperparameters */}
      <h2 className="text-2xl font-semibold mb-3">Hyperparameters</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <pre className="bg-gray-900 p-4 rounded-2xl whitespace-pre-wrap">
{JSON.stringify(runA.hyperparams ?? {}, null, 2)}
        </pre>
        <pre className="bg-gray-900 p-4 rounded-2xl whitespace-pre-wrap">
{JSON.stringify(runB.hyperparams ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function SearchSelectSection({ setRunA, setRunB }) {
    const [query, setQuery] = useState("");
    const [runs] = useState(readRuns());
    const [pickMode, setPickMode] = useState("A"); // "A" or "B"
  
    const filtered = runs.filter(r => {
      const text = query.toLowerCase();
      return (
        r.dataset.toLowerCase().includes(text) ||
        r.model.toLowerCase().includes(text) ||
        JSON.stringify(r.hyperparams).toLowerCase().includes(text) ||
        new Date(r.finishedAt).toLocaleString().toLowerCase().includes(text)
      );
    });
  
    return (
      <div className="bg-gray-900 p-4 rounded-2xl mb-8">
        <h2 className="text-xl font-semibold mb-3">Search & Select Experiments</h2>
  
        {/* Search bar */}
        <input
          type="text"
          placeholder="Search by dataset, model, date, or params..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full p-3 rounded-xl bg-gray-800 border border-gray-700 mb-4"
        />
  
        {/* Toggle which run to assign */}
        <div className="flex gap-3 mb-4">
          <button
            className={`px-4 py-2 rounded-xl ${pickMode === "A" ? "bg-blue-600" : "bg-gray-700"}`}
            onClick={() => setPickMode("A")}
          >
            Assign to Run A
          </button>
          <button
            className={`px-4 py-2 rounded-xl ${pickMode === "B" ? "bg-blue-600" : "bg-gray-700"}`}
            onClick={() => setPickMode("B")}
          >
            Assign to Run B
          </button>
        </div>
  
        {/* Results list */}
        <div className="max-h-64 overflow-y-auto space-y-2">
          {filtered.length === 0 && (
            <div className="text-gray-400">No matches.</div>
          )}
  
          {filtered.map(r => (
            <div
              key={r.id}
              className="p-3 bg-gray-800 rounded-xl border border-gray-700 hover:bg-gray-700 cursor-pointer"
              onClick={() => {
                if (pickMode === "A") setRunA(r);
                else setRunB(r);
              }}
            >
              <div className="font-semibold">{r.dataset} — {r.model}</div>
              <div className="text-gray-400 text-sm">
                {new Date(r.finishedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }  

function RunCard({ title, run }) {
  return (
    <div className="bg-gray-900 p-6 rounded-2xl border border-gray-700">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      <div className="text-gray-300">Dataset: <span className="text-white">{run.dataset}</span></div>
      <div className="text-gray-300">Model: <span className="text-white">{run.model}</span></div>
      <div className="text-gray-300">Finished: <span className="text-white">{new Date(run.finishedAt).toLocaleString()}</span></div>
    </div>
  );
}

function metricRow(label, a, b) {
  return (
    <tr className="border-b border-gray-800" key={label}>
      <td className="p-3 font-semibold">{label}</td>
      <td className="p-3">{a ?? "—"}</td>
      <td className="p-3">{b ?? "—"}</td>
    </tr>
  );
}

function readRuns() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}