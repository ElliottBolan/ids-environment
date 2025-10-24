import React from "react";
import Home from "./pages/Home.jsx";
import Train from "./pages/Train.jsx";
import Results from "./pages/Results.jsx";

function useHashRoute() {
  const get = () => window.location.hash.slice(1) || "/";
  const [route, setRoute] = React.useState(get);
  React.useEffect(() => {
    const onHashChange = () => setRoute(get());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const path = route || "/";

  let page = <div className="card">Not found</div>;
  if (path === "/") page = <Home />;
  else if (path.startsWith("/train")) page = <Train />;
  else if (path.startsWith("/results")) page = <Results />;

  const isActive = (p) => (path.startsWith(p) ? "active" : "");

  return (
    <div>
      <header className="shell-header">
        <div className="container shell-header__inner">
          <a href="#/" className="brand-pill">Welcome to IDS-System</a>
          <nav className="toolbar">
            <a className={`btn link-nav ${isActive("/train")}`} href="#/train" aria-current={isActive("/train") ? "page" : undefined}>Train</a>
            <a className={`btn link-nav ${isActive("/results")}`} href="#/results" aria-current={isActive("/results") ? "page" : undefined}>Results</a>
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
