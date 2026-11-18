"""Build KitchenFoodBowl.glb with Blender's glTF exporter."""
import json
import struct
from math import cos, sin, sqrt, tau
from pathlib import Path

import bpy

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat


blue = material('Blue ceramic', (.012, .19, .66), .29)
inside = material('Blue glaze', (.018, .25, .73), .38)
rim = material('Glazed rim', (.092, .40, .88), .25)
base = material('Rubber foot', (.012, .022, .038), .69)
# Revolve a closed cross section. Inner wall and floor are separate surfaces
# so a grazing camera angle still reveals an actual hollow interior.
profile = [(0, .035), (.90, .035), (.98, .065), (1, .11), (.94, .28),
           (.86, .55), (.85, .59), (.82, .61), (.78, .61), (.75, .58),
           (.75, .52), (.72, .33), (.66, .19), (.58, .15), (0, .15)]
sides = 64
verts = [(r * cos(tau * i / sides), r * sin(tau * i / sides), height)
         for r, height in profile for i in range(sides)]
faces = [(row * sides + i, row * sides + (i + 1) % sides,
          (row + 1) * sides + (i + 1) % sides, (row + 1) * sides + i)
         for row in range(len(profile) - 1) for i in range(sides)]
mesh = bpy.data.meshes.new('Hollow ceramic')
mesh.from_pydata(verts, [], faces)
mesh.update()
bowl = bpy.data.objects.new('Blue food bowl', mesh)
bpy.context.collection.objects.link(bowl)
for mat in (blue, inside, rim, base):
    mesh.materials.append(mat)
for polygon in mesh.polygons:
    row = polygon.index // sides
    polygon.material_index = 3 if row < 3 else 0 if row < 6 else 2 if row < 10 else 1
    polygon.use_smooth = True

# Eight portions of four solid pieces. Outer pieces disappear first and each
# portion owns a material so the game can hide it without loading new models.
for portion in range(8):
    tint = .018 * (portion % 3)
    kibble = material(f'Kibble {portion + 1}', (.30 + tint, .115 + tint, .032), .79)
    for index in range(portion * 4, portion * 4 + 4):
        angle = index * 2.399963
        radius = .65 * sqrt((index + .5) / 32)
        height = .30 + .13 * (1 - radius / .65) + .03 * (index % 3)
        if index % 4 == 0:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
            piece = bpy.context.object
            piece.data.materials.append(kibble)
            portion_mesh = piece.data
        else:
            piece = bpy.data.objects.new('Kibble piece', portion_mesh)
            bpy.context.collection.objects.link(piece)
        piece.location = (radius * cos(angle), radius * sin(angle), height)
        piece.name = f'Kibble piece {index + 1}'
        piece.scale = (.115 + .012 * (index % 3), .10 + .008 * (index % 4), .079)
        piece.rotation_euler = (.3 * cos(angle), .4 * sin(angle), angle)

target = Path(__file__).resolve().parents[1] / 'assets/models/KitchenFoodBowl.glb'
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB')

# Blender exports constant-alpha materials as opaque. Declare the cutout
# mode explicitly so model-viewer can hide each portion through its API.
data = target.read_bytes()
json_size, = struct.unpack_from('<I', data, 12)
metadata = json.loads(data[20:20 + json_size])
for mat in metadata['materials']:
    if mat['name'].startswith('Kibble '):
        mat.update(alphaMode='MASK', alphaCutoff=.5)
encoded = json.dumps(metadata, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
binary_chunk = data[20 + json_size:]
target.write_bytes(struct.pack('<4sIIII', b'glTF', 2, 20 + len(encoded) + len(binary_chunk),
                               len(encoded), 0x4E4F534A) + encoded + binary_chunk)
