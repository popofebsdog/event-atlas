# Implementation record

## Current work — two map levels, 2026-11-19

User clarification: the overview map contains region projects; entering a project opens its own map. Rainfall stations are coordinate-bearing event cards within a region project, not a separate project type. Project maps accept independent point, line and polygon annotations. Create sample events as part of verification.

Continue in `/Users/lanyanlin/Desktop/event-atlas`. Detailed active checklist: `.Codex/plans/2026-11-19-project-map-annotations.md`. WebGIS expert consulted for both information architecture and implementation review. Current documentation: `docs/webgis-usage-roadmap.md`.

- [x] Restore region projects in the overview; introduce hash-routed overview/project workspaces, project-scoped maps and responsive sidebar/map views.
- [x] Add validated project geometry storage/API and point/line/polygon drawing, GeoJSON import/export, layer controls and coordinate-bearing station events.
- [x] Address expert findings: inherited event coordinates, overview coordinate previews, mobile location display, route draft cleanup, fixed project ownership, stale save responses and overview resize.
- [x] Complete expert/code/visual review; 32 unit tests, 11 browser tests, build and npm audit passed. Demo created locally (3 events and 3 geometries); production data backed up before the additive schema update.
- [x] Publish two-level workspaces (commit `edeb7c4`, workflow `44528416434`), add a clearly labeled production demo (3 events, point/line/polygon), and verify original data is unchanged (2 projects / 7 events total after adding the demo).
- [ ] Publish the final text-only reader adjustment and verify live desktop/mobile navigation and reading.

Latest steering: event `123456` links to a CWA PDF with `#page=86` but the generic iframe was blank. PDF-specific preview and MIME detection are implemented and locally verified against the actual 100-page document, including page 86 on desktop/mobile. Detailed checklist: `.Codex/plans/2026-11-19-pdf-preview.md`. Final local checks: 36 unit tests, 15 browser tests, build and audit passed. A real Leaflet CSS zoom callback-after-remove error was reproduced and covered by a passing navigation regression; map zoom animation now uses supported non-CSS settings. Publish these final changes and run combined live verification before marking the two-level task complete.

Latest user correction: show names directly at both map levels, and separate the current demo coordinates. Implemented clickable permanent project/event labels and grouped name lists for genuinely shared event positions. Only demo project `e1fd1808-1ca1-4f96-be54-311e70d69ec2` was relocated (center 24.204,121.005), together with its 3 distinct event positions and 3 geometries; original project/events were checked unchanged. Local checks now pass 36 unit and 16 browser tests. PDF release `4993a28` / workflow `44532498819` succeeded; original event `123456` now has a working production PDF byte-range endpoint and MIME detection. Finish name-label publication and combined desktop/mobile live verification, then mark all active checklists complete.

## Previous completed work — 2026-11-19

Continue in `/Users/lanyanlin/Desktop/event-atlas`. The Codex chat belongs to the GeoPort workspace, but this is an independent application. Do not switch this work to `/Users/lanyanlin/Desktop/geoport`.

- [x] Make event creation visible, support individual event coordinates and map selection, and allow manually entered rainfall stations.
- [x] Add event type, optional source, automatic creation/update timestamps, and collapsible date/type filters shared by the timeline and map.
- [x] Refresh the interface while retaining concise labels and the map-centered workflow.
- [x] Provide an original-site fallback for NCDR framing restrictions.
- [x] Fix event `123546` reading layout: separate website/photos, preserve 75% default width, allow full-width reading, and keep event details collapsible.
- [x] Obtain WebGIS expert feedback and record future recommendations in `docs/webgis-usage-roadmap.md`.
- [x] Back up production data before additive migrations.
- [x] Complete final verification using the actual event and the current test suite (26 unit checks, 5 browser tests and 5 integration scenarios; actual event desktop/mobile reading checked).
- [x] Publish through the existing deployment workflow and verify the public site/API. Code commit `c2333ad`; GitHub Actions run `44523058010` passed. Production retained its 1 project, 4 events and 1 photo; original creation times and photo references were preserved. The public `123546` reader has separate website/photo panes, over 700px of website height at 1440×1000 and a working full-width control.

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
