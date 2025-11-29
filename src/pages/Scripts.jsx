import React, { useEffect, useRef, useState } from "react";
import NET from "vanta/dist/vanta.net.min";

export default function Scripts({ children }) {
  const vantaRef = useRef(null);
  const [vantaEffect, setVantaEffect] = useState(null);

  useEffect(() => {

    if (!vantaEffect && vantaRef.current) {
      try {
        const effect = NET({
        el: vantaRef.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0x9ddea8,
        backgroundColor: 0x000000,
        maxDistance: 39.0,
        spacing: 19.0,
        showDots: false,
        });
        setVantaEffect(effect);
      } catch (err) {
      console.error("Vanta WebGL failed:", err);
      }
    } 
    return () => {if (vantaEffect) vantaEffect.destroy(); };
  }, [vantaEffect]);

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
    position: "relative",
    width: "100%",
    height: "100%",
    zIndex: 1,
    }}
    >
    {children} </div> </div>
  );
}
