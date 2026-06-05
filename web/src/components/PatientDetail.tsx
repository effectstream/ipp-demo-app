import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { fetchSchema, verifyOnChain } from "../api";
import type {
  AddressValue,
  FormSchema,
  PatientEnvelope,
  Question,
  ResponseValue,
  VerifyResult,
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
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSchema()
      .then((s) => { if (!cancelled) setSchema(s); })
      .catch(() => { /* fall through — fields just won't render */ });
    return () => { cancelled = true; };
  }, []);

  // Reset verification state when switching to a different patient.
  useEffect(() => {
    setVerifyResult(null);
    setVerifyError(null);
  }, [patient.id]);

  async function handleVerify() {
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      setVerifyResult(await verifyOnChain(patient.rut));
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifying(false);
    }
  }

  const responses = patient.data.responses ?? {};
  const sortedTabs = schema ? [...schema.tabs].sort((a, b) => a.order - b.order) : [];

  return (
    <section className="card detail">
      <h2>Ficha de {valueAsString(responses.nombre) || "paciente"}</h2>
      <p className="hint">Actualizada: {new Date(patient.updatedAt).toLocaleString("es-CL")}</p>

      <VerifyPanel
        verifying={verifying}
        result={verifyResult}
        error={verifyError}
        onVerify={handleVerify}
      />

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

// -- On-chain verification panel -------------------------------------------

type VerifyTone = "ok" | "warn" | "bad" | "neutral";
const TONE_COLOR: Record<VerifyTone, string> = {
  ok: "#1a7f37",
  warn: "#9a6700",
  bad: "#cf222e",
  neutral: "#57606a",
};

function interpretVerify(r: VerifyResult): { tone: VerifyTone; title: string; detail: string } {
  if (r.readError) {
    return { tone: "neutral", title: "No se pudo leer la cadena", detail: r.readError };
  }
  if (r.chain === "local" && !r.found) {
    return {
      tone: "neutral",
      title: "Cadena local (desarrollo)",
      detail: "El backend no está conectado a Midnight, así que no hay anclaje real que verificar.",
    };
  }
  if (r.found && r.recordMatch) {
    return {
      tone: "ok",
      title: "✓ Verificado en Midnight",
      detail: "El hash del registro actual coincide con el valor anclado en la cadena.",
    };
  }
  if (r.found && r.chainMatch && !r.recordMatch) {
    return {
      tone: "warn",
      title: "⚠ El registro cambió desde el anclaje",
      detail: "La cadena conserva el hash original que se ancló, pero el registro actual difiere.",
    };
  }
  if (r.found && !r.recordMatch) {
    return {
      tone: "bad",
      title: "✗ No coincide con la cadena",
      detail: "El valor en la cadena no coincide con este registro.",
    };
  }
  if (!r.found && r.anchoredHash) {
    return {
      tone: "warn",
      title: "Anclado, pero no encontrado en la cadena",
      detail: "Se registró un anclaje pero la cadena no devuelve un valor (¿indexador sin sincronizar?).",
    };
  }
  return {
    tone: "neutral",
    title: "Sin anclaje en la cadena",
    detail: "Este registro aún no ha sido anclado en Midnight.",
  };
}

function VerifyPanel({
  verifying,
  result,
  error,
  onVerify,
}: {
  verifying: boolean;
  result: VerifyResult | null;
  error: string | null;
  onVerify: () => void;
}) {
  const info = result ? interpretVerify(result) : null;
  return (
    <div
      style={{
        margin: "10px 0 4px",
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--bg-subtle, #f6f8fa)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onVerify} disabled={verifying}>
          {verifying ? "Verificando…" : "Verificar en cadena"}
        </button>
        {info && (
          <strong style={{ color: TONE_COLOR[info.tone] }}>{info.title}</strong>
        )}
      </div>

      {error && <p className="hint" style={{ color: TONE_COLOR.bad }}>Error: {error}</p>}

      {info && result && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <p className="hint" style={{ margin: "2px 0 8px" }}>{info.detail}</p>
          <HashLine label="Clave (SHA-256 del RUT)" value={result.keyHex} />
          <HashLine label="En cadena" value={result.onChainHash} />
          <HashLine label="Registro actual" value={result.localHash} />
          {result.chainTxId && <HashLine label="Tx Midnight" value={result.chainTxId} />}
          {result.anchoredAt && (
            <div className="pair">
              <span>Anclado</span>
              <span>{new Date(result.anchoredAt).toLocaleString("es-CL")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HashLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="pair">
      <span>{label}</span>
      <span style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
        {value ? `${value.slice(0, 16)}…${value.slice(-8)}` : "—"}
      </span>
    </div>
  );
}
