// src/pages/Home.jsx 
import React from "react";

export default function Home() {
  return (
    <section className="hero">
      <div className="hero__inner">
        <h1 className="hero-title">Get started</h1>
  
        <div className="hero-grid">
          <div className="card card--action card--accent">
            <h3 className="section__title" style={{ fontSize: 18 }}>Train Models</h3>
            <p className="muted" style={{ margin: "6px 0 14px" }}>
              Select datasets and algorithms, then launch multiple runs.
            </p>
            <a className="btn btn-lg" href="#/train">Train</a>
          </div>
          <div className="card card--action card--accent">
            <h3 className="section__title" style={{ fontSize: 18 }}>View Results</h3>
            <p className="muted" style={{ margin: "6px 0 14px" }}>
              Browse, compare, and download past runs.
            </p>
            <a className="btn btn-lg" href="#/results">Results</a>
          </div>
        </div>
      </div>
    </section>
  );
}
