# GlobExplore — Interactive Earth Rotation Lab

**Status:** Product and implementation plan  
**Plan date:** 27 August 2026  
**Repository:** `JJCAPPE/globexplore`  
**Target deployment:** Vercel, production branch `main`

## 1. Product statement

GlobExplore is a full-screen interactive 3D laboratory for exploring how moving or adding mass on and near Earth changes its inertia tensor, principal figure axis, instantaneous rotation vector, center of mass, and length of day.

The core interaction is direct and spatial:

1. Choose a scientifically sourced preset or create a custom mass scenario.
2. Place or drag mass directly on the globe.
3. Watch the original and perturbed axes update continuously.
4. Open the **Axis Lens** to magnify changes that are physically real but too small to see at globe scale.
5. Compare exact numerical results with familiar real-world events and observed polar motion.

The visual direction is modern, restrained, and scientific: one dominant 3D object, minimal interface chrome, precise typography, limited color, and motion that explains state changes rather than decorating them.

### Primary promise

> Move mass. Inspect how the planet responds.

### Launch audience

- Curious general users who need intuitive scale comparisons.
- Physics, engineering, geophysics, and astronomy students.
- Educators demonstrating inertia, angular momentum, polar motion, and length-of-day changes.
- Technical users who want the formulas, assumptions, source data, and reproducible numerical outputs.

## 2. Non-negotiable product principles

1. **Scientific honesty over visual spectacle.** Every exaggerated visual must display its magnification factor. Numerical outputs must remain unexaggerated.
2. **Direct manipulation first.** The user should drag locations on Earth, not only type latitude and longitude into a form.
3. **One clear focal point.** The globe is the interface. Panels should support it rather than compete with it.
4. **Distinguish added mass from redistributed mass.** Moving existing water or rock is physically different from adding external mass.
5. **Distinguish the figure axis, spin vector, geographic axis, and angular-momentum direction.** The UI must not present them as interchangeable.
6. **Static-first and client-computed.** The initial application should require no database, account, or secret and should deploy cleanly on Vercel.
7. **Mobile is a first-class target.** Pinch, drag, bottom sheets, safe areas, thermal load, and high-DPI rendering must be designed explicitly.
8. **No false precision.** Results below the verified numerical floor should be reported as a bound rather than as a long sequence of unstable digits.

## 3. Scope

### 3.1 Version 1 must include

- Interactive 3D Earth with orbit, pinch, dolly, and programmatic camera transitions.
- Geographic, original figure, perturbed figure, angular-momentum, and instantaneous spin-vector overlays.
- Custom point-mass mode.
- Custom source-to-destination mass-transfer mode.
- Logarithmic mass control with human-readable units.
- Latitude/longitude placement by clicking or dragging on Earth.
- Exact result panel for:
  - mass as a fraction and percentage of Earth;
  - center-of-mass displacement;
  - principal figure-axis tilt;
  - equivalent surface pole displacement;
  - instantaneous spin-vector misalignment;
  - equilibrium length-of-day change;
  - direction/azimuth of the pole displacement.
- **Axis Lens** with actual-scale, logarithmic manual magnification, and auto-fit modes.
- Preset scenario library with source and model-quality labels.
- Shareable URL state.
- Reduced-motion mode.
- WebGL-unavailable fallback with a 2D diagram and all numerical outputs.
- Automated unit, interaction, accessibility, and visual-regression tests.
- GitHub-to-Vercel preview and production deployment workflow.

### 3.2 Strong launch presets

Each preset must declare whether it is produced by the internal rigid-Earth model or shown as a published calibrated benchmark.

| Preset | Scenario type | Launch purpose |
|---|---|---|
| Population of Asia as one point mass | Hypothetical external mass | Reproduce the question that motivated the project; show an approximately sub-millimetre pole-scale effect and the importance of latitude. |
| Mass moved around Earth | User-controlled surface transfer | Demonstrate conservation of total mass and source/destination cancellation. |
| Three Gorges reservoir fill | Simplified water transfer plus published benchmark | Compare the simple model with NASA’s cited approximately `0.06 µs` length-of-day estimate for `40 km³` of water. |
| Greenland annual ice loss | Simplified ice-to-ocean transfer | Show how polar-to-ocean redistribution affects both axis and length of day. |
| Antarctica annual ice loss | Simplified ice-to-ocean transfer | Complement Greenland and expose latitude/longitude dependence. |
| 2011 Tōhoku earthquake | Published calibrated event | Show that internal three-dimensional deformation cannot be represented faithfully as a surface point mass; display NASA/JPL’s approximate `17 cm` figure-axis shift and `−1.8 µs` day change. |
| Observed polar motion, 1900–2023 | Observed reference series | Put microscopic custom scenarios beside the approximately `10 m` historical migration of the spin-axis position reported by NASA/JPL. |

### 3.3 Explicit non-goals for version 1

- A full elastic, ocean-loading, atmosphere, mantle, and core Earth-system solver.
- A claim that the mass of a population is newly added to Earth.
- Real-time prediction of Earth orientation.
- Mandatory WebGPU.
- Photorealistic satellite imagery at every zoom level.
- A generic map application with dozens of unrelated layers.
- User accounts, saved cloud workspaces, social feeds, or a database.
- Simulating orbital obliquity changes from internal mass redistribution.

## 4. Scientific contract

### 4.1 Terminology shown in the UI

- **Geographic axis:** the fixed north–south reference axis of the initial Earth model.
- **Figure axis:** the principal axis corresponding to the largest principal moment of inertia.
- **Spin vector:** the instantaneous angular-velocity vector.
- **Angular momentum:** conserved in the no-external-torque model; its inertial-space direction does not change merely because mass moves internally.
- **Polar motion:** movement of the rotation axis relative to Earth’s crust/reference frame.
- **Axis tilt in this application:** a body-frame misalignment caused by the selected mass distribution, not a change in Earth’s approximately `23.4°` orbital obliquity.

Every result card and tooltip must use these terms consistently.

### 4.2 Coordinate system

Use a right-handed Earth-fixed Cartesian frame:

- `+x`: latitude `0°`, longitude `0°`;
- `+y`: latitude `0°`, longitude `90° E`;
- `+z`: geographic North Pole.

Version 1 can use a spherical surface for interaction and visualization. The physics module should isolate the geodetic-to-geocentric conversion so a WGS84 ellipsoid can replace the sphere without changing the application API.

### 4.3 Baseline Earth model

Use a dimensionless, axisymmetric baseline inertia model:

```text
I₀ = diag(A, A, C)
C − A = J₂ M a²
```

where:

- `M` is Earth’s mass;
- `a` is the reference equatorial radius;
- `J₂` is Earth’s dynamical form factor;
- `A` and `C` are equatorial and polar principal moments.

Store constants in a versioned `earth-constants.ts` file with source, units, significant figures, and retrieval date.

### 4.4 Point-mass inertia contribution

For a mass `m` at Earth-fixed position vector `r`, add:

```text
ΔI = m[(r · r)I₃ − r rᵀ]
```

For a source-to-destination transfer, subtract the source contribution and add the destination contribution:

```text
ΔItransfer = ΔIdestination − ΔIsource
```

A negative mass is never presented as physical matter; it is only an internal bookkeeping representation of removed mass.

### 4.5 Center-of-mass correction

The exact implementation must not silently keep the origin fixed after adding or moving mass.

For signed mass elements `sᵢmᵢ`, where `sᵢ ∈ {−1,+1}`:

```text
ΔM = Σ sᵢmᵢ
c = [Σ sᵢmᵢrᵢ] / [M + ΔM]
Iorigin = I₀ + Σ sᵢmᵢ[(rᵢ · rᵢ)I₃ − rᵢrᵢᵀ]
Icom = Iorigin − (M + ΔM)[(c · c)I₃ − ccᵀ]
```

Expose `|c|` as the modeled center-of-mass displacement.

### 4.6 Principal axis and pole displacement

Compute the eigenpairs of the symmetric inertia tensor. The normalized eigenvector corresponding to the largest eigenvalue is the new figure axis `eC`.

```text
θfigure = acos(clamp(ẑ · eC, −1, 1))
dpole ≈ R θfigure
```

Choose the sign of `eC` deterministically so that `eC · ẑ ≥ 0`; this prevents the displayed axis from flipping by `180°` when values change slightly.

### 4.7 Angular momentum and rotation period

Start from:

```text
L₀ = I₀ ω₀
```

with `ω₀` aligned with `+z`.

For the immediate no-external-torque response:

```text
ωinstant = Icom⁻¹ L₀
```

Show the misalignment between `ωinstant` and the original geographic axis separately from the figure-axis tilt.

For a damped equilibrium rotation-period estimate, use the largest new principal moment `C′`:

```text
Teq = 2π C′ / |L₀|
ΔLOD = Teq − T₀
```

The interface must describe this as a rigid-Earth equilibrium estimate, not a complete Earth-system prediction.

### 4.8 Numerical stability strategy

Directly adding a small perturbation of order `10²⁵ kg·m²` to a baseline moment of order `10³⁸ kg·m²` is avoidable and can reduce numerical quality.

Implement the eigensystem in normalized units:

- positions normalized by reference radius;
- masses normalized by Earth mass;
- inertia normalized by `M a²`;
- subtract the common isotropic baseline component when solving only for eigenvectors;
- use the reduced baseline shape tensor `diag(0, 0, J₂)` plus normalized perturbations.

Use a deterministic symmetric `3×3` Jacobi eigensolver or a similarly auditable implementation. Do not add a large general-purpose math package solely for this operation.

### 4.9 Numerical output floor

The implementation must establish a verified numerical floor through tests. Below that floor, display results such as:

```text
< 0.001 µm at the surface
```

rather than unsupported digits. Unit formatting must adapt across:

- `µm`, `mm`, `cm`, `m`, `km`;
- `ns`, `µs`, `ms`, `s`;
- `rad`, `°`, `arcsec`, `µas`;
- `kg`, metric tonnes, megatonnes, gigatonnes, and Earth-mass fraction.

### 4.10 Model-quality badges

Every preset must display one of four badges:

1. **Rigid model** — calculated directly from the internal inertia model.
2. **Simplified transfer** — uses an explicit source and destination approximation.
3. **Published benchmark** — displays an externally published result that the internal surface model does not claim to reproduce.
4. **Observed data** — directly plots an Earth-orientation time series.

The details sheet must list assumptions, source, date range, and uncertainty/limitations.

## 5. Experience architecture

## 5.1 Full-screen laboratory layout

### Desktop

- **Top left:** wordmark, short mode label, and compact information button.
- **Top center:** current scenario name and model-quality badge.
- **Top right:** reset, share, reduced-motion/quality menu, and help.
- **Center:** uninterrupted globe canvas.
- **Bottom center:** compact scenario dock that expands horizontally.
- **Right:** results inspector, initially collapsed to a narrow metric rail; expands over the canvas without resizing it.
- **Lower left:** axis legend with line style and current visual magnification.
- **Upper/lower pole region:** Axis Lens trigger positioned in screen space without covering the actual axis endpoint.

### Mobile portrait

- Globe occupies the upper `58–68%` of the visual viewport.
- Scenario selection becomes a horizontal snap rail above the bottom safe area.
- Results and controls use one draggable bottom sheet with `peek`, `half`, and `full` stops.
- Axis Lens becomes a full-width, top-anchored inset or a temporary full-screen inspection mode rather than a small unreadable circle.
- No critical control may sit behind browser chrome or the home indicator.

### Tablet and landscape mobile

- Use a two-pane composition only when at least `720 CSS px` of width is available.
- In short landscape viewports, keep the globe full-screen and use compact side drawers.

## 5.2 Core interaction modes

### A. Add mass

- User selects mass with a logarithmic slider or direct input.
- User clicks Earth to place a marker.
- Marker is draggable along the sphere.
- Optional altitude control is available in an advanced section.
- UI clearly states that this is external added mass.

### B. Move mass

- User places a source marker and destination marker.
- A geodesic transfer arc connects them.
- The source uses a subtractive visual treatment; destination uses the active accent.
- Total mass remains constant.
- If source and destination coincide, every computed change must return exactly to zero within tolerance.

### C. Distributed load

- User chooses point, circular cap, or broad region.
- A spread-radius control changes a deterministic equal-area sample distribution.
- Distribution points are rendered as an instanced mesh or aggregated heat field, not hundreds of React components.

### D. Preset

- Selecting a preset animates the camera to the relevant region and transitions the old mass field into the new one.
- The user can immediately “edit as custom” without losing provenance information.

## 5.3 Axis Lens

The Axis Lens is the defining feature and must be treated as a first-class viewport, not a cosmetic magnifying-glass effect.

### Rendering model

- Use one WebGL canvas and two synchronized camera views/scissor regions.
- Main view: perspective globe camera.
- Lens view: orthographic or very-low-perspective camera centered on the north-pole tangent plane.
- Reuse the same source-of-truth axis objects and transform data in both views.
- Avoid two independent WebGL contexts on mobile.

### Lens contents

- Geographic pole at the origin.
- Original figure-axis intersection.
- New figure-axis intersection.
- Instantaneous spin-vector intersection.
- Angular-momentum direction.
- Concentric metric rings and a scale bar.
- Direction/azimuth arrow.
- Optional observed IERS polar-motion track for comparison.
- Explicit badge: `VISUAL MAGNIFICATION ×10ⁿ`.

### Lens controls

- **1×:** no visual exaggeration; usually demonstrates that the change is invisible.
- **Auto-fit:** chooses a magnification that places the largest displacement at approximately `30–40%` of the lens radius.
- **Manual:** logarithmic range, initially `1×` to `10¹⁵×`, constrained by verified numerical precision.
- **Lock scale:** compare several scenarios without the lens rescaling between them.
- **Follow:** lens remains attached to the pole while the main globe rotates.
- **Detach:** lens expands into a fixed inspection panel.

### Required trust behavior

- The exact values never change when magnification changes.
- The main globe and lens both display whether geometry is actual or exaggerated.
- Auto-fit must never silently alter the result.
- At `1×`, coincident points are allowed to look coincident; add a text statement rather than forcing visible separation.

## 5.4 Results inspector

Show four primary results by default:

1. Pole displacement.
2. Figure-axis angle.
3. Length-of-day change.
4. Mass fraction of Earth.

Secondary expandable results:

- center-of-mass displacement;
- instantaneous spin-vector angle;
- azimuth/direction;
- principal moments before/after;
- normalized inertia perturbation;
- source/destination coordinates;
- calculation mode and assumptions.

Use Geist Mono and tabular numerals for live measurements. Animate displayed values using Motion values without forcing React rerenders on every animation frame. Final text must snap exactly to the computed value.

## 5.5 Explain mode

A concise “How this is calculated” sheet should contain:

- a visual inertia-tensor diagram;
- the active scenario’s mass elements;
- equations used;
- the difference between added and moved mass;
- the difference between figure axis and spin vector;
- limitations of the rigid-Earth approximation;
- direct source citations.

Avoid a separate long textbook page in the primary flow. A dedicated `/method` route can provide the full derivation and source register.

## 5.6 Shareable state

Encode the complete reproducible scenario in the URL:

- mode;
- mass and unit-normalized value;
- source/destination latitude, longitude, altitude, and spread;
- selected preset and model version;
- lens scale and lock state;
- visible vector overlays;
- camera target and approximate distance only when useful.

Use a versioned compact schema. Invalid or old URLs must fall back safely and report that unsupported fields were ignored.

## 6. Visual design system

### 6.1 Direction

- Near-black/charcoal background.
- Matte Earth rather than glossy photorealism.
- Desaturated land and ocean separation.
- Thin geographic grid that fades with camera distance.
- One restrained active accent plus neutral baseline and warning colors.
- Lines differentiated by dash, width, label, and endpoint shape—not color alone.
- Subtle atmosphere/Fresnel edge for depth.
- No heavy bloom, lens flare, starfield clutter, glass-card grid, or permanent large dashboard.

### 6.2 Typography

- Geist Sans for interface and explanatory copy.
- Geist Mono for measurements, coordinates, units, and scale factors.
- Tight display tracking, restrained weights, and strong hierarchy.
- Minimum primary control text: `14 CSS px`.
- Long explanatory text: `15–17 CSS px`, approximately `1.5–1.65` line-height.

### 6.3 Spatial hierarchy

At initial load, the user should perceive in this order:

1. Earth.
2. Original and perturbed axes.
3. Active mass location or transfer.
4. One primary result.
5. Scenario controls.
6. Secondary scientific detail.

### 6.4 Motion language

Use two coordinated systems:

- **Motion for React** for DOM panels, shared-layout transitions, live numerical interpolation, sheets, tooltips, and gesture feedback.
- **React Three Fiber frame updates with `maath`-style damping and Drei camera controls** for camera, globe, axis, marker, and lens transitions.

Do not run competing animation libraries on the same property. GSAP or Theatre.js should not be a baseline dependency; add an authoring/timeline tool only if a later narrative sequence cannot be expressed cleanly with the chosen systems.

### 6.5 Animation behavior

- Camera flights: damped, interruptible, normally `450–900 ms` perceived duration.
- Axis updates: continuous while dragging, with critically damped visual interpolation and no overshoot that suggests false values.
- Marker placement: short radial ripple and scale settle.
- Mass transfer: restrained geodesic flow particles or a moving highlight along the arc.
- Lens opening: shared-origin expansion from the pole marker.
- Scenario change: old load fades before the new load resolves; numerical output transitions concurrently.
- Idle auto-rotation: optional, very slow, stops after interaction, disabled under reduced motion.
- Reduced motion: no auto-rotation, no camera fly-through, immediate panel transitions, short opacity changes only.

## 7. Technical architecture

## 7.1 Recommended stack

| Layer | Choice | Reason |
|---|---|---|
| Application | Next.js App Router + TypeScript | Vercel-native deployment, static/server shell, metadata, route organization, React 19 compatibility. |
| 3D renderer | Three.js via `@react-three/fiber` | Declarative scene graph, React integration, current R3F v9/React 19 pairing. |
| 3D helpers | `@react-three/drei` | Camera controls, line helpers, view/scissor utilities, HTML labels, environment abstractions. |
| DOM animation | `motion` / `motion/react` | Interruptible React-native layout, gesture, spring, and live-value animation. |
| 3D damping | `maath` or small local damping utilities | Smooth frame-rate-independent interpolation without a second general timeline engine. |
| State | Zustand with selector-based subscriptions | High-frequency scene state without broad React rerenders. |
| Schemas | Zod | Scenario and URL-state validation. |
| Styling | Tailwind CSS plus CSS custom-property tokens | Fast responsive composition with a small, explicit design system. |
| Unit tests | Vitest | Fast TypeScript math and state testing. |
| Property tests | `fast-check` where useful | Invariance and cancellation testing for physics functions. |
| E2E/visual | Playwright | Pointer/touch interaction, screenshots, browser console, viewport matrix. |
| Accessibility | axe-core integration plus manual keyboard/VoiceOver pass | Automated and real-device coverage. |
| Monitoring | Vercel Speed Insights; Web Analytics optional | Production Core Web Vitals and usage without adding application infrastructure. |

Pin exact stable versions in the lockfile at implementation time. Keep React, R3F, and Three.js compatibility explicit in `package.json` and automated builds.

## 7.2 Renderer decision

Start with Three.js `WebGLRenderer`/WebGL 2 for version 1. Three.js currently describes `WebGPURenderer` as a next-generation option with WebGL 2 fallback, but also states that it remains experimental and that `WebGLRenderer` remains the recommended choice for pure WebGL 2 applications.

Create a renderer abstraction and a development feature flag so WebGPU can be evaluated later without making launch dependent on it.

## 7.3 Rendering strategy

- Client-only 3D scene loaded with a dynamic boundary from the App Router shell.
- Server-render the title, accessible summary, metadata, fallback, and initial control skeleton.
- One canvas for the globe and Axis Lens.
- Use `frameloop="demand"` where possible; invalidate only during interactions, transitions, and brief idle motion.
- Cap device pixel ratio dynamically rather than rendering at an iPhone’s full `3×` DPR.
- Use instancing for distributed mass samples.
- Reuse geometries, materials, vectors, and typed arrays.
- Avoid React state changes inside `useFrame`.
- Dispose generated geometries/materials deterministically.
- Keep post-processing off by default; add only an antialiasing solution that passes mobile performance testing.

## 7.4 Proposed repository structure

```text
src/
  app/
    layout.tsx
    page.tsx
    method/page.tsx
    globals.css
  components/
    lab/
      rotation-lab.tsx
      scenario-dock.tsx
      results-inspector.tsx
      controls-sheet.tsx
      axis-legend.tsx
    scene/
      earth-scene.tsx
      earth-globe.tsx
      axis-system.tsx
      axis-lens.tsx
      mass-markers.tsx
      transfer-arc.tsx
      camera-rig.tsx
      scene-labels.tsx
    ui/
      metric.tsx
      logarithmic-slider.tsx
      sheet.tsx
      tooltip.tsx
  lib/
    physics/
      constants.ts
      coordinates.ts
      inertia.ts
      eigen-symmetric-3x3.ts
      rotation-response.ts
      distributions.ts
      types.ts
    scenarios/
      schema.ts
      presets.ts
      citations.ts
    format/
      units.ts
      precision.ts
    url-state/
      schema.ts
      encode.ts
      decode.ts
  store/
    lab-store.ts
    selectors.ts
  workers/
    distribution.worker.ts
public/
  data/
    coastlines-110m.json
    coastlines-50m.json
    observed-polar-motion.json
  textures/
tests/
  unit/
  properties/
  e2e/
  visual/
docs/
  visual-review/
  scientific-validation/
```

## 7.5 State separation

Separate state into four domains:

1. **Scientific state:** mass elements, scenario kind, constants/model version, computed response.
2. **Scene state:** camera, hover, selected marker, quality level, active vectors.
3. **Presentation state:** open sheet, active metric, lens mode/magnification.
4. **Serializable state:** only the subset required to reproduce and share a scenario.

Computed physics output must be derived from immutable scenario input and never from animated display values.

## 7.6 Data and asset strategy

- Convert Natural Earth-style coastline data at build time to a compact project-owned representation with attribution.
- Use a low-detail dataset on mobile and a higher-detail dataset after idle/loading on desktop.
- Keep NASA imagery optional; a procedural/vector globe better matches the minimal visual direction and reduces texture payload.
- Store preset citations and model metadata beside each scenario, not embedded in UI components.
- Store an observed IERS data snapshot in the repository for deterministic builds. A later scheduled update can refresh it after data licensing, parsing, and failure behavior are validated.

## 8. Performance, responsiveness, and accessibility budgets

### 8.1 Runtime targets

- Desktop interaction: median at or near `60 fps`; p95 frame time below `20 ms` on a current laptop.
- Supported iPhone interaction: sustained usable performance with p95 frame time below `28 ms`; no thermal runaway during a five-minute interaction session.
- No more than approximately `100` draw calls in the normal scene.
- Keep normal scene geometry below approximately `150k` rendered triangles unless measurements prove additional detail is harmless.
- Idle canvas should stop rendering when nothing moves.
- Mobile DPR should normally remain in the `1.0–1.5` range.
- No unbounded allocations during drag or animation.
- Production targets: LCP `< 2.5 s`, INP `< 200 ms`, CLS `< 0.05` at p75 where sufficient traffic exists.

These are acceptance targets, not promises independent of device/network. Measure on production and adjust visual complexity before relaxing targets.

### 8.2 Responsive requirements

- Validate at `320×568`, `375×667`, `390×844`, `393×852`, `430×932`, `844×390`, `834×1194`, `1280×800`, `1440×900`, and `1512×982` CSS pixels.
- No horizontal document scrolling.
- No control smaller than `44×44 CSS px` on touch layouts.
- Pinch-to-zoom the globe without triggering browser page zoom under normal gestures.
- Keyboard and mouse remain fully usable on desktop.
- Results remain readable while the software keyboard is open for direct numeric input.
- Respect `env(safe-area-inset-*)`.

### 8.3 Accessibility requirements

- Every canvas interaction has an equivalent numeric control path.
- Canvas has a concise text alternative describing the current scenario and results.
- Keyboard users can select and nudge source/destination latitude and longitude.
- Screen-reader result announcements occur after committed changes or at a throttled interval, not every pointer frame.
- Axis identity is conveyed by labels and line patterns, not only color.
- Contrast meets WCAG AA for text and controls.
- Focus is always visible.
- Sheets/dialogs manage focus correctly and do not trap users after closing.
- Reduced-motion setting is respected automatically and can also be overridden within the app.
- A WebGL failure yields a complete 2D/numeric experience rather than an empty canvas.

## 9. Implementation phases and exit gates

No phase is complete merely because code compiles. Each phase must satisfy its functional, scientific, visual, responsive, and performance exit criteria on a Vercel preview.

## Phase 0 — Bootstrap and deployment loop

### Work

- Initialize Next.js App Router, TypeScript, Tailwind, ESLint, Vitest, Playwright, and pnpm.
- Add Geist Sans/Mono.
- Add baseline metadata, favicon, static accessible shell, error boundary, and WebGL fallback shell.
- Connect the repository to a Vercel project named `globexplore` with production branch `main`.
- Configure PR preview deployments.
- Add CI commands: lint, typecheck, unit test, build, Playwright smoke.
- Add a development-only diagnostics overlay switch.

### Exit criteria

- [ ] Fresh clone installs and builds using the documented Node and pnpm versions.
- [ ] `main` produces a public production deployment.
- [ ] A pull request produces an isolated Vercel preview URL.
- [ ] CI fails on lint, type, test, or build errors.
- [ ] Home route renders meaningful server HTML before the 3D chunk loads.
- [ ] Loading and error states use the final typography and spacing system.
- [ ] Desktop and mobile preview screenshots show no unstyled flash, viewport jump, or safe-area collision.
- [ ] Browser console is clean on Chrome and Safari.
- [ ] WebGL-disabled test shows the fallback rather than a blank screen.

### Required visual captures

- `1440×900` initial shell and loaded state.
- `390×844` initial shell and loaded state.
- WebGL fallback at both sizes.

## Phase 1 — Scientific kernel

### Work

- Implement coordinates, normalized inertia accumulation, center-of-mass correction, symmetric eigensolver, angular-momentum response, period estimate, and adaptive unit formatting.
- Add exact scenario types: external add, source/destination transfer, distributed transfer, calibrated benchmark, observed series.
- Add deterministic model versioning.
- Add development reference-output page or test report.

### Exit criteria

- [ ] Zero mass returns exact zero within defined tolerance.
- [ ] Source equal to destination returns exact zero within defined tolerance.
- [ ] A point mass at the equator or pole produces zero first-order figure-axis tilt in the axisymmetric model.
- [ ] A small point mass produces maximum tilt near `±45°` latitude.
- [ ] Rotating longitude rotates the displacement direction without changing its magnitude.
- [ ] Doubling a sufficiently small perturbing mass doubles the first-order response within tolerance.
- [ ] Symmetric opposing loads cancel the expected off-diagonal response.
- [ ] Eigenvector orientation is stable and never flips sign during a continuous drag.
- [ ] Normalized solver agrees with the analytic small-mass formula for multiple latitudes and longitudes.
- [ ] Numerical outputs remain stable across at least six orders of magnitude around the launch scenarios.
- [ ] Unsupported tiny values render as bounded values rather than false digits.
- [ ] Every preset validates against the Zod schema and has a citation/model-quality badge.

### Scientific acceptance references

- Asia point-mass scale should reproduce the expected order of magnitude from the analytic formula.
- Three Gorges calibrated card should preserve NASA/JPL’s published `40 km³` and approximately `0.06 µs` comparison.
- Tōhoku calibrated card should preserve NASA/JPL’s approximate `17 cm` figure-axis and `−1.8 µs` values without claiming that the surface model generates them.

## Phase 2 — Core 3D globe and direct manipulation

### Work

- Build the single-canvas R3F scene.
- Add globe, atmosphere edge, vector coastlines, grid, lighting, and camera rig.
- Add geographic/original axis and draggable point marker.
- Raycast pointer/touch positions to the sphere and convert to coordinates.
- Connect drag to the scientific kernel without unnecessary React rerenders.
- Add desktop inspector and mobile bottom-sheet skeleton.

### Exit criteria

- [ ] Earth is the dominant object at every target viewport.
- [ ] Globe drag, wheel/dolly, and pinch feel direct and do not fight marker drag.
- [ ] Marker remains constrained to the surface and does not jump at the longitude seam or poles.
- [ ] Latitude/longitude update continuously and settle to the same value shown in numeric inputs.
- [ ] Axis result updates continuously while dragging with no visible sign flips or discontinuities.
- [ ] Labels remain legible over land, ocean, and the dark background.
- [ ] Coastline detail does not shimmer excessively while zooming.
- [ ] No axis line disappears due to depth ordering at common angles.
- [ ] Earth occupies approximately `55–72%` of the desktop viewport height and `45–65%` of mobile viewport height in the default composition.
- [ ] Primary marker and axis endpoints remain unobscured by panels in all target viewports.
- [ ] Interaction maintains the phase performance budget on desktop and a representative iPhone.
- [ ] A five-minute drag/orbit session shows no material memory growth.

### Required visual captures

- Front, oblique, equatorial, and north-pole camera angles.
- Marker at equator, `45°`, and pole.
- Inspector closed/open.
- Mobile sheet at peek/half/full positions.

## Phase 3 — Axis Lens

### Work

- Add second scissored camera view using the same scene data.
- Add pole tangent plane, concentric rings, vector intersections, scale bar, auto-fit, actual scale, manual logarithmic scale, lock, follow, and detach.
- Add shared-origin open/close transition.
- Add explicit actual-versus-exaggerated labeling.

### Exit criteria

- [ ] `1×` mode renders geometrically honest overlap even when the difference is imperceptible.
- [ ] Auto-fit chooses a deterministic scale and displays that scale before or at the moment the geometry moves.
- [ ] Changing magnification never changes any numerical result.
- [ ] Lens points correspond exactly to the axis vectors used in the main scene.
- [ ] Scale bar and concentric rings remain correct through the full manual range.
- [ ] Locking the scale preserves visual comparison across presets.
- [ ] Lens never clips labels or axes at its intended working range.
- [ ] Lens remains crisp without rendering a second high-DPI WebGL context.
- [ ] Opening/closing is interruptible and does not produce a flash, blank region, or layout shift.
- [ ] Desktop lens is readable at approximately `260–340 CSS px` diameter/width.
- [ ] Mobile lens inspection remains readable without reducing controls below touch minimums.
- [ ] Reduced-motion mode opens the lens without camera flight or scale animation.
- [ ] At the Asia launch scenario, auto-fit makes the sub-millimetre pole-scale effect visible while clearly showing the large visual magnification.

### Required visual captures

- `1×`, auto-fit, and locked manual scale.
- Lens attached and detached.
- Baseline versus at least three presets at one locked scale.
- Mobile portrait and landscape.

## Phase 4 — Transfer mode, distributions, presets, and comparison

### Work

- Add source/destination markers and geodesic transfer visualization.
- Add circular-cap distribution with deterministic sampling and instanced rendering.
- Add preset dock, citations, edit-as-custom, compare/pin, and observed-reference overlay.
- Add URL serialization and copy-share behavior.

### Exit criteria

- [ ] Source and destination are visually distinct without relying only on color.
- [ ] Dragging either endpoint updates the transfer result and arc correctly.
- [ ] Reversing source/destination reverses the expected signed effects.
- [ ] Increasing distribution spread converges smoothly without visible sample popping.
- [ ] Preset transitions never briefly show a mixture that is interpreted as a valid result; transition states are labeled or computation switches atomically.
- [ ] Every launch preset displays its model-quality badge, source, assumptions, and last-reviewed date.
- [ ] Published benchmarks are visually separated from internally calculated outputs.
- [ ] Compare mode uses a locked scale by default or explicitly warns when scales differ.
- [ ] Pinned scenarios remain distinguishable in the lens and results list.
- [ ] Shared URL reproduces scenario values, overlays, and lens state in a new session.
- [ ] Malformed URL input cannot crash the page or create non-finite physics values.
- [ ] Scenario rail remains usable with touch, keyboard, and screen reader.

## Phase 5 — Motion and visual refinement

### Work

- Apply final motion choreography, number interpolation, panel transitions, marker feedback, camera presets, label collision handling, and subtle mass-transfer flow.
- Finalize palette, line styles, typography scale, spacing, and responsive compositions.
- Remove temporary diagnostics and generic component defaults.

### Exit criteria

- [ ] No animation exists without communicating selection, causality, scale, hierarchy, or continuity.
- [ ] Camera and UI transitions are interruptible; rapid scenario changes do not queue stale animations.
- [ ] Axis geometry tracks the true result and never overshoots in a way that implies a false peak value.
- [ ] Numeric animation lands exactly on the computed value and unit.
- [ ] Main view remains visually calm with all secondary panels closed.
- [ ] At least one primary interaction is obvious within five seconds without a tutorial.
- [ ] All text remains readable against every globe orientation.
- [ ] No more than one high-emphasis accent appears in a normal state.
- [ ] Blur, transparency, and shadows do not degrade Safari performance or contrast.
- [ ] Pointer hover states have equivalent focus and touch states.
- [ ] Reduced-motion experience feels complete rather than broken or abrupt.

## Phase 6 — Responsive, accessibility, and performance hardening

### Work

- Complete viewport matrix, real-device testing, keyboard behavior, VoiceOver pass, axe audit, dynamic DPR, adaptive quality, code splitting, and asset optimization.
- Add performance instrumentation and production Speed Insights.

### Exit criteria

- [ ] Every target viewport passes the screenshot matrix with no overlap, clipping, horizontal scroll, or inaccessible control.
- [ ] iOS Safari portrait and landscape pass marker drag, globe pinch, lens controls, bottom sheet, share, and numeric entry.
- [ ] Chrome/Edge desktop pass mouse, trackpad, wheel, keyboard, and resize testing.
- [ ] Keyboard-only users can create and modify a full scenario.
- [ ] VoiceOver announces scenario, focused controls, and committed result changes coherently.
- [ ] Axe reports no serious or critical violations.
- [ ] `prefers-reduced-motion` removes nonessential movement.
- [ ] DPR and quality reduce during expensive interaction and recover without an obvious resolution flash.
- [ ] Normal scene meets draw-call, triangle, frame-time, memory, and Core Web Vitals targets or documents a justified measured exception.
- [ ] Initial route does not block on high-detail globe assets.
- [ ] WebGL context loss is handled with a clear recovery/fallback state.

## Phase 7 — Scientific review and production launch

### Work

- Run final cross-checks, source review, citation audit, model-limit review, production deployment, and rollback rehearsal.
- Freeze a model version and produce a reproducible validation report.

### Exit criteria

- [ ] Every factual preset value is traceable to a primary source or explicitly labeled as an assumption.
- [ ] Every source URL resolves and supports the exact claim attached to it.
- [ ] No calibrated event is presented as an output of the simplified surface model.
- [ ] Formula implementation is independently reviewed against the written method.
- [ ] Validation report includes analytic tests, preset outputs, tolerances, and model version.
- [ ] Production build has no console errors, failed requests, hydration warnings, or accessibility overlay errors.
- [ ] Production URL is tested after deployment, not only the preview.
- [ ] Rollback to the prior production deployment has been rehearsed or documented.
- [ ] README, `/method`, source register, and in-app explanations agree.
- [ ] All P0/P1 visual issues are closed; accepted P2 issues are documented with rationale.

## Phase 8 — Optional observed-data extension

This phase is not required for initial launch.

- Add a maintained IERS EOP ingestion script.
- Plot recent `x/y` polar motion and LOD alongside modeled scenarios.
- Add date range scrubber and observed-versus-modeled scale comparison.
- Keep the checked-in last-known-good dataset if ingestion fails.
- Never make the core lab dependent on a live external endpoint.

Exit only when parser fixtures, provenance, update failure behavior, and date labeling are fully tested.

## 10. Visual iteration and acceptance protocol

The visual review process is part of implementation, not a final polish step.

### 10.1 Preview loop for every meaningful UI change

1. Push the feature branch and obtain the Vercel preview.
2. Open the preview at the defined desktop, tablet, mobile portrait, and mobile landscape sizes.
3. Wait for network idle, then check the browser console and framework error overlay.
4. Capture the exact state being changed plus one adjacent state.
5. Exercise the interaction at normal speed and with rapid reversal/interruption.
6. Check reduced-motion behavior.
7. Compare against the previous accepted screenshot.
8. Record the issue, decision, screenshot, and result in `docs/visual-review/<date>-<feature>.md`.
9. Repeat until all phase exit criteria pass.

### 10.2 Mandatory screenshot state matrix

| State | Desktop | Tablet | Mobile portrait | Mobile landscape |
|---|---:|---:|---:|---:|
| Initial load/shell | Required | Optional | Required | Optional |
| Default Asia scenario | Required | Required | Required | Required |
| Custom point mass at `45°` | Required | Optional | Required | Optional |
| Source-to-destination transfer | Required | Required | Required | Required |
| Axis Lens `1×` | Required | Optional | Required | Optional |
| Axis Lens auto-fit | Required | Required | Required | Required |
| Lens detached/expanded | Required | Optional | Required | Required |
| Results inspector expanded | Required | Required | Required | Required |
| Scenario dock expanded | Required | Optional | Required | Optional |
| Compare mode | Required | Required | Required | Required |
| Reduced motion | Required | Optional | Required | Optional |
| WebGL fallback | Required | Optional | Required | Optional |
| Error/invalid URL state | Required | Optional | Required | Optional |

### 10.3 Visual failure conditions

A phase cannot pass if any of the following are present:

- Axis or mass marker is hidden behind interface chrome in the default camera state.
- Lens uses an unlabelled exaggeration.
- Main globe and lens imply different vector directions.
- Labels collide or become unreadable at a required viewport.
- Panels cause the globe to jump or resize unexpectedly.
- Mobile bottom sheet prevents globe interaction when at its peek state.
- Important values are truncated without an accessible full form.
- Animation queues after repeated input.
- A line or marker flickers at the sphere surface.
- The globe becomes blurry at rest or visibly changes resolution in one abrupt frame.
- The page scrolls horizontally.
- Browser controls or the iPhone home indicator cover controls.
- Color is the only distinction between axes or source/destination.
- The loaded state is materially worse than the server-rendered shell during transition.

### 10.4 Visual issue severity

- **P0:** incorrect science, missing/blank canvas, unusable primary interaction, unlabelled exaggeration, production crash.
- **P1:** overlapping primary UI, unreadable results, broken mobile gesture, severe jank, accessibility blocker, misleading animation.
- **P2:** minor spacing, secondary label collision at uncommon camera angle, nonblocking motion inconsistency.
- **P3:** optional polish or future enhancement.

No P0 or P1 issue may remain at launch.

## 11. Automated verification plan

### 11.1 Unit tests

- Coordinate conversion at cardinal points and longitude wrapping.
- Point inertia tensor symmetry.
- Center-of-mass and parallel-axis correction.
- Symmetric eigensolver against known matrices.
- Near-degenerate eigenvalue stability.
- Equator, pole, and `45°` analytic cases.
- Longitude rotational invariance.
- Linear small-perturbation scaling.
- Transfer cancellation and reversal.
- Unit formatting across every prefix boundary.
- Precision-floor behavior.
- Scenario schema and citation completeness.
- URL encode/decode round trip and version migration.

### 11.2 Property tests

- Inertia matrices remain symmetric.
- Principal eigenvectors remain normalized.
- Trace equals the sum of eigenvalues within tolerance.
- Rotating all mass elements by a common Earth-axis longitude rotation preserves scalar outputs.
- Source equals destination produces zero for randomly generated valid positions.
- Splitting one point mass into coincident submasses leaves output unchanged.
- Reordering mass elements does not change output.

### 11.3 Playwright interaction tests

- Load default scenario and read primary metrics.
- Drag point marker and verify coordinate/result changes.
- Place source and destination.
- Open lens, switch `1×`, auto-fit, manual, and locked modes.
- Select each preset and open citation details.
- Share URL and reproduce state.
- Resize through desktop/mobile breakpoints.
- Keyboard-create a scenario.
- Reduced-motion emulation.
- WebGL-disabled/failure fallback.
- Assert no page errors, console errors, failed critical requests, or Next.js overlay.

### 11.4 Visual regression

Use deterministic camera, time, DPR, and scenario state. Mask only nondeterministic analytics/toolbar regions. Do not mask the globe, axis, lens, labels, or metrics.

### 11.5 Real-device checks

At minimum:

- Current iPhone/Safari.
- One older supported iPhone/Safari.
- Mac Safari with trackpad.
- Chrome desktop.
- A lower-power integrated-GPU laptop if available.

Record actual device/OS/browser versions in each launch review.

## 12. GitHub and Vercel workflow

### Initial repository state

This plan is the first repository artifact. Implementation should proceed on branches after the Vercel project is imported.

### Branch model

- `main`: production.
- `feat/<scope>`: implementation branches.
- `fix/<scope>`: corrective branches.

Prefer small, reviewable pull requests that each create a Vercel preview. Do not combine the scientific kernel, entire 3D scene, and final visual system into one unreviewable change.

### Pull-request requirements

- Clear scope and changed behavior.
- Preview URL.
- Screenshot matrix subset relevant to the change.
- Test results.
- Scientific-output comparison for physics changes.
- Performance comparison for renderer/asset changes.
- Explicit remaining issues.

### Vercel configuration

- Project name: `globexplore`.
- Git repository: `JJCAPPE/globexplore`.
- Framework preset: Next.js.
- Production branch: `main`.
- Root directory: repository root.
- No environment variables for version 1.
- Automatic preview deployments for pull requests.
- Automatic production deployment from `main`.
- Enable Speed Insights after the first functional deployment.
- Web Analytics is optional and should not block launch.

Vercel’s Git integration provides preview deployments for branch pushes and pull requests, while changes merged to the production branch create production deployments. Use preview validation before merge and production validation after merge.

## 13. Final definition of done

GlobExplore version 1 is complete only when all of the following are true:

### Product

- [ ] A first-time user can select a preset, move mass, open the Axis Lens, and understand the main result without reading the full method page.
- [ ] A technical user can inspect formulas, assumptions, constants, sources, and model version.
- [ ] Added mass, redistributed mass, calibrated events, and observed data are never conflated.
- [ ] Share links reproduce the complete scenario.

### Scientific

- [ ] Core invariants and analytic checks pass.
- [ ] Center-of-mass correction is implemented.
- [ ] Figure axis and spin vector are computed and displayed separately.
- [ ] Magnification affects visuals only.
- [ ] Precision floor and adaptive units are validated.
- [ ] Presets have primary-source provenance and limitation text.

### Visual

- [ ] Globe remains the dominant element and the interface is visibly minimal.
- [ ] Axis Lens is clear, accurate, labelled, and usable on desktop and mobile.
- [ ] Every mandatory screenshot state is accepted.
- [ ] No P0/P1 issue remains.
- [ ] Motion is interruptible, coherent, and complete under reduced motion.

### Technical

- [ ] Lint, typecheck, unit, property, build, E2E, accessibility, and visual tests pass.
- [ ] No production console errors, hydration warnings, or failed critical resources.
- [ ] Performance and Core Web Vitals targets are met or a measured exception is documented and accepted.
- [ ] WebGL fallback works.
- [ ] Production and rollback procedures are documented.

### Deployment

- [ ] GitHub repository is connected to the Vercel `globexplore` project.
- [ ] Pull requests receive preview deployments.
- [ ] `main` deploys to production.
- [ ] Production is verified at all critical viewports after the final deployment.
- [ ] Speed Insights is collecting data.

## 14. Principal risks and mitigations

| Risk | Mitigation |
|---|---|
| Microscopic changes are visually indistinguishable | Axis Lens, auto-fit, locked comparison scale, explicit magnification label. |
| Exaggerated vectors mislead users | Actual/exaggerated state in every viewport; numeric values independent of scale; `1×` mode. |
| Simplified surface model is interpreted as full geophysics | Model-quality badges, calibrated-event separation, limitations in results and method page. |
| Floating-point cancellation corrupts tiny effects | Dimensionless reduced tensor, deterministic eigensolver, analytic and property tests, output floor. |
| 3D bundle delays first content | Server-rendered shell, dynamic canvas import, progressive assets, low-detail initial globe. |
| iPhone GPU/thermal load | One canvas, capped DPR, demand rendering, adaptive quality, limited post-processing and geometry. |
| Gesture conflicts between globe, marker, lens, and sheet | Explicit interaction priority, pointer capture, gesture-state tests, mobile device review. |
| Animation state diverges from scientific state | Physics values remain immutable source data; display values only interpolate toward them. |
| Preset sources become stale or unsupported | Versioned source register, last-reviewed dates, launch citation audit. |
| WebGPU compatibility variability | WebGL 2 launch renderer; WebGPU behind a later feature flag. |

## 15. First implementation sequence

1. Import the repository into a new Vercel project named `globexplore`.
2. Bootstrap Next.js/TypeScript/pnpm and establish preview deployment.
3. Implement and exhaustively test the normalized scientific kernel before 3D work.
4. Build a plain diagnostic page that exposes raw scenario inputs and outputs.
5. Add the globe, camera, and one point marker.
6. Connect direct manipulation to the tested kernel.
7. Add figure/geographic axes and primary metrics.
8. Implement the Axis Lens and complete its acceptance gate before adding many presets.
9. Add source/destination transfer and distributed load modes.
10. Add launch presets with citations and model-quality labels.
11. Add URL state and compare mode.
12. Apply final visual system and motion choreography.
13. Complete responsive, accessibility, and performance hardening.
14. Run the scientific/source audit and produce the validation report.
15. Merge only after preview acceptance, then repeat critical checks on production.

## 16. Source register for implementation

### Scientific and data references

- NASA/JPL, **NASA-Funded Studies Explain How Climate Is Changing Earth’s Rotation**: climate-related mass redistribution, polar motion, and length-of-day changes.  
  https://www.nasa.gov/missions/grace/nasa-funded-studies-explain-how-climate-is-changing-earths-rotation/
- NASA/JPL, **Meandering Path of Earth’s Spin Axis**: approximately `10 m` movement from 1900 to 2023 and the observed polar-motion context.  
  https://www.jpl.nasa.gov/images/pia26120-meandering-path-of-earths-spin-axis/
- NASA/JPL, **Polar Motion Simulation**: mass redistribution perturbs Earth’s inertia tensor; existing interactive reference and explicit visualization exaggeration.  
  https://vesl.jpl.nasa.gov/sea-level/polar-motion/
- NASA/JPL, **NASA Details Earthquake Effects on the Earth**: 2004 Sumatra event and Three Gorges `40 km³` / approximately `0.06 µs` comparison.  
  https://www.jpl.nasa.gov/news/nasa-details-earthquake-effects-on-the-earth/
- NASA/JPL, **Japan Quake May Have Shortened Earth Days, Moved Axis**: 2011 Tōhoku approximate `−1.8 µs` and `17 cm` benchmark.  
  https://www.jpl.nasa.gov/news/japan-quake-may-have-shortened-earth-days-moved-axis/
- NASA Sea Level, **GRACE and GRACE-FO Observations of Polar Ice Mass Loss**: Greenland and Antarctic mass-loss reference values.  
  https://sealevel.nasa.gov/resources/133/grace-and-grace-fo-observations-of-polar-ice-mass-loss/
- IERS, **Data, Products and Tools** and **Earth Orientation Centre**: Earth-orientation reference products and long-term EOP series.  
  https://www.iers.org/iers/en/dataproducts/data  
  https://www.iers.org/iers/en/organization/productcentres/earthorientationcentre/eoc

### Technical references

- Next.js App Router documentation.  
  https://nextjs.org/docs/app
- React Three Fiber repository/documentation.  
  https://github.com/pmndrs/react-three-fiber
- Three.js `WebGPURenderer` guide and WebGL renderer documentation.  
  https://threejs.org/manual/en/webgpurenderer  
  https://threejs.org/docs/pages/WebGLRenderer.html
- Motion for React documentation.  
  https://motion.dev/docs/react
- Vercel Git deployment documentation.  
  https://vercel.com/docs/git
- Vercel Speed Insights documentation.  
  https://vercel.com/docs/speed-insights

## 17. Plan-change rule

Any change that affects the scientific model, axis definitions, magnification semantics, core interaction model, renderer choice, or launch exit criteria must update this document in the same pull request as the implementation change. Visual refinements may evolve, but they may not weaken the trust, accessibility, performance, or verification requirements without an explicit documented decision.
