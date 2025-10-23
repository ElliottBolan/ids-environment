import React from "react";

export default function Home() {
  const grid = { display:"grid", gap:16, gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))" };
  const h1 = { margin:0, fontSize:20 };
  const p = { margin:"8px 0 16px", color:"#6b7280" };

  return (
    <div style={grid}>
      <div className="card">
        <h1 style={h1}>Train Models</h1>
        <p style={p}>Pick datasets & models, then launch runs.</p>
        <a className="btn primary" href="#/train">Go to Train</a>
      </div>
      <div className="card">
        <h1 style={h1}>View Results</h1>
        <p style={p}>Browse & download past runs.</p>
        <a className="btn primary" href="#/results">Go to Results</a>
      </div>
    </div>
  );
}
