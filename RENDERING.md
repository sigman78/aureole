# Rendering direction and glint research

## Status

First runnable version implemented with Three.js/WebGL 2, three procedural scenes, GLSL particle motion and glints, HDR bloom, particle bokeh, locally served fonts, live controls and browser smoke tests. See README.md for launch instructions and limitations. Three generated scene comps and exact prompt sidecars are in the project root: `01-current.png`, `02-relic.png`, and `03-continuum.png`. Impeccable is explicitly excluded from further work; its local metadata is ignored by Git and imposes no approval gates.

## Reference observations

- 015640: dense gold halo, dark occluding sphere, crimson and jade grains, varied focal depth.
- 015715: braided flowing particle filaments and asymmetric negative space.
- 015745: solid sculptural surface, grazing gold illumination, red dust and green atmospheric light.
- 015814: granular geometric lattice, luminous intersections, pronounced foreground bokeh.
- 015858: surface dissolving into gold grains, pale solid highlights and teal rim light.

## Planned scenes

Current: moving, braided three-dimensional particle ribbons, pointer disturbance and camera orbit.
Relic: the locally served Stanford dragon with metallic shading and surface-sampled particle assembly/dissolution. The earlier knot comp remains a visual reference; model attribution and license are in public/models/.
Continuum: recursive tetrahedral edges sampled with grains; progressive formation and breakup.

## Physical glitter approximation

Implemented starting point: each visible flake has a deterministic normal and size. The shader evaluates its specular response from actual light and view vectors using a GGX-shaped lobe and approximate Fresnel term. Flake orientations rotate continuously rather than hashing brightness each frame. Attached flakes use perturbed surface normals and rotate with their host geometry. This is a physically motivated approximation: the extreme-response cap and artistic light scaling do not conserve full BRDF energy, and this is not a port of a published stochastic glint model.

Use a finite angular light size / lower bound on roughness, footprint-aware filtering, and stable seeds to limit severe temporal aliasing. A sharp unfiltered dot-product exponent alone is not a fully physical or stable glint solution. Energy normalization matters when changing roughness, particle count or bokeh radius.

Keep radiance above 1 in linear half-float render targets. Apply depth-of-field and bloom while still in HDR, then tone-map and convert to display color once. For sparse particles, normalized aperture-shaped splats can approximate defocus more efficiently than scene-wide DOF. Increase footprint with circle of confusion while reducing intensity to preserve integrated brightness. Do not rely on a generic depth override pass without validating animated transparent-particle depth and occlusion. Solid geometry should occlude flakes correctly; additive particles remain an artistic scattering approximation rather than full volumetric transport.

Controls expose flake roughness, glint strength, key-light position, focus distance and particle depth softness alongside bloom and exposure. Detail presets are 120k / 600k / 1.2M / 2.4M; browser smoke results and captures live in artifacts/. Solid geometry receives depth-based HDR blur; normalized splat defocus applies to particles.

## Current pipeline and density

Solid HDR render and depth blur → dense particle splats → temporal AA → sparse optical sparkle splats → HDR bloom → vignette → ACES and sRGB output. All intermediate color buffers are half-float. Sparkles bypass temporal averaging but retain finite angular lobes, stable facet seeds, soft spatial profiles and energy-normalized defocus. Field sparkles receive a stronger artistic radiance gain than attached sculpture flakes.

The desktop default is 1.2M particles, generated from gl_VertexID without per-particle attribute buffers. A fixed triangle atlas supports area-weighted dragon sampling. Large aperture splats are limited to 12,000 flakes; fine grains use compact footprints and attenuation out of focus to contain overdraw. This attenuation is a performance approximation, not full lens integration.

Temporal AA uses 16-sample Halton jitter, HDR-compressed neighborhood variance clipping and camera reprojection. Solid depth is available when its DoF pass runs; particle depth uses a focus-plane approximation. There are no particle velocity vectors. Settings and assembly changes reset history. Sparse glints intentionally retain some temporal variation. Camera drift is independently controllable and pauses with the simulation.

## Primary sources

- Chermain et al., 2020, Procedural Physically based BRDF for Real-Time Rendering of Glints. Normalized NDFs converge toward conventional microfacet shading at large facet counts. Published OpenGL implementation, MIT license, and linked WebGL demo: https://github.com/ASTex-ICube/real_time_glint . Uses a precomputed dictionary; this is a more involved surface-glitter option than per-particle flakes.
- Deliot et al., 2023, Real-Time Rendering of Glinty Appearances using Distributed Binomial Laws on Anisotropic Grids: https://arxiv.org/abs/2306.05051 . Candidate for filtered stochastic surface glints; do not claim the simpler flake shader implements this paper.
- Real-time Image-based Lighting of Glints, 2025: https://arxiv.org/abs/2507.02674 . Relevant extension for dynamic environment illumination, beyond the proposed initial key/rim light setup.
- Three.js HDR bloom: https://threejs.org/docs/pages/UnrealBloomPass.html
- Three.js postprocessing/output conversion: https://threejs.org/manual/pages/post-processing.html
- Three.js DOF: https://threejs.org/docs/pages/BokehPass.html

## Comps and provenance

Generated with the built-in Imagegen tool. Exact prompts are preserved in each `.png.json` sidecar. These are design targets, not captured runtime images or performance evidence. The artwork must be rendered interactively; do not ship the comps as canvas backgrounds.
