import { useState, useEffect, useRef } from "react";
import type { Annotation } from "../annotations";

interface Props {
  annotations: Annotation[];
  highlightedId: string | null;
  onUpdate: (a: Annotation) => void;
  onDelete: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function AnnotationsList({ annotations, highlightedId, onUpdate, onDelete, onHover }: Props) {
  if (annotations.length === 0) {
    return (
      <section className="card annotations-list">
        <h2>Notas y áreas</h2>
        <p className="empty">
          Sin anotaciones todavía. Usa los botones <b>Nota</b> o <b>Área</b>
          arriba para agregar una.
        </p>
      </section>
    );
  }

  // Newest first so a freshly-added item is right at the top.
  const sorted = [...annotations].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <section className="card annotations-list">
      <h2>Notas y áreas <span className="count">({annotations.length})</span></h2>
      <p className="hint">Pasa el cursor sobre un elemento para resaltarlo en el mapa.</p>
      <ul>
        {sorted.map((a) => (
          <AnnotationRow
            key={a.id}
            annotation={a}
            highlighted={a.id === highlightedId}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onHover={onHover}
          />
        ))}
      </ul>
    </section>
  );
}

interface RowProps {
  annotation: Annotation;
  highlighted: boolean;
  onUpdate: (a: Annotation) => void;
  onDelete: (id: string) => void;
  onHover: (id: string | null) => void;
}

function AnnotationRow({ annotation, highlighted, onUpdate, onDelete, onHover }: RowProps) {
  const initialText = annotation.type === "note" ? annotation.text : annotation.name;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialText);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // When the underlying annotation text changes externally, sync the draft.
  useEffect(() => {
    if (!editing) setDraft(initialText);
  }, [initialText, editing]);

  function save() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(initialText);
      setEditing(false);
      return;
    }
    if (annotation.type === "note") {
      onUpdate({ ...annotation, text: trimmed });
    } else {
      onUpdate({ ...annotation, name: trimmed });
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(initialText);
    setEditing(false);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") save();
    else if (e.key === "Escape") cancel();
  }

  const time = new Date(annotation.createdAt).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <li
      className={`annotation-row type-${annotation.type} ${highlighted ? "highlighted" : ""}`}
      onMouseEnter={() => onHover(annotation.id)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="annotation-icon" aria-hidden>
        {annotation.type === "note" ? "📝" : "▱"}
      </span>
      <div className="annotation-body">
        {editing ? (
          <input
            ref={inputRef}
            className="annotation-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={save}
            placeholder={annotation.type === "note" ? "Texto de la nota" : "Nombre del área"}
          />
        ) : (
          <span className="annotation-title">{initialText}</span>
        )}
        <span className="annotation-meta">
          {annotation.type === "area" ? `${annotation.points.length} vértices · ` : ""}
          {time}
        </span>
      </div>
      <div className="annotation-actions">
        {editing ? (
          <>
            <button type="button" className="tool primary" onMouseDown={(e) => e.preventDefault()} onClick={save}>
              Guardar
            </button>
            <button type="button" className="tool subtle" onMouseDown={(e) => e.preventDefault()} onClick={cancel}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="tool"
              onClick={() => setEditing(true)}
              title="Editar"
            >
              Editar
            </button>
            <button
              type="button"
              className="tool danger"
              onClick={() => onDelete(annotation.id)}
              title="Eliminar"
            >
              Eliminar
            </button>
          </>
        )}
      </div>
    </li>
  );
}
