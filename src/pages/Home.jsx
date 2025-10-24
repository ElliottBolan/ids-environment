import React from "react";

export default function Home() {
  return (
    <section className="section section--ids">
      <div className="section__head">
        <h2 className="section__title">Get started</h2>
        <div className="section__hint">Choose a workflow</div>
      </div>
      <div className="grid">
        <div className="card">
          <h3 className="section__title" style={{ fontSize: 18 }}>Train Models</h3>
          <p className="muted" style={{ margin: "6px 0 14px" }}>
            Select datasets and algorithms, then launch multiple runs.
          </p>
          <a className="btn" href="#/train">Train</a>
        </div>
        <div className="card">
          <h3 className="section__title" style={{ fontSize: 18 }}>View Results</h3>
          <p className="muted" style={{ margin: "6px 0 14px" }}>
            Browse, compare, and download past runs.
          </p>
          <a className="btn" href="#/results">Results</a>
        </div>
      </div>
    </section>
  );
}
