# Particle showcase implementation plan

## Objective

Build a JavaScript / Three.js WebGL showcase inspired by five local reference screenshots (excluded from the repository), using the three locally retained generated comps as visual targets (also excluded from the repository). No Impeccable workflow. No WebGPU dependency for the initial version.

## 1. Establish the rendering pipeline

Complete the Vite entry point, self-host the interface font with its license, and create a resizable Three.js renderer. Use linear half-float targets, HDR bloom, and one final tone-mapping / display conversion step. Handle unavailable WebGL, resize, device pixel ratio, context loss and reduced motion. Establish GPU timing or frame-time measurements before tuning particle counts.

Deliverable: a running illuminated particle field with orbit controls and adjustable exposure/bloom.

## 2. Prove glitter and depth together

Build a small isolated flake test before scaling up. Give each particle a persistent orientation, size and material response. Evaluate view/light-dependent specular glints with finite roughness and stable filtering. Use key and rim lights; avoid random frame-to-frame flashing. Test energy-normalized defocused splats for particles and a compatible DOF path for solids. Preserve HDR highlights through blur and bloom before tone mapping.

Compare orbiting camera, moving light, rotating flakes and changing focal distance. Start with a lightweight physically motivated approximation; consider the published stochastic glint models in RENDERING.md if surface glitter remains inadequate. Do not label the approximation a full implementation of those papers.

Deliverable: convincing sharp-to-bokeh glitter with roughness, focus, aperture and light controls.

## 3. Build the three scenes

1. **Current:** layered, flowing particle ribbons with gold/crimson/jade variation, dimensional turbulence, pointer disturbance and foreground bokeh. Aim for the asymmetric sweeping composition in `01-current.png`.
2. **Relic:** an original sculptural knot with physically based metal shading. Sample particles from its actual surface; coordinate solid reveal and particle assembly/dissolution so the two representations remain aligned. Preserve solid occlusion, grazing highlights and the dust wake seen in `02-relic.png`.
3. **Continuum:** recursively subdivided tetrahedral lattice with grains distributed along edges. Animate construction and breakup, retaining depth and readable negative space as in `03-continuum.png`.

Prefer GPU vertex animation and reusable buffers. Add ping-pong simulation only if persistent particle interaction requires it; analytic displacement is sufficient for the first visual proof.

## 4. Connect the showcase controls

Implement scene navigation and transitions, pause, optional automatic journey, orbit/zoom, cinema view, fullscreen, frame export, per-scene reset, palette and quality settings. Connect bloom, exposure, turbulence, speed, assembly and optical controls to real renderer parameters. Provide keyboard operation, visible focus and a compact mobile layout.

## 5. Validate and tune

Run the production build and meaningful browser smoke checks: scene switching, all controls, pause/resume, reset, resize, mobile layout, screenshot export and WebGL error handling. Check shader compilation and console errors. Capture each scene on desktop and mobile, compare against the comps, and tune particle density, bokeh and bloom together. Measure frame times on the available machine and report hardware/browser context; do not claim unmeasured cross-device performance.

Deliverable: runnable demo, launch instructions, captured previews, and a short account of implemented approximations and measured limits.

## Working order

Pipeline → glitter/depth proof → Current → Relic → Continuum → controls/transitions → validation. Prioritize the actual light/material response before increasing particle count or adding more interface detail.

## Implemented follow-up

Desktop density increased to 1.2M GPU-generated particles (up to 2.4M selectable), with asynchronous GPU timing and bounded sparse bokeh. Added cinematic camera drift, HDR solid DoF, temporal grain stabilization and a separate sparse sparkle pass. Relic now uses the Stanford dragon with local source/license files. Brightness and aperture defaults emphasize particle glints and defocused highlights. README.md records the current controls, validation and rendering limitations.
