"""Extract the Stanford dragon geometry from the Khronos sample GLB.

Standard-library only; sources and outputs stay inside this repository.
The backdrop, textures and transmissive sample materials are intentionally omitted.
"""
from pathlib import Path
from urllib.request import urlopen
import json
import struct

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'sources'
OUT = ROOT / 'public' / 'models'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/'
source = CACHE / 'dragon-source.glb'
if not source.exists():
    source.write_bytes(urlopen(BASE + 'Models/DragonAttenuation/glTF-Binary/DragonAttenuation.glb').read())
data = source.read_bytes()
json_length = struct.unpack_from('<I', data, 12)[0]
original = json.loads(data[20:20 + json_length])
binary_start = 20 + json_length + 8
binary = data[binary_start:]
dragon_node = next(n for n in original['nodes'] if n.get('name') == 'Dragon')
primitive = original['meshes'][dragon_node['mesh']]['primitives'][0]
indices = [primitive['attributes']['POSITION'], primitive['attributes']['NORMAL'], primitive['indices']]
new_binary = bytearray()
accessors, views = [], []
for source_index in indices:
    accessor = original['accessors'][source_index]
    view = original['bufferViews'][accessor['bufferView']]
    components = {'SCALAR': 1, 'VEC3': 3}[accessor['type']]
    size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[accessor['componentType']] * components
    stride = view.get('byteStride', size)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    while len(new_binary) % 4:
        new_binary.append(0)
    offset = len(new_binary)
    for row in range(accessor['count']):
        new_binary.extend(binary[start + row * stride:start + row * stride + size])
    views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(new_binary) - offset})
    new_accessor = {k: v for k, v in accessor.items() if k not in ('bufferView', 'byteOffset')}
    new_accessor['bufferView'] = len(views) - 1
    accessors.append(new_accessor)
node = {k: v for k, v in dragon_node.items() if k != 'mesh'}
node['mesh'] = 0
model = {
    'asset': {'version': '2.0', 'generator': 'Aureole geometry extraction', 'copyright': 'Stanford University 1996; Morgan McGuire 2017'},
    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [node],
    'meshes': [{'name': 'Stanford Dragon', 'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2}]}],
    'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(new_binary)}]
}
payload = json.dumps(model, separators=(',', ':')).encode()
payload += b' ' * (-len(payload) % 4)
new_binary += b'\0' * (-len(new_binary) % 4)
header = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(payload) + 8 + len(new_binary))
(OUT / 'dragon.glb').write_bytes(header + struct.pack('<II', len(payload), 0x4E4F534A) + payload + struct.pack('<II', len(new_binary), 0x004E4942) + new_binary)
(OUT / 'LICENSE-Stanford.txt').write_bytes(urlopen(BASE + 'LICENSES/LicenseRef-Stanford-Graphics.txt').read())
(OUT / 'SOURCE.md').write_bytes(urlopen(BASE + 'Models/DragonAttenuation/README.md').read())
print(f"dragon.glb: {(OUT / 'dragon.glb').stat().st_size:,} bytes; {accessors[2]['count'] // 3:,} triangles")
