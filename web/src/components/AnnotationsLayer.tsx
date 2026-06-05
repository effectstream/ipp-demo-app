import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { Annotation } from "../annotations";

interface Props {
  annotations: Annotation[];
  highlightedId: string | null;
  onDelete: (id: string) => void;
}

// Imperatively syncs annotations with leaflet vector layers. Adds new ones,
// removes stale ones, updates changed ones in place so popups don't flicker.
export function AnnotationsLayer({ annotations, highlightedId, onDelete }: Props) {
  const map = useMap();
  const layersRef = useRef<Map<string, L.Layer>>(new Map());
  // Cache the source annotation alongside the layer so we know what to diff
  // against on update (text/name changes need a new popup).
  const sourceRef = useRef<Map<string, Annotation>>(new Map());
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  // Render / diff loop
  useEffect(() => {
    const existing = layersRef.current;
    const sources = sourceRef.current;
    const wantedIds = new Set(annotations.map((a) => a.id));

    // Remove gone
    for (const [id, layer] of existing) {
      if (!wantedIds.has(id)) {
        map.removeLayer(layer);
        existing.delete(id);
        sources.delete(id);
      }
    }

    // Add new or refresh changed
    for (const a of annotations) {
      const prev = sources.get(a.id);
      const layer = existing.get(a.id);
      if (!layer) {
        const newLayer = renderAnnotation(a);
        newLayer.bindPopup(renderPopupHTML(a));
        newLayer.addTo(map);
        existing.set(a.id, newLayer);
      } else if (!prev || !sameContent(prev, a)) {
        layer.unbindPopup();
        layer.bindPopup(renderPopupHTML(a));
      }
      sources.set(a.id, a);
    }
  }, [map, annotations]);

  // Tear down on unmount
  useEffect(() => {
    return () => {
      const existing = layersRef.current;
      for (const layer of existing.values()) map.removeLayer(layer);
      existing.clear();
    };
  }, [map]);

  // Highlight: restyle the leaflet layer when the hovered list item changes.
  useEffect(() => {
    const existing = layersRef.current;
    const sources = sourceRef.current;
    for (const [id, layer] of existing) {
      const ann = sources.get(id);
      if (!ann) continue;
      applyHighlight(layer, ann, id === highlightedId);
    }
    if (highlightedId) {
      const layer = existing.get(highlightedId);
      if (layer instanceof L.Path) layer.bringToFront();
    }
  }, [highlightedId]);

  // Wire up the "Eliminar" button inside popups. The popup HTML uses
  // data-annotation-id so we can route the click back into React.
  useEffect(() => {
    const container = map.getContainer();
    function onClick(e: Event) {
      const target = e.target as HTMLElement | null;
      if (!target?.matches?.(".annotation-delete")) return;
      const id = target.getAttribute("data-annotation-id");
      if (id) {
        onDeleteRef.current(id);
        map.closePopup();
      }
    }
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [map]);

  return null;
}

function renderAnnotation(a: Annotation): L.Layer {
  if (a.type === "note") {
    return L.marker([a.lat, a.lng], {
      icon: makeNoteIcon(false),
    });
  }
  return L.polygon(a.points, {
    color: "#7c3aed",
    weight: 2,
    fillColor: "#a78bfa",
    fillOpacity: 0.25,
  });
}

function makeNoteIcon(highlighted: boolean): L.DivIcon {
  return L.divIcon({
    className: `annotation-note-icon ${highlighted ? "is-highlighted" : ""}`,
    html: `<div class="annotation-note-pin ${highlighted ? "is-highlighted" : ""}"></div>`,
    iconSize: highlighted ? [30, 30] : [22, 22],
    iconAnchor: highlighted ? [15, 30] : [11, 22],
    popupAnchor: [0, highlighted ? -30 : -22],
  });
}

function applyHighlight(layer: L.Layer, a: Annotation, highlighted: boolean) {
  if (a.type === "note" && layer instanceof L.Marker) {
    layer.setIcon(makeNoteIcon(highlighted));
  } else if (a.type === "area" && layer instanceof L.Polygon) {
    if (highlighted) {
      layer.setStyle({ weight: 4, fillOpacity: 0.5, color: "#5b21b6" });
    } else {
      layer.setStyle({ weight: 2, fillOpacity: 0.25, color: "#7c3aed" });
    }
  }
}

function sameContent(a: Annotation, b: Annotation): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "note" && b.type === "note") {
    return a.text === b.text && a.lat === b.lat && a.lng === b.lng;
  }
  if (a.type === "area" && b.type === "area") {
    return a.name === b.name && a.points.length === b.points.length;
  }
  return false;
}

function renderPopupHTML(a: Annotation): string {
  const time = new Date(a.createdAt).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const body =
    a.type === "note"
      ? `<div class="annotation-text">${escapeHtml(a.text)}</div>
         <div class="annotation-meta">${escapeHtml(time)}</div>`
      : `<div class="annotation-text"><strong>${escapeHtml(a.name)}</strong></div>
         <div class="annotation-meta">${a.points.length} vértices · ${escapeHtml(time)}</div>`;
  return `<div class="annotation-popup">
    ${body}
    <button class="annotation-delete" data-annotation-id="${escapeAttr(a.id)}">Eliminar</button>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
