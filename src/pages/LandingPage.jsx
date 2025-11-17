import React from "react";
import Scripts from "./Scripts"

export default function LandingPage() {
  const goHome = () => {
    window.location.hash = "#/home"; 
  };

  return (
    <Scripts>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          textAlign: "center",
          padding: "0 16px",
        }}
      >
        <h1 className="hero-title">
          Changing the future of Internet Safety, one step at a time.
        </h1>
        <p className="hero-subtitle">
          Streamline your experiments with ease.
        </p>
        <button className="btn btn-lg mt-12" onClick={() => window.location.hash = "#/home"}>
          Begin
        </button>
      </div>
    </Scripts>
  );
}
