import { useState } from "react";
import { lookupPatient } from "../api";
import type { PatientEnvelope } from "../types";

interface Props {
  onResult: (patient: PatientEnvelope | null) => void;
}

export function LookupForm({ onResult }: Props) {
  const [rut, setRut] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await lookupPatient(rut.trim(), passcode.trim());
      onResult(result);
      if (!result) setError("No se encontró ningún paciente con ese RUT y código.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>Buscar mi ficha</h2>
      <p className="hint">
        Ingresa tu RUT y el código de 6 dígitos que te entregó tu profesional.
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="rut">RUT</label>
          <input
            id="rut"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            placeholder="12345678-9"
            autoComplete="off"
            autoCapitalize="characters"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="passcode">Código</label>
          <input
            id="passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </div>
        <button type="submit" className="primary" disabled={loading || !rut || passcode.length !== 6}>
          {loading ? "Buscando…" : "Buscar"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}
