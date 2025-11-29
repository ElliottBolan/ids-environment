// src/index.js
// CRA-style entry file: mounts <App /> into #root and pulls in global styles.
import React from "react";
import { ReactDOM } from "react-dom";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css"; 

const container = document.getElementById("root");
const root = createRoot(container);

root.render(
  <React.StrictMode>
    {/* StrictMode helps surface potential side effects in development */}
    <App />
  </React.StrictMode>
);
