import { useMemo } from "react";
import {
  emptyFilter,
  isActive,
  type StatField,
  type StatFilter,
} from "../mapStats";

interface Props {
  fields: StatField[];
  filters: StatFilter[];
  onChange: (filters: StatFilter[]) => void;
  shown: number;
  total: number;
  loading: boolean;
  error: string | null;
  onExport?: () => void;
  exporting?: boolean;
}

export function MapFilters({ fields, filters, onChange, shown, total, loading, error, onExport, exporting }: Props) {
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const usedIds = useMemo(() => new Set(filters.map((f) => f.id)), [filters]);

  // Fields not yet added, grouped by tab for the "add filter" picker.
  const groups = useMemo(() => {
    const byTab = new Map<string, { label: string; fields: StatField[] }>();
    for (const f of fields) {
      if (usedIds.has(f.id)) continue;
      const g = byTab.get(f.tab) ?? { label: f.tabLabel, fields: [] };
      g.fields.push(f);
      byTab.set(f.tab, g);
    }
    return [...byTab.values()];
  }, [fields, usedIds]);

  const anyActive = filters.some(isActive);

  function addFilter(id: string) {
    const field = fieldById.get(id);
    if (!field) return;
    onChange([...filters, emptyFilter(field)]);
  }
  function patchFilter(id: string, patch: Partial<StatFilter>) {
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function removeFilter(id: string) {
    onChange(filters.filter((f) => f.id !== id));
  }

  return (
    <div className="map-filters">
      <div className="map-filters-head">
        <span className="map-filters-title">Filtros de población</span>
        <span className="map-filters-count">
          {loading ? "Cargando…" : `Mostrando ${shown.toLocaleString("es")} de ${total.toLocaleString("es")}`}
        </span>
        <div className="map-filters-actions">
          {onExport && !loading && !error && shown > 0 && (
            <button
              type="button"
              className="mf-action"
              onClick={onExport}
              disabled={exporting}
              title="Exportar el grupo filtrado como CSV y anclar su prueba en Cardano"
            >
              {exporting ? "Anclando…" : "Exportar CSV"}
            </button>
          )}
          {anyActive && (
            <button
              type="button"
              className="mf-action"
              onClick={() => onChange(filters.filter((f) => !isActive(f)))}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="hint" style={{ margin: "4px 0 0" }}>
          No se pudieron cargar las estadísticas: {error}
        </p>
      ) : (
        <>
          {filters.length > 0 && (
            <ul className="filter-rows">
              {filters.map((f) => {
                const field = fieldById.get(f.id);
                if (!field) return null;
                return (
                  <li key={f.id} className="filter-row">
                    <span className="filter-row-label" title={field.tabLabel}>{field.label}</span>
                    <div className="filter-row-control">
                      <FilterControl field={field} filter={f} onPatch={(p) => patchFilter(f.id, p)} />
                    </div>
                    <button
                      type="button"
                      className="filter-remove"
                      title="Quitar filtro"
                      onClick={() => removeFilter(f.id)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="filter-add">
            {fields.length > 0 && (
              <select
                value=""
                disabled={loading || groups.length === 0}
                onChange={(e) => {
                  if (e.target.value) addFilter(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">+ Agregar filtro…</option>
                {groups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.fields.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            {filters.length === 0 && !loading && (
              <span className="hint inline-muted">
                {fields.length === 0
                  ? "No hay campos marcados como filtrables. Actívalos en la pestaña Configurar."
                  : "Filtra por estadísticas médicas (tabaquismo, IMC, edad, piso pélvico…)."}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface ControlProps {
  field: StatField;
  filter: StatFilter;
  onPatch: (patch: Partial<StatFilter>) => void;
}

function FilterControl({ field, filter, onPatch }: ControlProps) {
  if (field.type === "boolean") {
    const opts: Array<{ label: string; want: boolean | null }> = [
      { label: "Cualquiera", want: null },
      { label: "Sí", want: true },
      { label: "No", want: false },
    ];
    return (
      <div className="seg">
        {opts.map((o) => (
          <button
            key={o.label}
            type="button"
            className={`seg-btn ${filter.want === o.want ? "on" : ""}`}
            onClick={() => onPatch({ want: o.want })}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="range">
        <input
          type="number"
          value={filter.min ?? ""}
          placeholder={field.min != null ? String(field.min) : "mín"}
          onChange={(e) => onPatch({ min: e.target.value === "" ? null : Number(e.target.value) })}
        />
        <span className="range-dash">–</span>
        <input
          type="number"
          value={filter.max ?? ""}
          placeholder={field.max != null ? String(field.max) : "máx"}
          onChange={(e) => onPatch({ max: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div className="range">
        <input
          type="date"
          value={filter.dateMin ?? ""}
          onChange={(e) => onPatch({ dateMin: e.target.value || null })}
        />
        <span className="range-dash">–</span>
        <input
          type="date"
          value={filter.dateMax ?? ""}
          onChange={(e) => onPatch({ dateMax: e.target.value || null })}
        />
      </div>
    );
  }

  if (field.type === "text" || field.type === "address") {
    return (
      <input
        className="filter-text"
        type="text"
        value={filter.query}
        placeholder="contiene…"
        onChange={(e) => onPatch({ query: e.target.value })}
      />
    );
  }

  // picker / multiselect → toggle chips (match any selected)
  function toggle(opt: string) {
    const set = new Set(filter.selected);
    if (set.has(opt)) set.delete(opt);
    else set.add(opt);
    onPatch({ selected: [...set] });
  }
  return (
    <div className="filter-chips">
      {field.options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`filter-chip ${filter.selected.includes(opt) ? "on" : ""}`}
          onClick={() => toggle(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
