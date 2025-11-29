// src/App.jsx
// Tiny SPA shell using hash-based routing (Landing, Home, Train, Results)
import React from "react";
import Home from "./pages/Home.jsx";
import Train from "./pages/Train.jsx";
import Results from "./pages/Results.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import Compare from "./pages/Compare.jsx";
import { Toaster } from "react-hot-toast";

// Shared CSV helpers and download action from header
const STORAGE_KEY = "ids-runs-simple";
function toCSV(rows, headers) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
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
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function downloadAllCSV() {
  try {
    const runs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const headers = [
      "id",
      "session",
      "dataset",
      "model",
      "accuracy",
      "precision",
      "recall",
      "f1",
      "finishedAt",
      "hyperparams",
    ];
    const mapped = runs.map((r) => ({
      id: r.id,
      session: r.session,
      dataset: r.dataset,
      model: r.model,
      accuracy: r.metrics?.accuracy,
      precision: r.metrics?.precision,
      recall: r.metrics?.recall,
      f1: r.metrics?.f1,
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toLocaleString() : "",
      hyperparams: JSON.stringify(r.hyperparams ?? {}),
    }));
    const csv = toCSV(mapped, headers);
    downloadText("ids_runs.csv", csv, "text/csv");
  } catch (e) {
    console.error("Failed to export CSV", e);
  }
}

// Current route from location.hash (e.g., "#/train" -> "/train")
function useHashRoute() {
  const [route, setRoute] = React.useState(
    () => window.location.hash.slice(1) || "/"
  );
  React.useEffect(() => {
    const onHashChange = () =>
      setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  // Ensure landing route resolves to Home when no hash is present
  React.useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = "#/";
    }
  }, []);

  // Route-to-page mapping
  let page = <div className="card">Not found</div>;
  if (route === "/" || route === "") page = <LandingPage />;
  else if (route.startsWith("/home")) page = <Home />;
  else if (route.startsWith("/train")) page = <Train />;
  else if (route.startsWith("/results")) page = <Results />;
  else if (route.startsWith("/compare")) page = <Compare />;

  // Hide header on landing page
  const showHeader = !(route === "/" || route === "");

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      {showHeader && (
        <header className="shell-header">
          <div className="container shell-header__inner">
            <a href="#/" className="brand-pill">IDS Trainer</a>
            <nav className="toolbar">
              <a className="btn" href="#/train">Train</a>
              <a className="btn" href="#/results">Results</a>
            </nav>
          </div>
        </header>
      )}

      <main className="container" style={{ paddingTop: 16, paddingBottom: 24 }}>
        {page}
      </main>
    </>
  );
}
