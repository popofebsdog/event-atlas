// Verified service details and GetMap examples: docs/geology-source.md.
export const EXTERNAL_LAYERS = [
  {
    id: "geology",
    name: "地質圖",
    type: "wms",
    url: "https://geomap.gsmma.gov.tw/mapguide/mapagent/mapagent.fcgi",
    params: {
      layers: "WMS/50K_Geomap_strata",
      version: "1.1.1",
      format: "image/png",
      transparent: true,
      styles: "",
      crs: "EPSG:4326",
    },
    sourceLabel: "經濟部地質調查及礦業管理中心（GSMMA）",
    sourceUrl: "https://geomap.gsmma.gov.tw/gsb108-1/list_service.cfm",
    scale: "1:50,000",
    attribution:
      '地質圖資：<a href="https://geomap.gsmma.gov.tw/gsb108-1/list_service.cfm" target="_blank" rel="noopener noreferrer">經濟部地質調查及礦業管理中心</a>',
    opacity: 0.65,
  },
];
