// PUBLIC, no-login page: verify a dataset's proof bundle against Cardano.
// A reviewer can drop the bundle JSON (and optionally the exported CSV), and
// either (a) read the anchor from a public Cardano explorer for an independent
// check, or (b) use IPP's chain index for convenience. The math runs in the
// browser (checkBundle) - the page never trusts IPP for the cryptographic part.
import { useEffect, useState } from "react";
import type { ProofBundle } from "../types";
import { checkBundle, readAnchorFromChain, type BundleCheck } from "../proofBundle";
import { fetchOnChain, fetchStudyBundle } from "../api";

export function VerifyStudy() {
  const [bundle, setBundle] = useState<ProofBundle | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvName, setCsvName] = useState<string | null>(null);
  const [blockfrostUrl, setBlockfrostUrl] = useState("");
  const [idInput, setIdInput] = useState("");
  const [result, setResult] = useState<BundleCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from /verificar?id=<verificationId>.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      setIdInput(id);
      fetchStudyBundle(id).then(setBundle).catch((e) => setError(String(e)));
    }
  }, []);

  async function loadBundleFile(file: File) {
    setError(null);
    setResult(null);
    try {
      setBundle(JSON.parse(await file.text()) as ProofBundle);
    } catch (e) {
      setError(`Bundle inválido: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function loadById() {
    if (!idInput.trim()) return;
    setError(null);
    setResult(null);
    try {
      setBundle(await fetchStudyBundle(idInput.trim()));
    } catch (e) {
      setError(`No se pudo cargar el ID: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function run() {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let onChain: string | null;
      if (blockfrostUrl.trim() && bundle.chain.txId) {
        onChain = await readAnchorFromChain(blockfrostUrl.trim(), bundle.chain.txId);
      } else {
        const r = await fetchOnChain(bundle.chain.key);
        onChain = r.found ? r.valueHex : null;
      }
      setResult(checkBundle(bundle, { csvText: csvText ?? undefined, onChainValue: onChain }));
    } catch (e) {
      setError(`Error al verificar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand">
          <div>
            <h1>Verificar dataset <span className="brand-sub">IPP</span></h1>
            <p className="subtitle">
              Comprueba que un dataset publicado coincide con su ancla en Cardano.
            </p>
          </div>
        </div>
      </header>

      <section className="card">
        <h2>1 · Prueba (bundle)</h2>
        <p className="hint">Arrastra el archivo <code>ipp-prueba-….json</code>, o carga por ID de verificación.</p>
        <div className="verify-inputs">
          <label className="mf-action">
            Elegir bundle…
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && loadBundleFile(e.target.files[0])}
            />
          </label>
          <span className="verify-or">o</span>
          <input
            type="text"
            placeholder="ID de verificación"
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
          />
          <button type="button" className="mf-action" onClick={loadById}>Cargar</button>
        </div>
        {bundle && (
          <p className="hint" style={{ marginTop: 8 }}>
            Cargado: <strong>{bundle.verificationId}</strong> · {bundle.memberCount} registros ·{" "}
            {bundle.filterDescription ?? "—"} · tx {bundle.chain.txId ?? "(pendiente)"}
          </p>
        )}

        <h2 style={{ marginTop: 16 }}>2 · Archivo exportado (opcional)</h2>
        <p className="hint">Para comprobar que el CSV en tu poder es el certificado.</p>
        <label className="mf-action">
          Elegir CSV…
          <input
            type="file"
            accept="text/csv,.csv"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) { setCsvText(await f.text()); setCsvName(f.name); }
            }}
          />
        </label>
        {csvName && <span className="hint" style={{ marginLeft: 8 }}>{csvName}</span>}

        <h2 style={{ marginTop: 16 }}>3 · Fuente en cadena</h2>
        <p className="hint">
          Vacío = usar el índice de IPP (cómodo). Para una prueba independiente, pega la URL de un
          explorador compatible con Blockfrost (Dolos del devnet o Blockfrost preprod/mainnet) y se
          leerá el anclaje directamente de la cadena.
        </p>
        <input
          type="text"
          placeholder="https://cardano-preprod.blockfrost.io/api/v0 (opcional)"
          value={blockfrostUrl}
          onChange={(e) => setBlockfrostUrl(e.target.value)}
          style={{ width: "100%" }}
        />

        <div style={{ marginTop: 14 }}>
          <button type="button" className="mf-action primary" disabled={!bundle || busy} onClick={run}>
            {busy ? "Verificando…" : "Verificar"}
          </button>
        </div>
        {error && <p className="hint export-err" style={{ marginTop: 10 }}>{error}</p>}
      </section>

      {result && (
        <section className="card">
          <h2 className={result.pass ? "verify-pass" : "verify-fail"}>
            {result.pass ? "✓ Verificado" : "✗ No verificado"}
          </h2>
          <ul className="verify-checks">
            <Check ok={result.rootOk} label="La raíz de Merkle coincide con las hojas del bundle" />
            <Check ok={result.proofsOk} label="Cada prueba de inclusión es válida" />
            <Check ok={result.anchoredOk} label="El valor anclado deriva de la raíz (+ hash del export)" />
            <Check ok={result.chainOk} label="El valor en la cadena coincide con el valor anclado" />
            {result.exportChecked && (
              <Check ok={result.exportOk} label="El CSV provisto coincide con el hash certificado" />
            )}
          </ul>
          <p className="hint" style={{ marginTop: 8 }}>
            En cadena: <code>{result.onChainValue ?? "(no encontrado)"}</code><br />
            Esperado: <code>{result.anchoredValue}</code>
          </p>
        </section>
      )}
    </main>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={ok ? "verify-ok" : "verify-no"}>
      {ok ? "✓" : "✗"} {label}
    </li>
  );
}
