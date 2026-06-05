import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { fetchMapPins } from "../api";
import type { MapPin } from "../types";
import type { Annotation } from "../annotations";
import { loadAnnotations, saveAnnotations, newId } from "../annotations";
import { AnnotationsLayer } from "./AnnotationsLayer";
import { AnnotationsList } from "./AnnotationsList";
import { DrawingController, type DrawMode } from "./DrawingController";
import { CardanoLogo } from "./CardanoLogo";
import { walletForPatient, shortAddress } from "../wallet";

const DEFAULT_CENTER: [number, number] = [-33.45, -70.66];

interface HeatLayerProps {
  points: MapPin[];
  radius: number;
  blur: number;
}

function HeatLayer({ points, radius, blur }: HeatLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const latlngs = points.map(
      (p): [number, number, number] => [p.latitude, p.longitude, 1]
    );
    const layer = L.heatLayer(latlngs, {
      radius,
      blur,
      maxZoom: 17,
      minOpacity: 0.35,
      gradient: {
        0.2: "#2563eb",
        0.4: "#22d3ee",
        0.6: "#fde047",
        0.8: "#fb923c",
        1.0: "#dc2626",
      },
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, radius, blur]);

  return null;
}

function FitToPins({ points }: { points: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  }, [map, points]);
  return null;
}

export function MapView() {
  const [pins, setPins] = useState<MapPin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radius, setRadius] = useState(28);
  const [showPins, setShowPins] = useState(true);

  // Annotations: hydrate from localStorage once, then persist on every change.
  const [annotations, setAnnotations] = useState<Annotation[]>(() => loadAnnotations());
  useEffect(() => {
    saveAnnotations(annotations);
  }, [annotations]);

  const [mode, setMode] = useState<DrawMode>("idle");
  const [areaPoints, setAreaPoints] = useState<Array<[number, number]>>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Reset working polygon whenever we leave area mode.
  useEffect(() => {
    if (mode !== "area") setAreaPoints([]);
  }, [mode]);

  const commitAnnotation = useCallback((a: Annotation) => {
    setAnnotations((prev) => [...prev, a]);
  }, []);

  const updateAnnotation = useCallback((a: Annotation) => {
    setAnnotations((prev) => prev.map((x) => (x.id === a.id ? a : x)));
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const finishArea = useCallback(() => {
    if (areaPoints.length < 3) {
      window.alert("Un área necesita al menos 3 vértices.");
      return;
    }
    const name = window.prompt("Nombre del área:");
    if (!name?.trim()) {
      setMode("idle");
      return;
    }
    commitAnnotation({
      id: newId(),
      type: "area",
      name: name.trim(),
      points: areaPoints,
      createdAt: new Date().toISOString(),
    });
    setMode("idle");
  }, [areaPoints, commitAnnotation]);

  const cancelDraw = useCallback(() => setMode("idle"), []);

  const clearAll = useCallback(() => {
    if (annotations.length === 0) return;
    if (window.confirm(`¿Borrar ${annotations.length} anotación(es)?`)) {
      setAnnotations([]);
    }
  }, [annotations.length]);

  useEffect(() => {
    let cancelled = false;
    fetchMapPins()
      .then((result) => {
        if (!cancelled) setPins(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = pins == null && !error;
  const blur = useMemo(() => Math.round(radius * 0.65), [radius]);

  return (
    <section className="card">
      <h2>Mapa de pacientes</h2>
      <p className="hint">
        Densidad anonimizada y planificación geográfica. Agrega notas y áreas
        para tu uso (se guardan sólo en este navegador).
      </p>

      <div className="map-controls">
        <label className="slider">
          <span>Radio de afectación</span>
          <input
            type="range"
            min={10}
            max={70}
            step={1}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
          <span className="slider-value">{radius}px</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showPins}
            onChange={(e) => setShowPins(e.target.checked)}
          />
          <span>Mostrar puntos</span>
        </label>
      </div>

      <div className="map-toolbar">
        <button
          type="button"
          className={`tool ${mode === "note" ? "active" : ""}`}
          onClick={() => setMode(mode === "note" ? "idle" : "note")}
        >
          📝 Nota
        </button>
        <button
          type="button"
          className={`tool ${mode === "area" ? "active" : ""}`}
          onClick={() => setMode(mode === "area" ? "idle" : "area")}
        >
          ▱ Área
        </button>
        {mode === "area" && (
          <>
            <button type="button" className="tool primary" onClick={finishArea}>
              Terminar área ({areaPoints.length} pts)
            </button>
            <button type="button" className="tool subtle" onClick={cancelDraw}>
              Cancelar
            </button>
          </>
        )}
        {mode === "note" && (
          <span className="hint inline">Toca el mapa donde quieras la nota…</span>
        )}
        <span className="spacer" />
        <span className="annotation-count">{annotations.length} anotaciones</span>
        <button
          type="button"
          className="tool subtle"
          onClick={clearAll}
          disabled={annotations.length === 0}
        >
          Limpiar
        </button>
      </div>

      <div className="map-wrap">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={6}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pins && pins.length > 0 && (
            <>
              <FitToPins points={pins} />
              <HeatLayer points={pins} radius={radius} blur={blur} />
            </>
          )}
          {showPins &&
            pins?.map((pin) => {
              const wallet = walletForPatient(pin.id);
              return (
                <CircleMarker
                  key={pin.id}
                  center={[pin.latitude, pin.longitude]}
                  radius={5}
                  pathOptions={{
                    color: "#1e3a8a",
                    weight: 1,
                    fillColor: "#1d4ed8",
                    fillOpacity: 0.85,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -4]}>
                    Paciente anónimo
                  </Tooltip>
                  <Popup>
                    <div className="wallet-popup">
                      <div className="wallet-popup-title">Registrado por</div>
                      <div className="wallet-popup-chip">
                        <CardanoLogo size={14} />
                        <code title={wallet}>{shortAddress(wallet)}</code>
                      </div>
                      <div className="wallet-popup-meta">
                        Billetera Cardano (simulada)
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          <AnnotationsLayer
            annotations={annotations}
            highlightedId={highlightedId}
            onDelete={deleteAnnotation}
          />
          <DrawingController
            mode={mode}
            areaPoints={areaPoints}
            setAreaPoints={setAreaPoints}
            onCommit={commitAnnotation}
            onModeChange={setMode}
          />
        </MapContainer>
      </div>

      <div className="map-footer">
        {pins && <span className="hint">{pins.length} pacientes registrados</span>}
        <span className="legend">
          <span className="legend-swatch" style={{ background: "#2563eb" }} />
          <span className="legend-swatch" style={{ background: "#22d3ee" }} />
          <span className="legend-swatch" style={{ background: "#fde047" }} />
          <span className="legend-swatch" style={{ background: "#fb923c" }} />
          <span className="legend-swatch" style={{ background: "#dc2626" }} />
          <span className="legend-label">menos · más</span>
        </span>
      </div>

      {isLoading && <p className="hint" style={{ marginTop: 10 }}>Cargando…</p>}
      {error && <p className="error">No se pudo cargar el mapa: {error}</p>}
      {pins && pins.length === 0 && !error && (
        <p className="hint" style={{ marginTop: 10 }}>
          Sin pacientes con ubicación registrada.
        </p>
      )}

      <AnnotationsList
        annotations={annotations}
        highlightedId={highlightedId}
        onUpdate={updateAnnotation}
        onDelete={deleteAnnotation}
        onHover={setHighlightedId}
      />
    </section>
  );
}
