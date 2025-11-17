// src/components/Scripts.jsx
import React, { useEffect, useRef } from "react";
import NET from "vanta/dist/vanta.net.min";
import * as THREE from "three"; 

export default function Scripts({ children }) {
  const vantaRef = useRef(null);
  const vantaEffectRef = useRef(null);

  useEffect(() => {
    if (!vantaEffectRef.current) {
      vantaEffectRef.current = NET({
        el: vantaRef.current,
        THREE,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0x9ddea8,
        backgroundColor: 0xaca8af,
        maxDistance: 39.0,
        spacing: 19.0,
        showDots: false,
      });
    }

    return () => {
      if (vantaEffectRef.current) vantaEffectRef.current.destroy();
    };
  }, []);

  return (
    <div
      ref={vantaRef}
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 0,
      }}
    >
      <div
        style={{
          position: "relative",   // <-- relative or absolute, zIndex > 0
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
