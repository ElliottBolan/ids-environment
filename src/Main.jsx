// src/main.jsx
// Alternative entry used by non-CRA setups (e.g., Vite). It mounts the
// App component into the #root element and includes global styles.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(<App />);
