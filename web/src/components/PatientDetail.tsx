import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { fetchSchema } from "../api";
import type {
  AddressValue,
  FormSchema,
  PatientEnvelope,
  Question,
  ResponseValue,
} from "../types";

// Vite resolves marker images at build time, but Leaflet's prototype still
// holds a `_getIconUrl` that prepends its own image path — deleting it first
// makes mergeOptions actually win.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl,
  shadowUrl,
});

interface Props {
  patient: PatientEnvelope;
}

export function PatientDetail({ patient }: Props) {
  const [schema, setSchema] = useState<FormSchema | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSchema()
      .then((s) => { if (!cancelled) setSchema(s); })
      .catch(() => { /* fall through — fields just won't render */ });
    return () => { cancelled = true; };
  }, []);

  const responses = patient.data.responses ?? {};
  const sortedTabs = schema ? [...schema.tabs].sort((a, b) => a.order - b.order) : [];

  return (
    <section className="card detail">
      <h2>Ficha de {valueAsString(responses.nombre) || "paciente"}</h2>
      <p className="hint">Actualizada: {new Date(patient.updatedAt).toLocaleString("es-CL")}</p>

      {!schema && <p className="hint">Cargando formulario…</p>}

      {schema && sortedTabs.map((tab) => {
        const questions = schema.questions
          .filter((q) => q.tab === tab.id && q.hidden !== true)
          .sort((a, b) => a.order - b.order)
          .filter((q) => isVisible(q, responses));
        const rendered = questions
          .map((q) => renderQuestion(q, responses[q.id]))
          .filter((node) => node != null);
        if (rendered.length === 0) return null;
        return (
          <div key={tab.id}>
            <h3>{tab.label}</h3>
            {rendered}
            {tab.id === "datos" && patient.latitude != null && patient.longitude != null && (
              <div className="map-wrap" style={{ height: 220, marginTop: 10 }}>
                <MapContainer
                  center={[patient.latitude, patient.longitude]}
                  zoom={14}
                  scrollWheelZoom={false}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[patient.latitude, patient.longitude]}>
                    <Popup>{valueAsString(asAddress(responses.direccion)?.text) ?? "Ubicación"}</Popup>
                  </Marker>
                </MapContainer>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function isVisible(q: Question, responses: Record<string, ResponseValue>): boolean {
  if (!q.dependsOn) return true;
  const actual = responses[q.dependsOn];
  return JSON.stringify(actual) === JSON.stringify(q.dependsOnValue);
}

function renderQuestion(q: Question, value: ResponseValue): JSX.Element | null {
  if (value === undefined || value === null) return null;
  switch (q.type) {
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : null;
      if (!arr || arr.length === 0) return null;
      return (
        <div key={q.id} style={{ padding: "6px 0", borderBottom: "1px dashed var(--border)" }}>
          <div style={{ fontSize: 15 }}>{q.label}</div>
          <div className="chips">
            {arr.map((it) => (<span className="chip" key={it}>{it}</span>))}
          </div>
        </div>
      );
    }
    case "address": {
      const addr = asAddress(value);
      if (!addr || !addr.text) return null;
      return <Pair key={q.id} label={q.label} value={addr.text} />;
    }
    case "boolean": {
      if (typeof value !== "boolean") return null;
      return <Pair key={q.id} label={q.label} value={value ? "Sí" : "No"} />;
    }
    case "number": {
      if (typeof value !== "number") return null;
      return <Pair key={q.id} label={q.label} value={String(value)} />;
    }
    case "text":
    case "picker":
    case "date":
    default:
      return <Pair key={q.id} label={q.label} value={valueAsString(value)} />;
  }
}

function Pair({ label, value }: { label: string; value: string | undefined | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="pair">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function valueAsString(v: ResponseValue | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return "";
}

function asAddress(v: ResponseValue | undefined): AddressValue | null {
  if (v && typeof v === "object" && !Array.isArray(v) && "text" in (v as object)) {
    return v as AddressValue;
  }
  return null;
}
