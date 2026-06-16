import { useState } from "react";
import { fetchOnChain } from "../api";
import type { OnChainAnchor } from "../types";

// "Verificar en cadena" control inside a map pin's popup: looks up the patient's
// on-chain anchor (by the non-identifying anchorKey) and shows the result.
export function PinVerify({ anchorKey }: { anchorKey: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<OnChainAnchor | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function verify() {
    setState("loading");
    setErr(null);
    try {
      setResult(await fetchOnChain(anchorKey));
      setState("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  return (
    <div className="pin-verify">
      {state === "idle" && (
        <button type="button" className="pin-verify-btn" onClick={verify}>
          Verificar en cadena
        </button>
      )}
      {state === "loading" && <span className="pin-verify-muted">Consultando la cadena…</span>}
      {state === "error" && <span className="pin-verify-err">{err}</span>}
      {state === "done" && result && (
        result.found ? (
          <div className="pin-verify-result ok">
            <div className="pin-verify-head">✓ Anclado en {result.chain}</div>
            <div className="pin-verify-row">
              <span>hash</span>
              <code title={result.valueHex ?? ""}>{result.valueHex?.slice(0, 20)}…</code>
            </div>
          </div>
        ) : (
          <div className="pin-verify-result none">
            Sin anclaje en {result.chain}
          </div>
        )
      )}
    </div>
  );
}
