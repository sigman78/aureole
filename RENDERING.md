# Rendering direction and glint research

## Status

First runnable version implemented with Three.js/WebGL 2, three procedural scenes, GLSL particle motion and glints, HDR bloom, particle bokeh, locally served fonts, live controls and browser smoke tests. See README.md for launch instructions and limitations. Three generated scene comps and exact prompt sidecars are retained locally and excluded from Git: `01-current.png`, `02-relic.png`, and `03-continuum.png`. Impeccable is explicitly excluded from further work; its local metadata is ignored by Git and imposes no approval gates.

## Reference observations

- 015640: dense gold halo, dark occluding sphere, crimson and jade grains, varied focal depth.
- 015715: braided flowing particle filaments and asymmetric negative space.
- 015745: solid sculptural surface, grazing gold illumination, red dust and green atmospheric light.
- 015814: granular geometric lattice, luminous intersections, pronounced foreground bokeh.
- 015858: surface dissolving into gold grains, pale solid highlights and teal rim light.

## Planned scenes

Current: moving, braided three-dimensional particle ribbons, pointer disturbance and camera orbit. Inner flow gives each grain a speed that varies smoothly across its lane (shear layers that slide past one another) and adds a fine turbulence scale. Both turbulence scales drift downstream at about the grains' own speed, so eddies travel with the stream instead of standing still. Grains are not clustered into visible strands; that variant was tried and read as threads rather than currents. The braid's twist and the ribbon's vertical wave previously travelled upstream while grains moved downstream, which read as spiralling churn; both now travel downstream at 75% of grain speed, so grains ride the shape along the stream with only a slow residual spiral.
Relic: the locally served Stanford dragon with metallic shading and surface-sampled particle assembly/dissolution. The earlier knot comp remains a visual reference; model attribution and license are in public/models/.
Continuum: recursive tetrahedral edges sampled with grains; progressive formation and breakup.

## Physical glitter approximation

Implemented starting point: each visible flake has a deterministic normal and size. The shader evaluates its specular response from actual light and view vectors using a GGX-shaped lobe and approximate Fresnel term. Flake orientations rotate continuously rather than hashing brightness each frame. Attached flakes use perturbed surface normals and rotate with their host geometry. This is a physically motivated approximation: the extreme-response cap and artistic light scaling do not conserve full BRDF energy, and this is not a port of a published stochastic glint model.

Relic's solid uses a stochastic glint BRDF instead of grains attached to its surface. Each surface patch holds a finite number of mirror facets (the log-scale glitter density control) drawn from the GGX distribution. The number of facets that reflect the key or rim light into the eye is sampled as binomial, with probability D(h)·(n·h)·Ω_h, where Ω_h comes from a finite light cone (0.03 rad). That count is divided by its expectation and multiplies three.js's direct GGX specular. The ratio has mean 1, so low densities give discrete glints and high densities converge to ordinary metal at the same average brightness. Seeds come from object-space cells about half a pixel wide, blended trilinearly in space and over two levels as the footprint changes, and from bilinearly blended slope bins in a surface-attached frame, so glints stay attached to the turning sculpture. The approach follows Deliot & Belcour 2023 (binomial facet counts over footprint cells) in simplified form. It uses cubic object-space cells rather than anisotropic UV grids and applies only to direct lights; image-based lighting stays smooth and is kept faint (an explicit envMap with intensity 0.03) so the glints dominate. Grains fade out as they settle onto the solid and reappear as it dissolves. Direct light intensities (key 400, rim 200) only affect the solid; particles use the key position, not its intensity. Measured on a GTX 1080 Ti at 1440×900, Relic's GPU frame rose from about 3.9 ms to 6.6 ms; the 64 binomial samples per light per pixel are the cost, and spatial interpolation is what keeps glints from flickering as cell boundaries cross pixels under motion and jitter. In a moving capture, glints add about 1.9× the frame-to-frame change of smooth metal under the same motion, down from 3.7× with nearest-cell seeds.

Use a finite angular light size / lower bound on roughness, footprint-aware filtering, and stable seeds to limit severe temporal aliasing. A sharp unfiltered dot-product exponent alone is not a fully physical or stable glint solution. Energy normalization matters when changing roughness, particle count or bokeh radius.

Keep radiance above 1 in linear half-float render targets. Apply depth-of-field and bloom while still in HDR, then tone-map and convert to display color once. For sparse particles, normalized aperture-shaped splats can approximate defocus more efficiently than scene-wide DOF. Increase footprint with circle of confusion while reducing intensity to preserve integrated brightness. Do not rely on a generic depth override pass without validating animated transparent-particle depth and occlusion. Solid geometry should occlude flakes correctly; additive particles remain an artistic scattering approximation rather than full volumetric transport.

Controls expose flake roughness, glint strength, key-light position, focus distance and particle depth softness alongside bloom and exposure. Detail presets are 240k / 1.2M / 2.4M / 4.8M; browser smoke results and captures live in artifacts/. Solid geometry receives depth-based HDR blur; normalized splat defocus applies to particles.

## Current pipeline and density

Solid HDR render and depth blur → dense particle splats → temporal AA → sparse optical sparkle splats → stable HDR bloom → vignette → ACES and sRGB output. All intermediate color buffers are half-float. Sparkles bypass temporal averaging but retain finite angular lobes, stable facet seeds, soft spatial profiles and energy-normalized defocus. Field sparkles receive a stronger artistic radiance gain than attached sculpture flakes.

Temporal stability of bright speckles. Sparse flakes bypass temporal AA and are very bright, and the residual blinking came from two places, not from the glint lobes. First, a ~1 px flake sprite covers 1, 2 or 4 pixels depending on its sub-pixel position, so its integrated energy jumped as it moved; flakes now have a 4 px minimum footprint (energy conserved by the core²/diameter² term), which cut pre-bloom HDR fluctuation about 4× at the same mean brightness. Second, UnrealBloomPass samples each smaller level sparsely, so a moving hot point pulsed through the coarse levels. It is replaced by `src/stable-bloom.js`: 13-tap filtered downsampling (Jimenez 2014) over eight levels, tent-filtered upsampling, Unreal's luminance high-pass per tap, and an extra `halo` weight on the finest levels that gives each speckle a tight shine. The solid's glints use a footprint covering the circle of confusion, so defocused glints converge instead of blurring single hot facets. Widening flake lobes with defocus, and an |n·v| projected-area term, were measured and did not reduce blinking, so they were not kept. A star-streak flare was tried and removed: dense glitter turned it into bars, and the references show halos rather than stars. `scripts/motion.mjs` steps paused time one 60 fps frame at a time and reports blinking: 8×8 block means cancel edge motion and a second difference removes steady drift. On a GTX 1080 Ti at 1440×900 with matched mean brightness, Current went from 31.3 to 12.1 per mille of luminance (99.9th-percentile change 27.6 → 12.7) and Relic from 16.8 to 7.5 (9.5 → 7.4).

The desktop default is 2.4M particles, generated from gl_VertexID without per-particle attribute buffers. A fixed triangle atlas supports area-weighted dragon sampling. Large aperture splats are limited to 12,000 flakes; fine grains use compact footprints and attenuation out of focus to contain overdraw. This attenuation is a performance approximation, not full lens integration.

Temporal AA uses 16-sample Halton jitter, HDR-compressed neighborhood variance clipping and camera reprojection. Solid depth is available when its DoF pass runs; particle depth uses a focus-plane approximation. There are no particle velocity vectors. Settings and assembly changes reset history. Sparse glints intentionally retain some temporal variation. Camera drift is independently controllable and pauses with the simulation.

## Primary sources

- Chermain et al., 2020, Procedural Physically based BRDF for Real-Time Rendering of Glints. Normalized NDFs converge toward conventional microfacet shading at large facet counts. Published OpenGL implementation, MIT license, and linked WebGL demo: https://github.com/ASTex-ICube/real_time_glint . Uses a precomputed dictionary; this is a more involved surface-glitter option than per-particle flakes.
- Deliot et al., 2023, Real-Time Rendering of Glinty Appearances using Distributed Binomial Laws on Anisotropic Grids: https://arxiv.org/abs/2306.05051 . Candidate for filtered stochastic surface glints; do not claim the simpler flake shader implements this paper.
- Real-time Image-based Lighting of Glints, 2025: https://arxiv.org/abs/2507.02674 . Relevant extension for dynamic environment illumination, beyond the proposed initial key/rim light setup.
- Jimenez, 2014, Next Generation Post Processing in Call of Duty: Advanced Warfare (13-tap downsample, tent upsample), the basis of the stable bloom chain. Three.js UnrealBloomPass (https://threejs.org/docs/pages/UnrealBloomPass.html) supplied the threshold and level-weight conventions it replaces.
- Three.js postprocessing/output conversion: https://threejs.org/manual/pages/post-processing.html
- Three.js DOF: https://threejs.org/docs/pages/BokehPass.html

## Comps and provenance

Generated with the built-in Imagegen tool. Exact prompts are preserved in local `.png.json` sidecars; neither comps nor sidecars are included in the published repository. These are design targets, not captured runtime images or performance evidence. The artwork must be rendered interactively; do not ship the comps as canvas backgrounds.
