// src/App.jsx 
import React from "react";
import Home from "./pages/Home.jsx";
import Train from "./pages/Train.jsx";
import Results from "./pages/Results.jsx";

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

  let page = <div className="card">Not found</div>;
  if (route === "/" || route === "") page = <Home />;
  else if (route.startsWith("/train")) page = <Train />;
  else if (route.startsWith("/results")) page = <Results />;

  return (
    <div>
      <header className="shell-header">
        <div className="container shell-header__inner">
          <a href="#/" className="brand-pill">Welcome to IDS-System</a>
          <nav className="toolbar">
            <a className="btn" href="#/train">Train</a>
            <a className="btn" href="#/results">Results</a>
          </nav>
        </div>
      </header>

      <main className="container" style={{ paddingTop: 16, paddingBottom: 24 }}>
        {page}
      </main>

      <footer className="container" style={{ color: "var(--muted)", fontSize: 12, paddingBottom: 24 }}>
        Front-end only. Replace mock pieces with your backend later.
      </footer>
    </div>
  );
}
