# Stanford dragon provenance

`dragon.glb` is a geometry-only derivative of the [Khronos DragonAttenuation sample](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/DragonAttenuation).

- Original dragon scan: © 1996 Stanford University Computer Graphics Laboratory.
- Conversion and cleanup: © 2017 Morgan McGuire, [Computer Graphics Archive](https://casual-effects.com/data).
- [Original Stanford scan repository](https://graphics.stanford.edu/data/3Dscanrep/).
- [Local Stanford license](LICENSE-Stanford.txt): research/noncommercial use and free redistribution with attribution; commercial use requires permission.

The preparation script at `scripts/prepare-dragon.py` downloads the upstream GLB into the ignored project-local cache and extracts the dragon geometry, preserving its transforms. The backdrop, textures and source materials are removed. Aureole supplies its own metallic material and particle sampling. The shipped mesh contains 91,216 triangles.

The upstream sample also contains an Adobe CC0 cloth backdrop; that backdrop is not included in this derivative.
