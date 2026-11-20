import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  onUnmounted,
  watch,
  nextTick,
} from "vue";
import L from "leaflet";
import proj4 from "proj4";
import { api, all, photoUrl } from "../services/api";
import { preparePhoto } from "../lib/media";
import {
  filterEvents,
  chronologicalEvents,
  formatEventTime,
} from "../lib/timeline";
import { useProjectMap } from "./useProjectMap";

export function useAtlasWorkspace() {
  const projects = ref([]),
    events = ref([]),
    selectedId = ref(readProjectId());
  const features = ref([]),
    annotationDrawing = ref(false);
  const annotationsPanelOpen = ref(false);
  const overviewView = ref(null),
    mobileTab = ref("map"),
    showAnnotations = ref(false);
  const focusedEventId = ref(""),
    tourOverview = ref(false);
  function readProjectId() {
    return (
      window.location.hash.match(/^#\/projects\/([a-zA-Z0-9-]{1,64})$/)?.[1] ||
      ""
    );
  }
  const busy = ref(false),
    loading = ref(true),
    error = ref(""),
    notice = ref(""),
    synced = ref("");
  const dialog = ref(null),
    formKind = ref(""),
    challengeKey = ref(0),
    token = ref("");
  const name = ref(""),
    eventProjectId = ref(""),
    mapMode = ref("browse"),
    lat = ref(""),
    lng = ref(""),
    crs = ref("wgs84"),
    east = ref(""),
    north = ref("");
  const title = ref(""),
    category = ref("other"),
    source = ref(""),
    description = ref(""),
    date = ref(""),
    url = ref(""),
    activeEvent = ref(null);
  const readerWide = ref(false);
  const photos = ref([]),
    photoBusy = ref(false);
  let formGeneration = 0;
  const photoSource = (photo) =>
    photo.startsWith("data:") ? photo : photoUrl(photo);
  async function selectPhotos(event) {
    const generation = formGeneration;
    photoBusy.value = true;
    notice.value = "";
    try {
      const files = [...event.target.files];
      if (files.length + photos.value.length > 5)
        throw new Error("每個事件最多 5 張照片");
      const added = [];
      for (const file of files) {
        added.push(await preparePhoto(file));
        if (generation !== formGeneration) return;
      }
      photos.value.push(...added);
    } catch (e) {
      if (generation === formGeneration) notice.value = e.message;
    } finally {
      if (generation === formGeneration) photoBusy.value = false;
      event.target.value = "";
    }
  }
  const editingId = ref(""),
    adminKey = ref(""),
    deleteTarget = ref(null),
    deleteDialog = ref(null),
    deleteError = ref("");
  const exportDialog = ref(null),
    exportError = ref("");
  const filterCategory = ref(""),
    filterFrom = ref(""),
    filterTo = ref("");
  const visibleEvents = computed(() =>
    chronologicalEvents(
      filterEvents(events.value, {
        category: filterCategory.value,
        from: filterFrom.value,
        to: filterTo.value,
      }),
    ),
  );
  const focusedEvent = computed(() =>
    visibleEvents.value.find((event) => event.id === focusedEventId.value),
  );
  const hasFilters = computed(
    () => !!(filterCategory.value || filterFrom.value || filterTo.value),
  );
  const coordinatePreview = ref(null),
    previewMapEl = ref(null);
  let previewMap;
  let draftMarker,
    timer,
    fetching = false,
    generation = 0;
  let featureRevision = 0;
  const selected = computed(() =>
    projects.value.find((p) => p.id === selectedId.value),
  );
  const {
    mapRef,
    baseMap,
    externalLayers,
    setBaseMap,
    toggleExternalLayer,
    setExternalOpacity,
    retryExternalLayer,
    setup: setupProjectMap,
    destroy: destroyProjectMap,
  } = useProjectMap({
    selected,
    selectedId,
    visibleEvents,
    annotationDrawing,
    focusedEventId,
    onEvent: view,
    onPick: pick,
    onFit: fitProject,
  });
  const dateFormat = formatEventTime;
  const canSubmit = computed(
    () =>
      !busy.value &&
      !photoBusy.value &&
      !!adminKey.value.trim() &&
      (editingId.value ||
        !import.meta.env.VITE_TURNSTILE_SITE_KEY ||
        token.value),
  );
  const markerIcon = (active) =>
    L.divIcon({
      className: "",
      html: `<span class="map-pin ${active ? "active" : ""}"></span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

  async function locateEvent(event) {
    if (
      !selected.value ||
      event.project_id !== selectedId.value ||
      !visibleEvents.value.some((item) => item.id === event.id)
    )
      return;
    const instance = mapRef.value,
      projectId = selectedId.value,
      point = [
        event.lat ?? selected.value.lat,
        event.lng ?? selected.value.lng,
      ];
    focusedEventId.value = event.id;
    tourOverview.value = false;
    mobileTab.value = "map";
    annotationsPanelOpen.value = false;
    mapMode.value = "browse";
    await nextTick();
    if (
      mapRef.value !== instance ||
      selectedId.value !== projectId ||
      !instance?.getContainer().isConnected
    )
      return;
    instance.invalidateSize();
    instance.stop();
    instance.flyTo(point, 15, {
      duration: 0.7,
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    scrollFocusedCard();
  }
  function scrollFocusedCard() {
    const card = document.querySelector(
      `.timeline [data-event-id="${focusedEventId.value}"]`,
    );
    if (card?.getClientRects().length)
      card.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  }
  function selectTourEvent(id) {
    const event = visibleEvents.value.find((item) => item.id === id);
    if (event) locateEvent(event);
  }
  function readTourEvent(id) {
    const event = visibleEvents.value.find((item) => item.id === id);
    if (event) {
      const wide = readerWide.value;
      view(event);
      readerWide.value = wide;
    }
  }
  async function overviewEvents() {
    if (!selected.value || !mapRef.value || !visibleEvents.value.length) return;
    const instance = mapRef.value,
      projectId = selectedId.value;
    const bounds = L.latLngBounds(
      visibleEvents.value.map((event) => [
        event.lat ?? selected.value.lat,
        event.lng ?? selected.value.lng,
      ]),
    );
    activeEvent.value = null;
    mobileTab.value = "map";
    annotationsPanelOpen.value = false;
    mapMode.value = "browse";
    tourOverview.value = true;
    await nextTick();
    if (
      mapRef.value !== instance ||
      selectedId.value !== projectId ||
      !instance.getContainer().isConnected
    )
      return;
    instance.invalidateSize();
    instance.stop();
    instance.fitBounds(bounds, {
      padding: [Math.min(112, instance.getSize().x / 3), 48],
      maxZoom: 15,
      animate: false,
    });
  }
  async function locateFeature(feature) {
    const instance = mapRef.value,
      projectId = selectedId.value;
    mobileTab.value = "map";
    showAnnotations.value = true;
    await nextTick();
    if (
      mapRef.value !== instance ||
      selectedId.value !== projectId ||
      !instance?.getContainer().isConnected
    )
      return;
    instance.invalidateSize();
    instance.stop();
    instance.fitBounds(
      L.geoJSON({
        type: "Feature",
        geometry: feature.geometry,
        properties: {},
      }).getBounds(),
      { padding: [40, 40], maxZoom: 16, animate: false },
    );
  }
  function inspectFeature() {
    activeEvent.value = null;
    mapMode.value = "browse";
    mobileTab.value = "map";
    annotationsPanelOpen.value = true;
    showAnnotations.value = true;
  }
  async function loadEvents(id) {
    const version = ++generation,
      revision = featureRevision;
    const [data, annotations] = await Promise.all([
      all(`/projects/${id}/events`),
      all(`/projects/${id}/features`),
    ]);
    if (version === generation && id === selectedId.value) {
      events.value = data;
      if (revision === featureRevision) features.value = annotations;
    }
  }
  function annotationsSaved(items) {
    if (!items.length || items[0].project_id !== selectedId.value) return;
    featureRevision++;
    features.value.push(...items);
    showAnnotations.value = true;
    annotationsPanelOpen.value = true;
  }
  function annotationsRemoved({ id, projectId }) {
    if (projectId !== selectedId.value) return;
    featureRevision++;
    features.value = features.value.filter((feature) => feature.id !== id);
  }
  async function refresh() {
    if (fetching) return;
    fetching = true;
    try {
      projects.value = await all("/projects");
      if (selectedId.value && !selected.value) {
        events.value = [];
        features.value = [];
        activeEvent.value = null;
        generation++;
        await nextTick();
        destroyProjectMap();
      }
      if (selected.value) await loadEvents(selectedId.value);
      synced.value = new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      });
      error.value = "";
    } catch (e) {
      error.value = `無法同步：${e.message}。請確認後端已啟動。`;
    } finally {
      loading.value = false;
      fetching = false;
    }
  }
  async function choose(p, navigate = true) {
    resetTransient();
    selectedId.value = p.id;
    if (navigate) window.location.hash = `/projects/${p.id}`;
    events.value = [];
    features.value = [];
    activeEvent.value = null;
    focusedEventId.value = "";
    tourOverview.value = false;
    filterCategory.value = "";
    filterFrom.value = "";
    filterTo.value = "";
    mobileTab.value = "map";
    showAnnotations.value = false;
    mapMode.value = "browse";
    await nextTick();
    setupProjectMap();
    try {
      await loadEvents(p.id);
      await nextTick();
      if (selectedId.value === p.id) {
        mapRef.value?.invalidateSize();
        fitProject();
      }
    } catch (e) {
      error.value = e.message;
    }
  }
  function resetTransient() {
    dialog.value?.close();
    deleteDialog.value?.close();
    exportDialog.value?.close();
    cleanForm();
    deleteTarget.value = null;
    notice.value = "";
    focusedEventId.value = "";
    tourOverview.value = false;
    annotationsPanelOpen.value = false;
    annotationDrawing.value = false;
  }
  async function goOverview(navigate = true) {
    resetTransient();
    selectedId.value = "";
    events.value = [];
    features.value = [];
    activeEvent.value = null;
    generation++;
    if (navigate) window.location.hash = "/";
    await nextTick();
    destroyProjectMap();
  }
  function syncRoute() {
    const id = readProjectId();
    if (id === selectedId.value) return;
    if (!id) {
      goOverview(false);
      return;
    }
    const project = projects.value.find((p) => p.id === id);
    if (project) choose(project, false);
    else {
      resetTransient();
      selectedId.value = id;
      events.value = [];
      features.value = [];
      activeEvent.value = null;
      generation++;
      nextTick(destroyProjectMap);
    }
  }
  function createProject(point) {
    lat.value = point?.lat ?? "";
    lng.value = point?.lng ?? "";
    openForm("project");
  }
  function pickEvent() {
    mapRef.value?.stop();
    mapMode.value = "event";
    mobileTab.value = "map";
    annotationsPanelOpen.value = false;
  }
  function annotationInteraction(active) {
    const wasActive = annotationDrawing.value;
    annotationDrawing.value = active;
    if (active) {
      mapRef.value?.stop();
      mapMode.value = "browse";
      mobileTab.value = "map";
      annotationsPanelOpen.value = false;
      showAnnotations.value = true;
    } else if (wasActive && selectedId.value) annotationsPanelOpen.value = true;
  }
  function fitProject() {
    if (!mapRef.value || !selected.value) return;
    const bounds = L.latLngBounds([[selected.value.lat, selected.value.lng]]);
    for (const event of events.value)
      if (typeof event.lat === "number" && typeof event.lng === "number")
        bounds.extend([event.lat, event.lng]);
    if (features.value.length)
      bounds.extend(
        L.geoJSON(
          features.value.map((f) => ({
            type: "Feature",
            geometry: f.geometry,
            properties: {},
          })),
        ).getBounds(),
      );
    mapRef.value.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 15,
      animate: false,
    });
  }
  function openForm(kind) {
    if (busy.value) return;
    formGeneration++;
    photoBusy.value = false;
    editingId.value = "";
    formKind.value = kind;
    crs.value = "wgs84";
    token.value = "";
    challengeKey.value++;
    notice.value = "";
    if (formKind.value === "project") {
      name.value = "";
    } else {
      eventProjectId.value = selectedId.value;
      const place = projects.value.find((p) => p.id === eventProjectId.value);
      lat.value = place?.lat ?? "";
      lng.value = place?.lng ?? "";
      title.value = "";
      category.value = "other";
      source.value = "";
      description.value = "";
      url.value = "";
      date.value = "";
      photos.value = [];
    }
    dialog.value.showModal();
    nextTick(() => dialog.value.querySelector("input")?.focus());
  }
  function editRecord(kind, record) {
    if (busy.value) return;
    openForm(kind);
    editingId.value = record.id;
    if (kind === "project") {
      name.value = record.name;
      lat.value = record.lat;
      lng.value = record.lng;
    } else {
      eventProjectId.value = record.project_id;
      lat.value = record.lat ?? selected.value.lat;
      lng.value = record.lng ?? selected.value.lng;
      title.value = record.title;
      description.value = record.description;
      url.value = record.url;
      category.value = record.category || "other";
      source.value = record.source || "";
      photos.value = [...(record.photos || [])];
      date.value = new Date(Date.parse(record.occurred_at) + 8 * 3600000)
        .toISOString()
        .slice(0, 16);
    }
  }
  function askDelete(kind, record) {
    deleteTarget.value = {
      kind,
      id: record.id,
      name: record.name || record.title,
    };
    deleteError.value = "";
    deleteDialog.value.showModal();
  }
  async function removeRecord() {
    busy.value = true;
    deleteError.value = "";
    const target = deleteTarget.value;
    try {
      await api(`/${target.kind}/${target.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminKey.value}` },
      });
      generation++;
      if (target.kind === "projects") {
        projects.value = projects.value.filter((p) => p.id !== target.id);
        if (selectedId.value === target.id) await goOverview();
      } else {
        events.value = events.value.filter((e) => e.id !== target.id);
        if (activeEvent.value?.id === target.id) activeEvent.value = null;
      }
      deleteDialog.value.close();
    } catch (e) {
      deleteError.value = e.message;
    } finally {
      busy.value = false;
    }
  }
  function pick(position) {
    if (annotationDrawing.value || mapMode.value === "browse") return;
    openForm(mapMode.value);
    mapMode.value = "browse";
    lat.value = position.lat.toFixed(6);
    lng.value = position.lng.toFixed(6);
    if (draftMarker) draftMarker.remove();
    draftMarker = L.marker(position, { icon: markerIcon(true) }).addTo(
      mapRef.value,
    );
  }
  function closeForm() {
    if (!busy.value && !photoBusy.value) dialog.value.close();
  }
  function cleanForm() {
    formGeneration++;
    photoBusy.value = false;
    photos.value = [];
    previewMap?.remove();
    previewMap = null;
    coordinatePreview.value = null;
    formKind.value = "";
    if (draftMarker) {
      draftMarker.remove();
      draftMarker = null;
    }
  }
  function coordinates() {
    let y = Number(lat.value),
      x = Number(lng.value);
    if (crs.value === "twd97") {
      if (!east.value || !north.value)
        throw new Error("請填寫 TWD97 X、Y 座標");
      [x, y] = proj4(
        "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs",
        "EPSG:4326",
        [Number(east.value), Number(north.value)],
      );
    } else if (lat.value === "" || lng.value === "")
      throw new Error("請填寫經緯度");
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x) > 180 ||
      Math.abs(y) > 90
    )
      throw new Error("座標無效");
    return { lat: y, lng: x };
  }
  async function locateCoordinates() {
    notice.value = "";
    try {
      const point = coordinates();
      coordinatePreview.value = point;
      await nextTick();
      previewMap?.remove();
      previewMap = L.map(previewMapEl.value, {
        scrollWheelZoom: false,
        zoomAnimation: false,
      }).setView([point.lat, point.lng], 15);
      L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution:
            'Source: <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community',
        },
      ).addTo(previewMap);
      L.marker([point.lat, point.lng], { icon: markerIcon(true) }).addTo(
        previewMap,
      );
      mapRef.value?.setView([point.lat, point.lng], 15);
    } catch (e) {
      notice.value = e.message;
    }
  }
  watch([lat, lng, east, north, crs], () => {
    previewMap?.remove();
    previewMap = null;
    coordinatePreview.value = null;
  });
  async function save() {
    const fromRoute = selectedId.value,
      targetProjectId = eventProjectId.value;
    busy.value = true;
    notice.value = "";
    try {
      if (formKind.value === "project") {
        const p = await api(
          editingId.value ? `/projects/${editingId.value}` : "/projects",
          {
            method: editingId.value ? "PUT" : "POST",
            headers: { Authorization: `Bearer ${adminKey.value}` },
            body: JSON.stringify({
              name: name.value,
              ...coordinates(),
              token: token.value,
            }),
          },
        );
        if (editingId.value)
          projects.value = projects.value.map((item) =>
            item.id === p.id ? p : item,
          );
        else projects.value.push(p);
        if (selectedId.value === fromRoute) await choose(p);
      } else {
        // datetime-local is explicitly Taiwan time, independent of the visitor's time zone.
        const occurred_at = new Date(`${date.value}:00+08:00`).toISOString();
        if (!targetProjectId) throw new Error("請先建立並選擇地區專案");
        const saved = await api(
          editingId.value
            ? `/events/${editingId.value}`
            : `/projects/${targetProjectId}/events`,
          {
            method: editingId.value ? "PUT" : "POST",
            headers: { Authorization: `Bearer ${adminKey.value}` },
            body: JSON.stringify({
              title: title.value,
              ...((crs.value === "wgs84" &&
                lat.value === "" &&
                lng.value === "") ||
              (crs.value === "twd97" && east.value === "" && north.value === "")
                ? { lat: null, lng: null }
                : coordinates()),
              category: category.value,
              source: source.value,
              description: description.value,
              occurred_at,
              url: url.value,
              photos: photos.value,
              token: token.value,
            }),
          },
        );
        if (selectedId.value === saved.project_id) {
          generation++;
          events.value = [
            ...events.value.filter((e) => e.id !== saved.id),
            saved,
          ].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
        }
      }
      dialog.value.close();
      error.value = "";
    } catch (e) {
      if (selectedId.value === fromRoute) notice.value = e.message;
      token.value = "";
      challengeKey.value++;
    } finally {
      busy.value = false;
    }
  }
  function view(event) {
    if (event.project_id !== selectedId.value) return;
    locateEvent(event);
    readerWide.value = false;
    activeEvent.value = event;
  }
  function askExport() {
    exportError.value = "";
    exportDialog.value.showModal();
  }
  async function downloadData() {
    if (busy.value || !adminKey.value.trim() || !selected.value) return;
    busy.value = true;
    exportError.value = "";
    const projectId = selectedId.value;
    const snapshot = JSON.stringify(
      {
        version: 2,
        project: selected.value,
        events: events.value,
        features: features.value,
      },
      null,
      2,
    );
    try {
      await api("/admin/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminKey.value}` },
      });
      const blob = new Blob([snapshot], { type: "application/json" });
      const href = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = href;
      a.download = `event-atlas-${projectId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      exportDialog.value.close();
    } catch (e) {
      exportError.value = e.message;
    } finally {
      busy.value = false;
    }
  }
  watch(visibleEvents, (items) => {
    if (
      focusedEventId.value &&
      !items.some((event) => event.id === focusedEventId.value)
    ) {
      focusedEventId.value = "";
      tourOverview.value = false;
    }
  });
  watch(mobileTab, async () => {
    await nextTick();
    if (mapRef.value?.getContainer().clientWidth) mapRef.value.invalidateSize();
    if (mobileTab.value === "sidebar") scrollFocusedCard();
  });
  onMounted(async () => {
    window.addEventListener("hashchange", syncRoute);
    await refresh();
    if (selected.value) {
      await nextTick();
      setupProjectMap();
      fitProject();
    }
    timer = setInterval(() => {
      if (
        !document.hidden &&
        !busy.value &&
        !formKind.value &&
        !deleteTarget.value &&
        !annotationDrawing.value
      )
        refresh();
    }, 15000);
  });
  onBeforeUnmount(() => {
    previewMap?.remove();
    clearInterval(timer);
    window.removeEventListener("hashchange", syncRoute);
    generation++;
  });
  onUnmounted(destroyProjectMap);

  return {
    projects,
    events,
    selectedId,
    features,
    mapRef,
    annotationDrawing,
    overviewView,
    mobileTab,
    showAnnotations,
    annotationsPanelOpen,
    baseMap,
    externalLayers,
    setBaseMap,
    toggleExternalLayer,
    setExternalOpacity,
    retryExternalLayer,
    focusedEventId,
    tourOverview,
    busy,
    loading,
    error,
    notice,
    synced,
    dialog,
    formKind,
    challengeKey,
    token,
    name,
    eventProjectId,
    mapMode,
    lat,
    lng,
    crs,
    east,
    north,
    title,
    category,
    source,
    description,
    date,
    url,
    activeEvent,
    readerWide,
    photos,
    photoBusy,
    photoSource,
    selectPhotos,
    editingId,
    adminKey,
    deleteTarget,
    deleteDialog,
    deleteError,
    exportDialog,
    exportError,
    filterCategory,
    filterFrom,
    filterTo,
    visibleEvents,
    focusedEvent,
    hasFilters,
    coordinatePreview,
    previewMapEl,
    selected,
    dateFormat,
    canSubmit,
    locateEvent,
    selectTourEvent,
    readTourEvent,
    overviewEvents,
    locateFeature,
    inspectFeature,
    choose,
    goOverview,
    createProject,
    pickEvent,
    annotationInteraction,
    annotationsSaved,
    annotationsRemoved,
    fitProject,
    openForm,
    editRecord,
    askDelete,
    removeRecord,
    closeForm,
    cleanForm,
    locateCoordinates,
    save,
    view,
    askExport,
    downloadData,
    refresh,
  };
}
