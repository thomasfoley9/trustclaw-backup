"use client";

import type { CSSProperties } from "react";

interface OpenClawLogoProps {
  size?: number;
  className?: string;
}

// Source artwork is authored at 300x350; scale the whole thing to fit `size`.
const ART_WIDTH = 300;
const ART_HEIGHT = 350;

const styles: Record<string, CSSProperties> = {
  container: {
    position: "relative",
    width: ART_WIDTH,
    height: ART_HEIGHT,
  },
  hair: {
    position: "absolute",
    top: 25,
    left: 75,
    width: 150,
    height: 50,
    backgroundColor: "#111",
    borderRadius: "40px 40px 0 0",
    zIndex: 2,
  },
  body: {
    position: "absolute",
    bottom: 40,
    left: 25,
    width: 250,
    height: 250,
    backgroundColor: "#1e3c72",
    borderRadius: "50%",
    zIndex: 1,
  },
  armyJacket: {
    position: "absolute",
    bottom: 0,
    left: 25,
    width: 200,
    height: 100,
    backgroundColor: "#3b5334",
    borderRadius: "0 0 100px 100px",
    clipPath: "polygon(0% 100%, 100% 100%, 80% 0%, 20% 0%)",
  },
  eye: {
    position: "absolute",
    top: 90,
    width: 45,
    height: 45,
    backgroundColor: "#fff",
    borderRadius: "50%",
    zIndex: 3,
  },
  pupil: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 20,
    height: 20,
    backgroundColor: "#000",
    borderRadius: "50%",
  },
  shimmer: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 6,
    height: 6,
    backgroundColor: "#fff",
    borderRadius: "50%",
  },
  beak: {
    position: "absolute",
    top: 130,
    left: 137,
    width: 26,
    height: 20,
    backgroundColor: "#f39c12",
    clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)",
    zIndex: 4,
  },
  mustache: {
    position: "absolute",
    top: 152,
    left: 132,
    width: 36,
    height: 16,
    backgroundColor: "#111",
    borderRadius: 2,
    zIndex: 4,
  },
  foot: {
    position: "absolute",
    bottom: 15,
    width: 35,
    height: 30,
    backgroundColor: "#1e3c72",
    borderRadius: 5,
    zIndex: 0,
  },
};

export function OpenClawLogo({ size = 40, className }: OpenClawLogoProps) {
  const scale = size / ART_HEIGHT;
  const scaledWidth = ART_WIDTH * scale;
  const offsetLeft = (size - scaledWidth) / 2;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: offsetLeft,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div style={styles.container}>
          <div style={styles.hair} />
          <div style={styles.body}>
            <div style={{ ...styles.eye, left: 75 }}>
              <div style={styles.pupil}>
                <div style={styles.shimmer} />
              </div>
            </div>
            <div style={{ ...styles.eye, right: 75 }}>
              <div style={styles.pupil}>
                <div style={styles.shimmer} />
              </div>
            </div>
            <div style={styles.beak} />
            <div style={styles.mustache} />
            <div style={styles.armyJacket} />
          </div>
          <div style={{ ...styles.foot, left: 95 }} />
          <div style={{ ...styles.foot, right: 95 }} />
        </div>
      </div>
    </div>
  );
}
