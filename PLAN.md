# Implementation record

## Current work — 2026-11-19

Continue in `/Users/lanyanlin/Desktop/event-atlas`. The Codex chat belongs to the GeoPort workspace, but this is an independent application. Do not switch this work to `/Users/lanyanlin/Desktop/geoport`.

- [x] Make event creation visible, support individual event coordinates and map selection, and allow manually entered rainfall stations.
- [x] Add event type, optional source, automatic creation/update timestamps, and collapsible date/type filters shared by the timeline and map.
- [x] Refresh the interface while retaining concise labels and the map-centered workflow.
- [x] Provide an original-site fallback for NCDR framing restrictions.
- [x] Fix event `123546` reading layout: separate website/photos, preserve 75% default width, allow full-width reading, and keep event details collapsible.
- [x] Obtain WebGIS expert feedback and record future recommendations in `docs/webgis-usage-roadmap.md`.
- [x] Back up production data before additive migrations.
- [x] Complete final verification using the actual event and the current test suite (26 unit checks, 5 browser tests and 5 integration scenarios; actual event desktop/mobile reading checked).
- [ ] Publish through the existing deployment workflow and verify the public site/API.

- [x] Independent project beside GeoPort; no existing application changes.
- [x] Frontend: map selection, manual WGS84/TWD97 coordinates, project list, Taiwan-time event form and timeline.
- [x] Workers API and D1 schema; paginated public reads, validated writes, Turnstile, administrator deletion.
- [x] Sandboxed external webpage preview; original-site link and download controls removed as requested.
- [x] Local best-effort webpage archive command and deployment instructions.
- [x] Validation and authorization boundary tests.
- [x] Local D1 end-to-end checks and frontend build; npm audit reports 0 vulnerabilities.
- [x] Browser desktop/mobile checks; map click form and project/event save succeed; second tab reads same event; supplied Yanzi website appears in iframe.
- [x] Cloud deployment: GitHub Pages https://popofebsdog.github.io/event-atlas/ with Cloudflare Workers, D1 and Turnstile. Workflow passed; public reads, CORS, administrator authorization and live page verified. Production starts empty.
- [x] Production administrator key saved locally in ignored `.admin-key.txt` (owner-only permissions); no credentials committed.

Visual direction: map-centered atlas; cloud white #ffffff, blue-grey ink #223b42, quiet water #eaf5f3, deep teal #157878, selected-point amber #d59432. Noto Sans TC for controls, restrained Noto Serif TC for place titles. Three panels become stacked sections on phones. Geography is primary, with a compact chronological list and original-site reader.

Prior research: Felt annotations (https://help.felt.com/annotations/annotations) informed coordinate-driven entry; ArcGIS StoryMaps tours (https://doc.arcgis.com/en/arcgis-storymaps/author-and-share/add-guided-tours.htm) informed linked map and content; MapHub (https://docs.maphub.net/tutorials/first_map/tutorial) informed lightweight place creation. The supplied Yanzi Gorge story is a linked external event webpage, not a template generator.
