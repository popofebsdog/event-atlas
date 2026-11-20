import { shallowRef, watch } from "vue";
import L from "leaflet";
import { formatEventTime } from "../lib/timeline";
import { addZoomControls } from "../lib/mapControls";
import { useMapLayers } from "./useMapLayers";

export function useProjectMap({
  selected,
  selectedId,
  visibleEvents,
  annotationDrawing,
  focusedEventId,
  onEvent,
  onPick,
  onFit,
}) {
  const mapRef = shallowRef(null),
    layers = useMapLayers();
  const {
    baseMap,
    externalLayers,
    setBaseMap,
    toggleExternalLayer,
    setExternalOpacity,
    retryExternalLayer,
  } = layers;
  let map, markers, observer;
  function paint() {
    if (!markers) return;
    // Release interactive labels before rebuilding their markers.
    markers.eachLayer((marker) => marker.unbindTooltip());
    markers.clearLayers();
    const groups = new Map();
    const order = new Map(
      visibleEvents.value.map((event, index) => [event.id, index + 1]),
    );
    for (const event of visibleEvents.value) {
      const lat = event.lat ?? selected.value?.lat,
        lng = event.lng ?? selected.value?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      const key = `${lat},${lng}`;
      if (!groups.has(key)) groups.set(key, { lat, lng, events: [] });
      groups.get(key).events.push(event);
    }
    for (const group of groups.values()) {
      const shared = group.events.length > 1,
        inherited = group.events.every((event) => event.lat == null),
        focused = group.events.some(
          (event) => event.id === focusedEventId.value,
        ),
        size = shared ? 32 : 28;
      const label = document.createElement("div");
      label.className = "event-map-names";
      L.DomEvent.disableClickPropagation(label);
      L.DomEvent.disableScrollPropagation(label);
      for (const event of group.events) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "map-label-link";
        button.textContent = `${order.get(event.id)}. ${event.title}`;
        button.disabled = annotationDrawing.value;
        if (event.id === focusedEventId.value) {
          button.classList.add("is-focused");
          button.setAttribute("aria-current", "step");
        }
        button.setAttribute("aria-label", `閱讀事件：${event.title}`);
        button.title =
          `${formatEventTime(event.occurred_at)} · ` +
          (event.lat == null
            ? "沿用地區座標"
            : `${event.lat.toFixed(5)}, ${event.lng.toFixed(5)}`);
        button.addEventListener("click", (click) => {
          click.stopPropagation();
          onEvent(event);
        });
        label.append(button);
      }
      if (shared || inherited) {
        const note = document.createElement("small");
        note.textContent =
          (inherited ? "沿用地區座標" : "共用位置") +
          (shared ? ` · ${group.events.length} 筆` : "");
        label.append(note);
      }
      const marker = L.marker([group.lat, group.lng], {
        interactive: !annotationDrawing.value,
        icon: L.divIcon({
          className: "",
          html: `<span class="event-pin numbered${inherited ? " inherited" : ""}${shared ? " shared" : ""}${focused ? " focused" : ""}">${shared ? Math.min(group.events.length, 9) + (group.events.length > 9 ? "+" : "") : order.get(group.events[0].id)}</span>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        title: shared
          ? `事件群組：${group.events.length} 筆`
          : `事件：${group.events[0].title}`,
        zIndexOffset: focused ? 2000 : 1000,
      })
        .addTo(markers)
        .bindTooltip(label, {
          permanent: true,
          interactive: !annotationDrawing.value,
          direction: "top",
          offset: [0, -12],
          className: "map-name-label event-name-label",
          opacity: 1,
        });
      marker.on("click", () =>
        shared
          ? label.querySelector("button")?.focus()
          : onEvent(group.events[0]),
      );
    }
  }

  function setup() {
    if (map || !document.getElementById("map")) return;
    map = L.map("map", {
      zoomControl: false,
      zoomAnimation: false,
      fadeAnimation: false,
    }).setView([23.85, 121], 7);
    layers.attach(map);
    addZoomControls(map, onFit);
    markers = L.layerGroup().addTo(map);
    mapRef.value = map;
    map.on("click", (event) => onPick(event.latlng));
    const instance = map;
    observer = new ResizeObserver((entries) => {
      if (
        map === instance &&
        instance.getContainer().isConnected &&
        entries[0].contentRect.width > 0 &&
        entries[0].contentRect.height > 0
      )
        instance.invalidateSize({ pan: false });
    });
    observer.observe(map.getContainer());
    paint();
  }
  function destroy() {
    observer?.disconnect();
    observer = null;
    mapRef.value = null;
    layers.detach();
    map?.remove();
    map = null;
    markers = null;
  }
  watch([selectedId, visibleEvents, annotationDrawing, focusedEventId], paint, {
    deep: true,
  });
  return {
    mapRef,
    baseMap,
    externalLayers,
    setBaseMap,
    toggleExternalLayer,
    setExternalOpacity,
    retryExternalLayer,
    setup,
    destroy,
  };
}
