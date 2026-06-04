import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { Annotation } from "../annotations";
import { newId } from "../annotations";

export type DrawMode = "idle" | "note" | "area";

interface Props {
  mode: DrawMode;
  areaPoints: Array<[number, number]>;
  setAreaPoints: (pts: Array<[number, number]>) => void;
  onCommit: (a: Annotation) => void;
  onModeChange: (m: DrawMode) => void;
}

// Captures map clicks based on the current draw mode:
//   note  – single click → prompt for text → commit + reset to idle
//   area  – each click appends a vertex; parent's "Terminar" button finalizes
//   idle  – click events pass through to the normal popup/marker behavior
export function DrawingController({
  mode,
  areaPoints,
  setAreaPoints,
  onCommit,
  onModeChange,
}: Props) {
  const map = useMap();
  const provisionalRef = useRef<L.Layer | null>(null);
  // Refs to avoid re-binding map.on('click') every render.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const areaPointsRef = useRef(areaPoints);
  areaPointsRef.current = areaPoints;

  // Single click handler routed by current mode.
  useEffect(() => {
    function onClick(e: L.LeafletMouseEvent) {
      const m = modeRef.current;
      if (m === "note") {
        const text = window.prompt("Texto de la nota:");
        if (text && text.trim()) {
          onCommit({
            id: newId(),
            type: "note",
            text: text.trim(),
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            createdAt: new Date().toISOString(),
          });
        }
        onModeChange("idle");
      } else if (m === "area") {
        setAreaPoints([...areaPointsRef.current, [e.latlng.lat, e.latlng.lng]]);
      }
    }
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, onCommit, onModeChange, setAreaPoints]);

  // Render the in-progress polyline / dots so the user sees what they're drawing.
  useEffect(() => {
    if (provisionalRef.current) {
      map.removeLayer(provisionalRef.current);
      provisionalRef.current = null;
    }
    if (mode !== "area" || areaPoints.length === 0) return;

    const group = L.layerGroup();
    if (areaPoints.length === 1) {
      L.circleMarker(areaPoints[0]!, {
        radius: 4,
        color: "#7c3aed",
        fillColor: "#7c3aed",
        fillOpacity: 1,
      }).addTo(group);
    } else {
      L.polyline(areaPoints, {
        color: "#7c3aed",
        weight: 2,
        dashArray: "4 4",
      }).addTo(group);
      // Show vertex dots so the user can see what they've placed.
      for (const p of areaPoints) {
        L.circleMarker(p, {
          radius: 3,
          color: "#7c3aed",
          fillColor: "#7c3aed",
          fillOpacity: 1,
        }).addTo(group);
      }
    }
    group.addTo(map);
    provisionalRef.current = group;
  }, [map, mode, areaPoints]);

  // Cursor / overlay class so the map looks like it's in draw mode.
  useEffect(() => {
    const el = map.getContainer();
    el.classList.toggle("map-drawing", mode !== "idle");
    return () => el.classList.remove("map-drawing");
  }, [map, mode]);

  return null;
}
