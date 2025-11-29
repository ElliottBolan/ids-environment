// src/pages/Compare.jsx
// Compares 2 previous runs selected from the database in a list

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
        setExperiments(data);
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

  if (loading) return <div className="p-6 text-white">Loading...</div>;

  const runA = experiments.find((e) => e.id === selected[0]) || null;
  const runB = experiments.find((e) => e.id === selected[1]) || null;

  return (
    <div className="page">
      <div className="page-center">

        <h1 className="text-3xl font-bold mb-6">Compare Experiments</h1>

        <div className="space-y-3 mb-10">
          {experiments.map((exp) => (
            <div
              key={exp.id}
              className="flex items-center p-3 bg-gray-900 rounded-xl border border-gray-700"
            >
              <input
                type="checkbox"
                checked={selected.includes(exp.id)}
                disabled={
                  !selected.includes(exp.id) && selected.length === 2
                }
                onChange={() => toggleSelect(exp.id)}
                className="mr-3 h-5 w-5"
              />

              <div>
                <div className="font-semibold">
                  {exp.dataset} — {exp.model_name}
                </div>
                <div className="text-gray-400 text-sm">
                  {new Date(exp.finishedAt).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {selected.length === 2 && (
          <div className="mt-10">

            <h2 className="text-2xl font-bold mb-4">Side-by-Side Comparison</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <RunCard title="Run A" run={runA} />
              <RunCard title="Run B" run={runB} />
            </div>

            <h3 className="text-xl font-semibold mb-3">Metrics</h3>
            <table className="min-w-full bg-gray-900 rounded-xl mb-10">
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
                {metricRow("F1", runA.metrics?.f1, runB.metrics?.f1)}
              </tbody>
            </table>

            <h3 className="text-xl font-semibold mb-3">Hyperparameters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <pre className="bg-gray-900 p-4 rounded-xl whitespace-pre-wrap">
                {JSON.stringify(runA.hyperparams, null, 2)}
              </pre>
              <pre className="bg-gray-900 p-4 rounded-xl whitespace-pre-wrap">
                {JSON.stringify(runB.hyperparams, null, 2)}
              </pre>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

function RunCard({ title, run }) {
  return (
    <div className="bg-gray-900 p-6 rounded-xl border border-gray-700">
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <div className="text-gray-300">
        Dataset: <span className="text-white">{run.dataset}</span>
      </div>
      <div className="text-gray-300">
        Model: <span className="text-white">{run.model_name}</span>
      </div>
      <div className="text-gray-300">
        Finished:{" "}
        <span className="text-white">
          {new Date(run.finishedAt).toLocaleString()}
        </span>
      </div>
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
