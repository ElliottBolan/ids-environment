import React, { useEffect, useState } from "react";
import Home from "./pages/Home.jsx";
import Train from "./pages/Train.jsx";
import Results from "./pages/Results.jsx";

function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const push = (to) => (window.location.hash = to.startsWith("/") ? to : `/${to}`);
  return { route, push };
}

export default function App() {
  const { route } = useHashRoute();

  const Header = () => (
    <header style={{
      position:"sticky", top:0, background:"#fff", borderBottom:"1px solid #e5e7eb", zIndex:10
    }}>
      <div className="container" style={{display:"flex",alignItems:"center",justifyContent:"space-between", padding:"12px 16px"}}>
        <a href="#/" style={{fontWeight:700}}>Welcome to IDS-System</a>
        <nav style={{display:"flex", gap:8}}>
          <a className="btn ghost" href="#/train">Train</a>
          <a className="btn ghost" href="#/results">Results</a>
        </nav>
      </div>
    </header>
  );

  let page = <div className="card">Not found</div>;
  if (route === "/" || route === "") page = <Home/>;
  else if (route.startsWith("/train")) page = <Train/>;
  else if (route.startsWith("/results")) page = <Results/>;

  return (
    <div>
      <Header/>
      <main className="container" style={{paddingTop:16, paddingBottom:24}}>
        {page}
      </main>
      <footer className="container" style={{color:"#6b7280", fontSize:12, paddingBottom:24}}>
        Front-end only. Replace mock pieces with your backend later.
      </footer>
    </div>
  );
}
