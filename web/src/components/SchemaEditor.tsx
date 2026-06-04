import { useEffect, useMemo, useState } from "react";
import { fetchSchema, putSchema } from "../api";
import type { FormSchema, Question, QuestionType } from "../types";

const QUESTION_TYPES: QuestionType[] = [
  "text",
  "number",
  "boolean",
  "multiselect",
  "picker",
  "date",
  "address",
];

export function SchemaEditor() {
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSchema()
      .then((s) => {
        if (cancelled) return;
        setSchema(s);
        setActiveTabId(s.tabs[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <section className="card"><p>Cargando…</p></section>;
  if (error || !schema) {
    return <section className="card"><p className="error">{error ?? "No se pudo cargar."}</p></section>;
  }

  const tabs = [...schema.tabs].sort((a, b) => a.order - b.order);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  function updateQuestion(qid: string, patch: Partial<Question>) {
    setSchema((s) => {
      if (!s) return s;
      return {
        ...s,
        questions: s.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)),
      };
    });
  }

  function removeQuestion(qid: string) {
    if (!window.confirm("¿Eliminar esta pregunta? Las respuestas guardadas no se borran.")) return;
    setSchema((s) => (s ? { ...s, questions: s.questions.filter((q) => q.id !== qid) } : s));
  }

  function moveQuestion(qid: string, delta: -1 | 1) {
    setSchema((s) => {
      if (!s) return s;
      const inTab = s.questions
        .filter((q) => q.tab === s.questions.find((x) => x.id === qid)?.tab)
        .sort((a, b) => a.order - b.order);
      const idx = inTab.findIndex((q) => q.id === qid);
      const swap = inTab[idx + delta];
      if (!swap) return s;
      const aOrder = inTab[idx]!.order;
      const bOrder = swap.order;
      return {
        ...s,
        questions: s.questions.map((q) => {
          if (q.id === qid) return { ...q, order: bOrder };
          if (q.id === swap.id) return { ...q, order: aOrder };
          return q;
        }),
      };
    });
  }

  function addQuestion() {
    if (!activeTab) return;
    const maxOrder = Math.max(
      0,
      ...schema!.questions.filter((q) => q.tab === activeTab.id).map((q) => q.order),
    );
    const newQ: Question = {
      id: `q_${Math.random().toString(36).slice(2, 9)}`,
      label: "Nueva pregunta",
      type: "text",
      tab: activeTab.id,
      order: maxOrder + 1,
    };
    setSchema((s) => (s ? { ...s, questions: [...s.questions, newQ] } : s));
  }

  function updateTab(tabId: string, patch: Partial<FormSchema["tabs"][number]>) {
    setSchema((s) => {
      if (!s) return s;
      return { ...s, tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)) };
    });
  }

  async function save() {
    if (!schema) return;
    setSaving(true);
    setError(null);
    try {
      const next = await putSchema(schema);
      setSchema(next);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card schema-editor">
      <div className="schema-header">
        <div>
          <h2>Configurar formulario <span className="muted">v{schema.version}</span></h2>
          <p className="hint">
            Edita las preguntas, sus tipos y visibilidad. La app de iOS
            cargará la nueva versión en su próximo inicio.
          </p>
        </div>
        <div className="schema-save">
          {savedAt && !saving && (
            <span className="saved-hint">Guardado · v{schema.version}</span>
          )}
          <button type="button" className="primary" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <nav className="schema-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`schema-tab ${activeTab?.id === t.id ? "active" : ""}`}
            onClick={() => setActiveTabId(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab && (
        <div className="schema-tab-body">
          <div className="schema-tab-meta">
            <label className="field">
              <span>Nombre de la pestaña</span>
              <input
                type="text"
                value={activeTab.label}
                onChange={(e) => updateTab(activeTab.id, { label: e.target.value })}
              />
            </label>
          </div>

          <ol className="question-list">
            {schema.questions
              .filter((q) => q.tab === activeTab.id)
              .sort((a, b) => a.order - b.order)
              .map((q, idx, arr) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  isFirst={idx === 0}
                  isLast={idx === arr.length - 1}
                  onChange={(patch) => updateQuestion(q.id, patch)}
                  onDelete={() => removeQuestion(q.id)}
                  onMoveUp={() => moveQuestion(q.id, -1)}
                  onMoveDown={() => moveQuestion(q.id, 1)}
                  allQuestions={schema.questions}
                />
              ))}
          </ol>

          <button type="button" className="tool" onClick={addQuestion}>
            + Agregar pregunta
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  );
}

interface RowProps {
  question: Question;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Question>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  allQuestions: Question[];
}

function QuestionRow({
  question,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  allQuestions,
}: RowProps) {
  const optionsText = useMemo(
    () => (question.options ?? []).join("\n"),
    [question.options],
  );

  function setOptionsFromText(text: string) {
    const opts = text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({ options: opts.length ? opts : undefined });
  }

  const hasOptions =
    question.type === "multiselect" || question.type === "picker";

  return (
    <li className={`question-card ${question.hidden ? "hidden" : ""}`}>
      <div className="question-card-header">
        <div className="reorder">
          <button type="button" onClick={onMoveUp} disabled={isFirst} title="Subir">↑</button>
          <button type="button" onClick={onMoveDown} disabled={isLast} title="Bajar">↓</button>
        </div>
        <input
          className="question-label"
          type="text"
          value={question.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Texto que verá el doctor"
        />
        <select
          className="question-type"
          value={question.type}
          onChange={(e) => onChange({ type: e.target.value as QuestionType })}
        >
          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!question.hidden}
            onChange={(e) => onChange({ hidden: e.target.checked || undefined })}
          />
          <span>Oculta</span>
        </label>
        <button type="button" className="tool danger" onClick={onDelete} title="Eliminar">×</button>
      </div>

      <div className="question-card-meta">
        <span className="muted">id: <code>{question.id}</code></span>
      </div>

      {hasOptions && (
        <div className="question-card-options">
          <label className="field">
            <span>Opciones (una por línea)</span>
            <textarea
              rows={3}
              value={optionsText}
              onChange={(e) => setOptionsFromText(e.target.value)}
              placeholder="Opción A\nOpción B"
            />
          </label>
          {question.type === "multiselect" && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!question.allowCustom}
                onChange={(e) => onChange({ allowCustom: e.target.checked || undefined })}
              />
              <span>Permitir entradas personalizadas</span>
            </label>
          )}
        </div>
      )}

      <details className="question-advanced">
        <summary>Avanzado · mostrar sólo si…</summary>
        <div className="question-deps">
          <label className="field">
            <span>Depende de la pregunta</span>
            <select
              value={question.dependsOn ?? ""}
              onChange={(e) => onChange({ dependsOn: e.target.value || undefined })}
            >
              <option value="">— ninguna —</option>
              {allQuestions
                .filter((q) => q.id !== question.id && q.tab === question.tab)
                .map((q) => (
                  <option key={q.id} value={q.id}>{q.label}</option>
                ))}
            </select>
          </label>
          {question.dependsOn && (
            <label className="field">
              <span>Igual a (valor JSON)</span>
              <input
                type="text"
                value={JSON.stringify(question.dependsOnValue ?? null)}
                onChange={(e) => {
                  try {
                    onChange({ dependsOnValue: JSON.parse(e.target.value) });
                  } catch {
                    /* ignore until valid */
                  }
                }}
                placeholder="true"
              />
            </label>
          )}
        </div>
      </details>
    </li>
  );
}
