import { useEffect, useState } from "react";
import { fetchFeedback, submitFeedback } from "../api";
import type { FeedbackEntry } from "../types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CL", { year: "numeric", month: "short", day: "numeric" });
}

export function Feedback() {
  const [entries, setEntries] = useState<FeedbackEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFeedback()
      .then((list) => { if (!cancelled) setEntries(list); })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await submitFeedback(text, anonymous);
      setEntries((prev) => [created, ...(prev ?? [])]);
      setMessage("");
      setAnonymous(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card feedback">
      <h2>Feedback</h2>
      <p className="hint">
        Comparte ideas, necesidades o problemas con la plataforma. Tu comentario
        queda guardado y visible para el equipo y el resto de profesionales.
      </p>

      <form className="feedback-form" onSubmit={send}>
        <textarea
          className="feedback-input"
          rows={3}
          value={message}
          maxLength={4000}
          placeholder="Escribe tu feedback…"
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="feedback-actions">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            <span>Enviar de forma anónima</span>
          </label>
          <button type="submit" className="primary" disabled={sending || !message.trim()}>
            {sending ? "Enviando…" : "Enviar feedback"}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="feedback-list">
        <h3>Todos los comentarios{entries ? ` (${entries.length})` : ""}</h3>
        {entries == null && !error && <p className="hint">Cargando…</p>}
        {entries && entries.length === 0 && (
          <p className="empty">Aún no hay feedback. Sé el primero en comentar.</p>
        )}
        {entries && entries.length > 0 && (
          <ul>
            {entries.map((f) => (
              <li key={f.id} className={`feedback-row ${f.anonymous ? "anon" : ""}`}>
                <div className="feedback-row-head">
                  <span className="feedback-sender">
                    {f.anonymous || !f.sender ? "Anónimo" : f.sender}
                  </span>
                  <span className="feedback-date">{formatDate(f.createdAt)}</span>
                </div>
                <p className="feedback-message">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
