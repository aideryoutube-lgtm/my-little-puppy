"""Build the skinned Baby GLB from the original. Requires Python and NumPy."""
import json
import math
from pathlib import Path
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / 'assets/models'
source = (MODELS / 'Jerry_Baby.glb').read_bytes()
json_length = struct.unpack_from('<I', source, 12)[0]
gltf = json.loads(source[20:20 + json_length])
binary = bytearray(source[28 + json_length:])
nodes = gltf['nodes']
primitive = gltf['meshes'][0]['primitives'][0]


def add_accessor(data, kind, component=5126, bounds=False):
    while len(binary) % 4:
        binary.append(0)
    data = np.asarray(data, dtype='<f4' if component == 5126 else 'u1')
    view = len(gltf['bufferViews'])
    gltf['bufferViews'].append(dict(buffer=0, byteOffset=len(binary), byteLength=data.nbytes))
    binary.extend(data.tobytes())
    accessor = dict(bufferView=view, componentType=component, count=len(data), type=kind)
    if bounds:
        accessor.update(min=np.atleast_1d(data.min(axis=0)).tolist(),
                        max=np.atleast_1d(data.max(axis=0)).tolist())
    gltf['accessors'].append(accessor)
    return len(gltf['accessors']) - 1


joint_nodes = []
positions = {}
def bone(name, position, parent=None):
    absolute = np.array(position)
    local = absolute - positions[parent] if parent is not None else absolute
    index = len(nodes)
    nodes.append(dict(name=name, translation=local.tolist()))
    if parent is not None:
        nodes[parent].setdefault('children', []).append(index)
    joint_nodes.append(index)
    positions[index] = absolute
    return index


root = bone('Ground', (0, 0, 0))
body = bone('Torso', (0, -.47, -.12), root)
neck = bone('Neck', (0, -.20, .27), body)
head = bone('Head', (0, .04, .36), neck)
tail = bone('Tail', (0, -.39, -.61), body)
ears = [bone(name, (side * .27, .58, .30), head)
        for side, name in [(-1, 'Left ear'), (1, 'Right ear')]]
legs = []
for front, longitudinal in [('Front', .36), ('Hind', -.53)]:
    for side, lateral in [('Left', -.18), ('Right', .18)]:
        label = front + ' ' + side
        upper = bone(label + ' upper leg', (lateral, -.51, longitudinal), body)
        paw = bone(label + ' paw', (lateral, -.85, longitudinal + .045), upper)
        legs.append((upper, paw))

position_accessor = gltf['accessors'][primitive['attributes']['POSITION']]
view = gltf['bufferViews'][position_accessor['bufferView']]
vertices = np.frombuffer(bytes(binary), '<f4', count=position_accessor['count'] * 3,
                         offset=view.get('byteOffset', 0)).reshape(-1, 3)
x, y, z = vertices.T


def blend(value, start, end):
    t = np.clip((value - start) / (end - start), 0, 1)
    return t * t * (3 - 2 * t)


weights = np.zeros((len(vertices), len(joint_nodes)))
head_weight = blend(y, -.19, .20) * blend(z, -.12, .17)
neck_weight = blend(y, -.37, -.08) * blend(z, .03, .28) * (1 - head_weight)
tail_weight = blend(-z, .56, .80) * blend(y, -.60, -.30)
weights[:, tail - 1] = tail_weight
weights[:, neck - 1] = neck_weight
weights[:, head - 1] = head_weight
for ear, side in zip(ears, (-1, 1)):
    ear_weight = blend(y, .57, .79) * blend(x * side, .10, .25) * head_weight
    weights[:, ear - 1] = ear_weight
    weights[:, head - 1] -= ear_weight

front_weight = blend(z, -.17, .10)
left_weight = blend(-x, -.055, .055)
leg_weight = blend(-y, .52, .76)
paw_weight = blend(-y, .64, .84)
for (upper, paw), fraction in zip(legs, (
        front_weight * left_weight, front_weight * (1 - left_weight),
        (1 - front_weight) * left_weight, (1 - front_weight) * (1 - left_weight))):
    weights[:, upper - 1] = leg_weight * fraction * (1 - paw_weight)
    weights[:, paw - 1] = leg_weight * fraction * paw_weight
weights[:, body - 1] = np.maximum(0, 1 - weights.sum(axis=1))
joints = np.argsort(-weights, axis=1)[:, :4]
skin_weights = np.take_along_axis(weights, joints, axis=1)
skin_weights /= skin_weights.sum(axis=1, keepdims=True)
primitive['attributes']['JOINTS_0'] = add_accessor(joints, 'VEC4', 5121)
primitive['attributes']['WEIGHTS_0'] = add_accessor(skin_weights, 'VEC4')
inverse = []
for joint in joint_nodes:
    matrix = np.eye(4)
    matrix[:3, 3] = -positions[joint]
    inverse.append(matrix.T.ravel())
gltf['skins'] = [dict(joints=joint_nodes, skeleton=root,
                      inverseBindMatrices=add_accessor(inverse, 'MAT4'))]
nodes[0]['skin'] = 0
gltf['scenes'][0]['nodes'].append(root)

# Close the baked eye patches by compressing them into eyelid creases.
eyelid = np.zeros_like(vertices)
for center_x in (-.166, .166):
    eye_y = .316
    patch = ((x - center_x) / .11)**2 + ((y - eye_y) / .105)**2
    influence = (1 - blend(patch, .31, 1.0)) * blend(z, .57, .73)
    eyelid[:, 1] += (eye_y - y) * .94 * influence
primitive['targets'] = [dict(POSITION=add_accessor(eyelid, 'VEC3', bounds=True))]
gltf['meshes'][0].update(weights=[0], extras={'targetNames': ['Blink']})
gltf['animations'] = []


def quaternion(axis, angle):
    result = [0., 0., 0., math.cos(angle / 2)]
    result[axis] = math.sin(angle / 2)
    return result


def clip(name, duration, pose):
    times = np.linspace(0, duration, round(duration * 30) + 1)
    frames = [pose(t) for t in times]
    input_accessor = add_accessor(times, 'SCALAR', bounds=True)
    samplers, channels = [], []
    for joint, prop in frames[0]:
        kind = {'rotation': 'VEC4', 'translation': 'VEC3', 'weights': 'SCALAR'}[prop]
        output = add_accessor([frame[joint, prop] for frame in frames], kind)
        channels.append(dict(sampler=len(samplers), target=dict(node=joint, path=prop)))
        samplers.append(dict(input=input_accessor, output=output, interpolation='LINEAR'))
    gltf['animations'].append(dict(name=name, channels=channels, samplers=samplers))


def smooth(t):
    t = max(0., min(1., t))
    return t * t * (3 - 2 * t)


def frame():
    data = {(joint, 'translation'): nodes[joint]['translation'] for joint in (root, body)}
    data.update({(joint, 'rotation'): [0, 0, 0, 1] for joint in [root, neck, head, tail, *ears]})
    for upper, paw in legs:
        for joint in (upper, paw):
            data[joint, 'translation'] = nodes[joint]['translation']
    data[0, 'weights'] = 0
    return data


def offset(data, joint, dx=0, dy=0, dz=0):
    x, y, z = nodes[joint]['translation']
    data[joint, 'translation'] = [x + dx, y + dy, z + dz]


def idle(t):
    data = frame()
    breath = .013 * math.sin(math.tau * t / 3)
    offset(data, body, dy=breath)
    for upper, _ in legs:
        offset(data, upper, dy=-breath)
    data[head, 'rotation'] = quaternion(1, .11 * math.sin(math.tau * t / 6))
    data[tail, 'rotation'] = quaternion(1, .12 * math.sin(math.tau * t / 3))
    for i, ear in enumerate(ears):
        twitch = max(0, 1 - abs(t - 3.3 - i * .23) / .23)
        data[ear, 'rotation'] = quaternion(2, (-1)**i * .17 * twitch)
    data[0, 'weights'] = max(0, 1 - abs(t - 2.2) / .133)
    return data


def walk(t):
    data = frame()
    # Two short straight passes and two quarter-turn pairs on the floor patch.
    # Stance uses the inverse of ground speed, keeping the planted paw fixed.
    period = .86
    pass_time = period * 2
    turn = .64
    distance = .51
    heading = 1.05
    sections = (
        (pass_time, 0, distance, heading, heading),
        (turn, distance, distance, heading, heading + math.pi),
        (pass_time, distance, 0, heading + math.pi, heading + math.pi),
        (turn, 0, 0, heading + math.pi, heading + math.tau),
    )
    for index, (duration, start, end, low, high) in enumerate(sections):
        if t <= duration or index == len(sections) - 1:
            break
        t -= duration
    phase = min(1., t / duration)
    turning = start == end
    angle = low + (high - low) * smooth(phase)
    ground = start + (end - start) * phase
    offset(data, root, dx=ground * math.sin(heading), dz=ground * math.cos(heading))
    data[root, 'rotation'] = quaternion(1, angle)
    bob = .012 * math.sin(math.tau * 2 * t / period)
    offset(data, body, dy=bob)
    data[head, 'rotation'] = quaternion(2, .045 * math.sin(math.tau * t / period))
    data[tail, 'rotation'] = quaternion(1, .28 * math.sin(math.tau * t / period))
    for (upper, paw), step in zip(legs, (.25, .75, 0, .5)):
        p = (t / (turn if turning else period) + step) % 1
        stance = .67
        stride = distance / 2
        if p < stance:
            forward = stride * (stance / 2 - p)
            lift = 0
        else:
            swing = (p - stance) / (1 - stance)
            forward = stride * stance * (smooth(swing) - .5)
            lift = .12 * math.sin(math.pi * swing)**2
        if turning:
            forward = 0
        offset(data, upper, dy=-bob + lift * .38, dz=forward * .35)
        offset(data, paw, dy=lift * .62, dz=forward * .65)
    return data


def happy(t):
    data = frame()
    energy = math.sin(math.pi * t / 1.5)**2
    hop = max(0, math.sin(math.pi * np.clip((t - .35) / .62, 0, 1)))**2
    offset(data, body, dy=.12 * hop)
    data[neck, 'rotation'] = quaternion(1, .18 * energy)
    data[head, 'rotation'] = quaternion(1, .26 * energy)
    data[tail, 'rotation'] = quaternion(1, .64 * energy * math.sin(math.tau * 5 * t))
    for upper, _ in legs[:2]:
        offset(data, upper, dy=.10 * hop, dz=.075 * hop)
    return data


clip('Idle', 6, idle)
clip('Walk', 4.72, walk)
clip('Happy', 1.5, happy)
gltf['buffers'][0]['byteLength'] = len(binary)
metadata = json.dumps(gltf, separators=(',', ':')).encode()
metadata += b' ' * (-len(metadata) % 4)
dest = MODELS / 'Jerry_Baby_Animated.glb'
dest.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(metadata) + len(binary))
                 + struct.pack('<I4s', len(metadata), b'JSON') + metadata
                 + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
print(f'{dest.name}: {len(joint_nodes)} joints, {dest.stat().st_size:,} bytes')
