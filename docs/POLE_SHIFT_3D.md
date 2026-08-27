# 3D Pole-Shift Lens

## Objective

Make microscopic figure-pole and spin-vector shifts spatially legible without altering the physical values produced by `computePhysics`.

## Visual model

The lens renders three vectors in one local 3D coordinate system:

- **Geographic axis** — fixed reference vector, shown in grey.
- **Figure axis** — principal inertia axis returned by the rigid-Earth eigenproblem, shown in cyan.
- **Spin vector** — instantaneous angular-velocity direction implied by angular-momentum conservation, shown in white.

A circular plane tangent to the geographic north pole provides a common measurement surface. Each vector intersects that plane, so the user can see both the full 3D axis tilt and the corresponding pole displacement. Rings and crosshairs retain the visual language of the original 2D axis lens.

## Magnification

Magnification changes presentation only.

- `1×` uses the physical angular separation.
- `10⁹×` and `10¹²×` multiply the physical tilt before rendering.
- `AUTO` maps the larger current displacement to a bounded 30-degree display tilt and preserves the ratio between figure and spin shifts.
- Display tilt is capped so vectors cannot cross the tangent-plane boundary or invert.
- Physical distance, angle, azimuth, length-of-day, and center-of-mass readouts never use the magnified vectors.

## Interaction

- Drag to orbit the 3D lens.
- Pinch or scroll to zoom.
- Switch among orbit, pole-biased, and side camera presets.
- Toggle automatic orbit motion; reduced-motion preferences disable it.
- Select the figure or spin vector from either the 3D geometry or telemetry rows to isolate it.
- Switch between the 3D vector view and the original 2D tangent-plane view without closing the lens.
- Press Escape, use the close control, or tap the mobile backdrop to close the lens.

## Implementation boundaries

- The main Earth scene and physics engine remain unchanged.
- The 3D lens consumes only `figureAxis`, `spinAxis`, physical shifts, and the existing Earth radius constant.
- A separate React Three Fiber canvas isolates lens camera controls from the main globe camera.
- The production verification script targets each canvas explicitly and confirms that lens interactions do not mutate physical metrics.

## Exit criteria

1. Next.js production build and TypeScript checks pass.
2. The lens opens in 3D mode and exposes 3D/2D, scale, view, auto-rotate, and vector-focus controls.
3. Both non-reference vectors animate when scenario, mass, target, or scale changes.
4. Figure and spin vectors preserve their computed azimuths at every scale.
5. Changing lens scale or dimension leaves the primary physical pole-shift metric unchanged.
6. Desktop, iPhone 393×852, short mobile 375×667, and reduced-motion checks have no viewport overflow, critical overlap, page error, or console error.
7. Production screenshots show a usable 3D lens, 2D fallback, transfer interaction, and model-information sheet.
