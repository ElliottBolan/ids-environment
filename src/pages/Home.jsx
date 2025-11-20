// src/pages/Home.jsx 
/*
  Landing page with two primary actions:
  - Train: navigate to the training workflow (dataset/model + run)
  - Results: browse, filter, and export previously saved runs
  This page is intentionally minimal; it just routes the user.
*/

// src/pages/Home.jsx

// src/pages/Home.jsx
import React, { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { Brain, BarChart3 } from "lucide-react";

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
    <div className="page-center min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <section className="hero text-center p-6">
        <div className="hero__inner space-y-6">
          <h1 className="hero-title text-4xl font-bold text-gray-800">Get Started</h1>
          <p className="hero-subtitle text-gray-500 text-lg">Choose what you want to do — train new models or explore past results.</p>

          <div className="hero-grid grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8 max-w-3xl mx-auto">
            {/* Card: Train Models */}
            <div className="card card--action card--accent hover:shadow-xl transition-transform transform hover:-translate-y-1 bg-white rounded-2xl p-6 border border-gray-200">
              <div className="flex flex-col items-center space-y-4">
                <Brain size={40} className="text-blue-600" />
                <h3 className="section__title text-lg font-semibold text-gray-800">Train Models</h3>
                <p className="muted card__desc text-gray-500 text-sm text-center">
                  Select datasets and algorithms, then launch multiple runs.
                </p>
                <a
                  href="#/train"
                  className="btn btn-lg bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  Train
                </a>
              </div>
            </div>

            {/* Card: View Results */}
            <div className="card card--action card--accent hover:shadow-xl transition-transform transform hover:-translate-y-1 bg-white rounded-2xl p-6 border border-gray-200">
              <div className="flex flex-col items-center space-y-4">
                <BarChart3 size={40} className="text-green-600" />
                <h3 className="section__title text-lg font-semibold text-gray-800">
                  View Results
                </h3>
                <p className="muted card__desc text-gray-500 text-sm text-center">
                  Browse, compare, and download past training runs.
                </p>
                <a
                  href="#/results"
                  className="btn btn-lg bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition"
                >
                  Results
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
