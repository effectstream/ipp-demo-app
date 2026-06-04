declare module "leaflet.heat" {
  // Side-effect import. Augments the `leaflet` namespace at runtime with
  // L.heatLayer; the typing for that lives in the leaflet module declaration
  // below.
}

import "leaflet";

declare module "leaflet" {
  type HeatLatLng = [number, number] | [number, number, number];

  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: HeatLatLng[]): this;
    addLatLng(latlng: HeatLatLng): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
  }

  function heatLayer(latlngs: HeatLatLng[], options?: HeatLayerOptions): HeatLayer;
}
