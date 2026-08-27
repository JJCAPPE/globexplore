# GlobExplore production improvement pass

## Goal

Make the first deployed laboratory substantially more informative and visually legible without adding backend complexity or compromising the rigid-Earth model.

## Improvements implemented in the first pass

### 1. Axis Lens as an explanatory instrument

- Add explicit visual magnification modes: `1×`, `10⁹×`, `10¹²×`, and `AUTO`.
- Keep numerical values physically exact and label all visual exaggeration.
- Draw both the figure-pole and instantaneous spin-vector pole.
- Show metric rings with scale labels and a directional azimuth guide.
- Add a one-line explanation of why microscopic shifts can be scientifically real but invisible at globe scale.

### 2. Scale and geometry context

- Add a compact scale rail showing the current pole shift against human hair width, a millimetre, a centimetre, and a metre.
- Add a latitude-response indicator showing that a point load has essentially zero first-order figure-axis tilt at the equator and pole and peaks near 45° latitude.
- Add an explicit `visual-only` tag to exaggerated axis geometry.

### 3. Scenario and transfer communication

- Add longitude meridians, an atmospheric rim, geodesic transfer arcs, and distinct source/destination semantics.
- Make model-quality badges prominent.
- Show scenario-specific explanatory text without requiring the model drawer.
- Preserve direct editing: selecting a preset configures the experiment, then any click or slider change becomes `Custom experiment`.

## Production evidence collected on 27 August 2026

The deployed site was exercised in Chromium against the production alias at:

- `1440 × 900` desktop;
- `1280 × 800` desktop with reduced motion;
- `393 × 852` iPhone-class portrait;
- `375 × 667` short mobile portrait.

The first production audit confirmed:

- HTTP 200 on the production alias;
- a non-zero Asia result of `138.44 µm`;
- no browser console errors or uncaught page errors;
- working Axis Lens magnification controls, transfer mode, and model sheet;
- no document-level horizontal or vertical overflow.

It also exposed four design defects that require a second pass:

1. The desktop Axis Lens occupies the same right-side vertical region as the metrics panel.
2. The Axis Lens opens by default on mobile and obscures the primary result and most of the globe.
3. The mobile camera is close enough that the globe reads as an abstract curved grid rather than a planet.
4. The wireframe sphere provides insufficient geographic context for interpreting source, destination, latitude, and longitude.

The initial overlap detector also treated Playwright bounding boxes as if they contained `right` and `bottom` fields. The verifier must calculate those values from `x`, `y`, `width`, and `height` before its overlap findings are accepted.

## Second-pass plan

### 1. Geographic Earth surface

- Generate a local, low-resolution Natural Earth land texture from the `world-atlas` TopoJSON package.
- Keep the dark scientific visual language while adding recognizable coastlines and restrained land fill.
- Align texture longitude with the project’s Earth-fixed coordinate system so scenario markers land on the correct regions.
- Keep the data local to the bundle; production must not depend on a third-party tile server.

### 2. Responsive camera composition

- Move the default desktop camera slightly farther back so the globe is mostly visible rather than heavily cropped.
- Use a wider mobile camera distance so a recognizable full-globe composition remains above the metric and control panels.
- Preserve manual orbit and zoom after the initial responsive camera placement.

### 3. Axis Lens layout model

- Keep the lens open by default only on viewports wide enough to present it without covering metrics.
- Place the desktop lens immediately left of the metrics column, with a verified gap from both metrics and the bottom dock.
- Make the mobile lens a dedicated near-full-screen inspection state with a backdrop and explicit close action.
- Keep numeric results invariant under visual magnification.

### 4. Real-world benchmark context

- Add a compact benchmark block distinguishing model outputs from published or observed context:
  - Three Gorges figure-axis benchmark: approximately `2 cm`;
  - 2011 Tōhoku figure-axis benchmark: approximately `17 cm`;
  - historical polar migration since 1900: approximately `10 m`.
- Label the block so users cannot mistake these reference values for outputs of the simplified surface-load solver.
- Hide or condense the block on narrow mobile viewports to protect the primary interaction area.

### 5. Production verifier correction

- Correct rectangle intersection and viewport-bound calculations.
- Retain screenshots for default, lens, transfer, and model-sheet states at every target viewport.
- Fail on true panel intersections, viewport escape, console errors, page errors, or physical values changing when only lens magnification changes.

## Second-pass exit criteria

The refinement is complete only when all of the following are true:

1. `npm run build` succeeds on Vercel with type checking.
2. The final production deployment is `READY`, aliased to `globexplore.vercel.app`, and `/` returns HTTP 200.
3. Vercel production runtime logs contain no application `error` or `fatal` entries after the verification requests.
4. Natural Earth coastlines are visible and scenario markers remain geographically aligned.
5. At `1440 × 900` and `1280 × 800`, the metrics panel, Axis Lens, and control dock do not intersect.
6. At `393 × 852` and `375 × 667`, the lens is closed on first load and the globe, primary metric, lens trigger, and controls remain usable.
7. Opening the lens on mobile produces a deliberate inspection state rather than a partially obscuring floating card.
8. The default mobile camera shows enough of Earth to recognize the globe rather than only a local curved surface.
9. The benchmark context clearly distinguishes rigid-model output from published and observed comparison values.
10. The Asia preset remains non-zero and sub-millimetre; lens magnification changes do not alter the reported result.
11. Add-mass, move-mass, orbit, zoom, globe placement, reset, model information, and lens controls all remain operational.
12. The corrected production browser audit passes all four viewport profiles with no console or page errors.
13. The final commit on `main` is the commit deployed at the production alias.
