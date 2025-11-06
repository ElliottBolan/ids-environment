// src/App.jsx 
// Tiny SPA shell using hash-based routing (Home, Train, Results).
import React from "react";
import Home from "./pages/Home.jsx";
import Train from "./pages/Train.jsx";
import Results from "./pages/Results.jsx";

// Current route from location.hash (e.g., "#/train" -> "/train")
function useHashRoute() {
  const [route, setRoute] = React.useState(() => window.location.hash.slice(1) || "/");
  React.useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();

  // Route-to-page mapping
  let page = <div className="card">Not found</div>;
  if (route === "/" || route === "") page = <Home />;
  else if (route.startsWith("/train")) page = <Train />;
  else if (route.startsWith("/results")) page = <Results />;

  return (
    <div>
      <header className="shell-header">
        <div className="container shell-header__inner">
          {/* Brand links home */}
          <a href="#/" className="brand-pill">Welcome to IDS-System</a>
          <nav className="toolbar">
            {/* Hash links; no router lib */}
            <a className="btn" href="#/train">Train</a>
            <a className="btn" href="#/results">Results</a>
          </nav>
        </div>
      </header>

      <main className="container" style={{ paddingTop: 16, paddingBottom: 24 }}>
        {/* Active page */}
        {page}
      </main>

      {/* Footer intentionally left blank */}
    </div>
  );
}
