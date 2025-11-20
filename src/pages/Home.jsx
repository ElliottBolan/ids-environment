// src/pages/Home.jsx 
/*
  Landing page with two primary actions:
  - Train: navigate to the training workflow (dataset/model + run)
  - Results: browse, filter, and export previously saved runs
  This page is intentionally minimal; it just routes the user.
*/
// src/pages/Home.jsx
import React, { useEffect, useState } from "react";
import { API_BASE } from "../api";

export default function Home() {
  const [backendStatus, setBackendStatus] = useState("Checking...");

  // On page load, verify backend is up
  useEffect(() => {
  fetch(`${API_BASE}/api/hello`)
    .then((res) => res.json())
    .then((data) => {
      console.log("Backend status:", data.message);
      setBackendStatus(data.message); // sends status message to console
    })
    .catch(() => {
      console.error("Backend unreachable!");
      setBackendStatus("Cannot reach backend");
    });
}, []);

  return (
    <section className="hero">
      <div className="hero__inner">
        <h1 className="hero-title">Get Started</h1>

        {/* Backend status indicator (for debugging) */}
        {/* <p style={{ marginBottom: "20px", color: "#555" }}>
          Backend status:{" "}
          <span
            style={{
              color: backendStatus.includes("successfully") ? "green" : "red",
              fontWeight: "bold",
            }}
          >
            {backendStatus}
          </span>
        </p> */}

        <div className="hero-grid">
          {/* Train card */}
          <div className="card card--action card--accent">
            <h3 className="section__title" style={{ fontSize: 18 }}>
              Train Models
            </h3>
            <p className="muted" style={{ margin: "6px 0 14px" }}>
              Select datasets and algorithms, then launch multiple runs.
            </p>
            <a className="btn btn-lg" href="#/train">Train</a>
          </div>

          {/* Results card */}
          <div className="card card--action card--accent">
            <h3 className="section__title" style={{ fontSize: 18 }}>
              View Results
            </h3>
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
