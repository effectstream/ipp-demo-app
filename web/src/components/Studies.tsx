// Estudios: the record of every exported dataset. Each export (from the map's
// "Exportar CSV") lands here with its Verification ID + Cardano tx. A doctor can
// re-download the proof bundle, open the public verifier, or run a drift check
// (does the live data still match what was published?).
import { useCallback, useEffect, useState } from "react";
import type { StudySummary, StudyVerifyResult } from "../types";
import { fetchStudies, fetchStudyBundle, verifyStudy } from "../api";
import { downloadJSON } from "../csv";

export function Studies() {
  const [studies, setStudies] = useState<StudySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drift, setDrift] = useState<Record<string, StudyVerifyResult | "loading">>({});

  const load = useCallback(() => {
    setError(null);
    fetchStudies()
      .then(setStudies)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function downloadBundle(id: string) {
    try {
      downloadJSON(`ipp-prueba-${id}.json`, await fetchStudyBundle(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function checkDrift(id: string) {
    setDrift((d) => ({ ...d, [id]: "loading" }));
    try {
      const r = await verifyStudy(id);
      setDrift((d) => ({ ...d, [id]: r }));
    } catch {
      setDrift((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
    }
  }

  return (
    <section className="card">
      <div className="map-filters-head">
        <h2 style={{ margin: 0 }}>Estudios exportados</h2>
        <button type="button" className="mf-action" onClick={load}>Actualizar</button>
      </div>
      <p className="hint">
        Cada dataset exportado queda registrado aquí con un ID de verificación anclado en Cardano.
        Comparte el bundle (o el CSV sellado) junto a tu publicación; cualquiera puede comprobarlo en{" "}
        <a href="/verificar">Verificar dataset</a>.
      </p>

      {error && <p className="hint export-err">{error}</p>}
      {studies == null && !error && <p className="hint">Cargando…</p>}
      {studies && studies.length === 0 && (
        <p className="hint">Aún no hay exportaciones. Filtra un grupo en el mapa y usa “Exportar CSV”.</p>
      )}

      {studies && studies.length > 0 && (
        <table className="studies-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cohorte</th>
              <th>Fecha</th>
              <th>Registros</th>
              <th>Cadena</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {studies.map((s) => {
              const d = drift[s.id];
              return (
                <tr key={s.id}>
                  <td className="mono" title={s.id}>{s.id.slice(0, 8)}…</td>
                  <td>{s.title ?? s.filterDescription ?? "—"}</td>
                  <td>{new Date(s.createdAt).toLocaleString("es")}</td>
                  <td>{s.memberCount}</td>
                  <td className="mono" title={s.chainTxId ?? ""}>
                    {s.chainTxId ? `${s.chainTxId.slice(0, 10)}…` : "(local)"}
                  </td>
                  <td className="studies-actions">
                    <button type="button" className="mf-action" onClick={() => downloadBundle(s.id)}>
                      Descargar prueba
                    </button>
                    <a className="mf-action" href={`/verificar?id=${encodeURIComponent(s.id)}`}>
                      Verificar
                    </a>
                    <button type="button" className="mf-action" onClick={() => checkDrift(s.id)}>
                      {d === "loading" ? "…" : "Comprobar"}
                    </button>
                    {d && d !== "loading" && (
                      <span className={d.datasetIntact ? "verify-ok" : "verify-no"}>
                        {d.datasetIntact
                          ? "íntegro"
                          : `cambió (${d.changed.length}±, ${d.missing.length} falta)`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
