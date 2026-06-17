import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { fetchMapPins, fetchMapStats, fetchSchema, publishStudy, fetchStudyBundle } from "../api";
import type { FormSchema, MapPin, MapStatPin } from "../types";
import { activeFilters, deriveStatFields, describeFilters, matchesAll, type StatFilter } from "../mapStats";
import { cohortToCSV, downloadCSV, buildProofHeader, stampCSV, downloadJSON } from "../csv";
import { sha256Hex } from "../hash";
import { MapFilters } from "./MapFilters";
import { PinVerify } from "./PinVerify";
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
  radiusKm: number;
}

function HeatLayer({ points, radiusKm }: HeatLayerProps) {
  const map = useMap();
  // Re-render the layer on zoom so the radius stays a fixed ground distance.
  const [zoom, setZoom] = useState(() => map.getZoom());
  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);

  useEffect(() => {
    if (points.length === 0) return;
    // Convert the real-world radius (km) to screen pixels at the current zoom
    // and latitude (Web-Mercator ground resolution), so the heatmap kernel
    // represents a constant distance on the ground rather than a fixed pixel size.
    const lat = map.getCenter().lat;
    const metersPerPixel =
      (40075016.686 * Math.abs(Math.cos((lat * Math.PI) / 180))) /
      Math.pow(2, zoom + 8);
    const radiusPx = Math.max(6, Math.min(140, (radiusKm * 1000) / metersPerPixel));
    const blur = Math.round(radiusPx * 0.65);
    const latlngs = points.map(
      (p): [number, number, number] => [p.latitude, p.longitude, 1]
    );
    const layer = L.heatLayer(latlngs, {
      radius: radiusPx,
      blur,
      maxZoom: 17,
      minOpacity: 0.35,
      gradient: {
        0.2: "#cfe8e6",
        0.4: "#6fbfb8",
        0.6: "#2a9d94",
        0.8: "#0e726e",
        1.0: "#0a5450",
      },
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, radiusKm, zoom]);

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
  const [radiusKm, setRadiusKm] = useState(2);
  const [showPins, setShowPins] = useState(true);

  // Population-study filters: the richer (signed) stats dataset + schema.
  const [statPins, setStatPins] = useState<MapStatPin[] | null>(null);
  const [statErr, setStatErr] = useState<string | null>(null);
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [filters, setFilters] = useState<StatFilter[]>([]);

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

  // Pull the richer (signed) stats dataset + schema so the filter panel can
  // offer whichever questions are marked filterable. The base heatmap keeps
  // working from map-pins meanwhile, and an error here never breaks the map.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMapStats(), fetchSchema()])
      .then(([sp, sc]) => {
        if (cancelled) return;
        setStatPins(sp);
        setSchema(sc);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatErr(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = pins == null && statPins == null && !error && !statErr;

  const fields = useMemo(
    () => (schema && statPins ? deriveStatFields(schema, statPins) : []),
    [schema, statPins],
  );
  const active = useMemo(() => activeFilters(filters), [filters]);
  // Once stats load they're the source of truth (they carry coords too);
  // map-pins is just the fast/fallback base layer before stats arrive.
  const source: MapPin[] = statPins ?? pins ?? [];
  const canFilter = statPins != null && fields.length > 0;
  // Heatmap + markers reflect the active filters; the fit-to-bounds uses the
  // full set so tweaking a filter never re-zooms the map.
  const visiblePins = useMemo<MapPin[]>(
    () => (canFilter ? statPins!.filter((p) => matchesAll(p, active)) : source),
    [canFilter, statPins, active, source],
  );
  const totalCount = source.length;
  const filtering = canFilter && active.length > 0;

  // The filtered cohort as full stat rows, for CSV export.
  const filteredStats = useMemo<MapStatPin[]>(
    () => (statPins ? (canFilter ? statPins.filter((p) => matchesAll(p, active)) : statPins) : []),
    [statPins, canFilter, active],
  );
  // Exporting a cohort also RECORDS it: the filtered set is anchored on Cardano
  // and the exported CSV is stamped with a Verification ID (+ a proof-bundle
  // JSON is downloaded). If the chain/backend is unavailable we still hand over
  // the data, clearly marked unverified.
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<{ ok: boolean; text: string } | null>(null);
  const exportCsv = useCallback(async () => {
    if (filteredStats.length === 0 || exporting) return;
    setExporting(true);
    setExportNote(null);
    const dataCsv = cohortToCSV(filteredStats, fields);
    try {
      const exportHash = sha256Hex(dataCsv);
      const description = describeFilters(active, fields);
      const result = await publishStudy({
        memberIds: filteredStats.map((p) => p.id),
        exportHash,
        title: description,
        filter: { description, json: active },
      });
      const header = buildProofHeader({
        verificationId: result.verificationId,
        recordsRoot: result.recordsRoot,
        exportHash,
        anchoredValue: result.anchoredValue,
        chainTxId: result.chainTxId,
        chain: result.chain,
        verifyUrl: `${window.location.origin}/verificar`,
      });
      downloadCSV(`ipp-cohorte-${result.verificationId}.csv`, stampCSV(header, dataCsv));
      // Hash-only proof bundle to attach to a paper / verify independently.
      try {
        downloadJSON(`ipp-prueba-${result.verificationId}.json`, await fetchStudyBundle(result.verificationId));
      } catch {
        /* bundle is optional; the CSV already carries the Verification ID */
      }
      setExportNote({ ok: true, text: `Dataset anclado · ID de verificación ${result.verificationId}` });
    } catch (err) {
      downloadCSV(`ipp-cohorte-${filteredStats.length}-SIN-VERIFICAR.csv`, dataCsv);
      setExportNote({
        ok: false,
        text: `Exportado sin verificación (cadena no disponible): ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setExporting(false);
    }
  }, [filteredStats, fields, active, exporting]);

  return (
    <section className="card">
      <h2>Mapa de pacientes</h2>
      <p className="hint">
        Densidad anonimizada y planificación geográfica. Agrega notas y áreas
        para tu uso (se guardan sólo en este navegador).
      </p>

      <MapFilters
        fields={fields}
        filters={filters}
        onChange={setFilters}
        shown={visiblePins.length}
        total={totalCount}
        loading={statPins == null && statErr == null}
        error={statErr}
        onExport={exportCsv}
        exporting={exporting}
      />
      {exportNote && (
        <p className={exportNote.ok ? "hint export-ok" : "hint export-err"} style={{ margin: "6px 0 0" }}>
          {exportNote.text}
        </p>
      )}

      <div className="map-controls">
        <label className="slider">
          <span>Radio de afectación</span>
          <input
            type="range"
            min={0.5}
            max={15}
            step={0.5}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
          />
          <span className="slider-value">
            {radiusKm.toLocaleString("es", { minimumFractionDigits: 1 })} km
          </span>
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
          {source.length > 0 && <FitToPins points={source} />}
          {visiblePins.length > 0 && (
            <HeatLayer points={visiblePins} radiusKm={radiusKm} />
          )}
          {showPins &&
            visiblePins.map((pin) => {
              const wallet = walletForPatient(pin.id);
              return (
                <CircleMarker
                  key={pin.id}
                  center={[pin.latitude, pin.longitude]}
                  radius={5}
                  pathOptions={{
                    color: "#0a5450",
                    weight: 1,
                    fillColor: "#0e726e",
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
                      <PinVerify anchorKey={pin.anchorKey} />
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
        {(pins || statPins) && (
          <span className="hint">
            {filtering
              ? `${visiblePins.length.toLocaleString("es")} de ${totalCount.toLocaleString("es")} pacientes`
              : `${totalCount.toLocaleString("es")} pacientes registrados`}
          </span>
        )}
        <span className="legend">
          <span className="legend-swatch" style={{ background: "#cfe8e6" }} />
          <span className="legend-swatch" style={{ background: "#6fbfb8" }} />
          <span className="legend-swatch" style={{ background: "#2a9d94" }} />
          <span className="legend-swatch" style={{ background: "#0e726e" }} />
          <span className="legend-swatch" style={{ background: "#0a5450" }} />
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
      {filtering && visiblePins.length === 0 && (
        <p className="hint" style={{ marginTop: 10 }}>
          Ningún paciente coincide con los filtros seleccionados.
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
