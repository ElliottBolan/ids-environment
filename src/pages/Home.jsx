// src/pages/Home.jsx 
/*
  Landing page with two primary actions:
  - Train: navigate to the training workflow (dataset/model + run)
  - Results: browse, filter, and export previously saved runs
  This page is intentionally minimal; it just routes the user.
*/
import React from "react";

export default function Home() {
  return (
    <div className="page-center">
      <section className="hero">
        <div className="hero__inner">
          <h1 className="hero-title">Get Started</h1>
          <p className="hero-subtitle">Choose a path to begin</p>
  
          <div className="hero-grid">
            {/* Card linking to the training page */}
            <div className="card card--action card--accent">
              <h3 className="section__title" style={{ fontSize: 18 }}>Train Models</h3>
              <p className="muted card__desc">
                Select datasets and algorithms, then launch multiple runs.
              </p>
              <a className="btn btn-lg" href="#/train">Train</a>
            </div>
            {/* Card linking to the results page */}
            <div className="card card--action card--accent">
              <h3 className="section__title" style={{ fontSize: 18 }}>View Results</h3>
              <p className="muted card__desc">
                Browse, compare, and download past runs.
              </p>
              <a className="btn btn-lg" href="#/results">Results</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
