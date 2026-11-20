import L from "leaflet";

export function createBaseLayers(map) {
  const basic = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  const satellite = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        'Source: <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer">Esri</a>, Vantor, Earthstar Geographics, GIS User Community',
    },
  );
  satellite.addTo(map);
  return { basic, satellite };
}
export function changeBaseLayer(map, layers, kind) {
  if (!map || !layers?.[kind]) return;
  for (const layer of Object.values(layers))
    if (map.hasLayer(layer)) map.removeLayer(layer);
  layers[kind].addTo(map);
}
export function addZoomControls(map, onFit, label = "專案範圍") {
  const control = L.control.zoom({ position: "bottomleft" }).addTo(map),
    button = document.createElement("button");
  button.type = "button";
  button.className = "map-extent-control";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="4"/></svg>';
  L.DomEvent.disableClickPropagation(button);
  L.DomEvent.on(button, "click", (event) => {
    L.DomEvent.stop(event);
    onFit();
  });
  control.getContainer().append(button);
  L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
}
