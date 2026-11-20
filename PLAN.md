# Implementation record

## Completed update — Vue 3 / Tailwind / Node.js, KML / KMZ and map simplification

User requested a modular Vue3 + Tailwind + Node.js stack with a restrained Google/Apple-like interface. Confirmed: retain the existing public Cloudflare service and provide an independently deployable Node.js backend. Later requests: left sidebar contains only events; mandatory event layer, optional map annotations; remove browse/event toolbar and legend, integrate extent with zoom. Basemap radio choices must be distinct from data-layer checkboxes, and support external geology APIs.

- [x] Refactor into Vue components, scoped workspace context, map/workspace composables, API services, shared utilities and a Tailwind token/style system. Remove obsolete styles.
- [x] Share the existing API between Cloudflare and Node HTTP adapters; SQLite migrations, transactions and persistent photo blobs; scripts, Dockerfile and deployment documentation. Node public fetch resolves and pins public DNS addresses, preserves TLS, streams PDF with cancellation, rejects encoded range ambiguity.
- [x] KML/KMZ exchange with geometry/text preservation, polygon holes and bounded safe XML/ZIP parsing. UI supports both formats and administrator-controlled export; GeoJSON remains internal API geometry.
- [x] Simplify the map to the requested hierarchy; add official GSMMA 1:50,000 WMS geology as an optional overlay, 4326-specific requests, attribution, source/scale/opacity/loading/errors/retry. No anonymous crossOrigin; source images verified in real Chromium.
- [x] Fix late annotation-read overwrites, reader state props, transient Leaflet label duplication and repeated external-layer timeout guards, with browser regressions.
- [x] 69 unit checks, dependency audit (zero vulnerabilities), build and Worker dry-run passed. Both runtimes passed all 29 browser scenarios, including first-load and retry timeouts and normal external-layer recovery.
- [x] Real desktop/mobile UI and real geology images inspected; original CWA PDF range requests verified for both transports. Native npm run dev launched both services and passed health/read checks. Docker daemon unavailable, so Docker image build is not claimed.
- [x] Published source e2ea411 through successful workflow 44650012500. Actual desktop/mobile basemap switching, mandatory events, optional annotations, annotation management, real WMS geology imagery/opacity and original CWA PDF page 86 passed with no runtime errors. Public projects/events/features match /tmp/event-atlas-before-framework.json exactly (2 projects, 6 events, 3 annotations; baseline contains no photos).

Implementation and checklist: .Codex/plans/2026-11-20-framework-ui-kml.md. Current docs: docs/architecture.md, docs/node-deployment.md, docs/webgis-usage-roadmap.md, docs/geology-source.md. Source is committed and deployed. Live verification: /tmp/event-atlas-framework-verification.json; full post-deploy snapshot: /tmp/event-atlas-after-framework.json.

## Completed update — chronological browsing and annotation cards

User wants a time-ordered map story rather than loose collection. Confirmed scope: manual previous/next plus an event overview, with chronological numbering and synchronized map/card focus; no autoplay. Also requested information cards for annotations and visibly different map symbols because the old hollow annotation point was too faint. Work in `/Users/lanyanlin/Desktop/event-atlas`; active checklist is `.Codex/plans/2026-11-19-chronological-map-tour.md`. Existing data and backend schema remain unchanged.

- [x] Implement chronological event guide, numbered circles, map/card selection and reader navigation, including filters, shared coordinates and mobile sizing.
- [x] Add independent blue annotation information cards, filled square points, stronger line/polygon styling and map-to-card selection.
- [x] Prevent annotation clicks from also creating events; retain blank-map event entry and drawing across existing features. WebGIS expert verified these interactions in Chromium with no runtime errors.
- [x] Verify 39 unit checks, 21 browser scenarios (including integration coverage), production build, desktop/mobile screenshots and clean diff checks.
- [x] Publish code `c86e33f` (workflow `44552803755`) and verify actual desktop/mobile tour and annotation cards. Match all production project/event/feature/photo references against `/tmp/event-atlas-before-tour.json`; no records changed and no runtime errors. Mobile overview keeps long names within the map bounds; dense labels can still overlap.

## Completed update — 2026-11-19

This is the independent application at `/Users/lanyanlin/Desktop/event-atlas`. The Codex chat is attached to the GeoPort workspace, but the application changes belong here; GeoPort was not changed.

- [x] Separate region overview (`#/`) and project workspace (`#/projects/:id`), with shareable routes, history, return navigation and mobile map/timeline/annotation views.
- [x] Region projects stay in the overview. Rainfall stations are coordinate-bearing event cards inside a project.
- [x] Project maps contain only their own events and independent point/line/polygon annotations, with drawing, GeoJSON import/export, layer controls and administrator-protected writes/exports.
- [x] Both map levels show clickable names. Events at exactly the same coordinates share a count marker and a list of names. Inherited positions are identified without inventing coordinates.
- [x] Website/photo tabs, expanded reading, visible text-only events, original-site fallbacks, actual MIME inspection and a dedicated PDF reader retaining `#page=`.
- [x] Preserve original project `8c7d8014-3228-4795-9017-4c9d46eac0a1`, its four events and original photo. Compare production records before/after to confirm no changes.
- [x] Create demo project `e1fd1808-1ca1-4f96-be54-311e70d69ec2` with three events and point/line/polygon annotations. Relocate its center to 24.204,121.005 and events to three distinct positions; only demo rows were updated.
- [x] Fix asynchronous saves/uploads and map cleanup during routing, resizing and zooming, with regression coverage.
- [x] Pass 36 unit tests, 17 browser tests, integration scenarios, build and dependency audit (zero reported vulnerabilities).
- [x] Publish code `0e5e320`; deployment workflow `44535964672` succeeded. Live desktop 1440×1000 and mobile 390×844 verification passed: names visible/clickable, demo names do not overlap, three event positions and three geometries appear, original event `123456` renders PDF page 86, no horizontal overflow or runtime errors.

Public site: https://popofebsdog.github.io/event-atlas/?v=0e5e320

Demo: https://popofebsdog.github.io/event-atlas/?v=0e5e320#/projects/e1fd1808-1ca1-4f96-be54-311e70d69ec2

Detailed checklists: `.Codex/plans/2026-11-19-project-map-annotations.md` and `.Codex/plans/2026-11-19-pdf-preview.md`. Current usage and boundaries: `docs/webgis-usage-roadmap.md`. Production backups and demo seed/relocation files are outside the repository under `/tmp`; credentials and `.env` files remain ignored.

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
