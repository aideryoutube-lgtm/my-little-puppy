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
        kind = {'rotation': 'VEC4', 'translation': 'VEC3', 'scale': 'VEC3', 'weights': 'SCALAR'}[prop]
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
    walk_steps(data, t, turn if turning else period, distance / 2, bob, turning)
    return data


def walk_steps(data, t, period, stride, bob, turning, effort=1):
    for (upper, paw), step in zip(legs, (.25, .75, 0, .5)):
        p = (t / period + step) % 1
        stance = .67
        if p < stance:
            forward = stride * (stance / 2 - p)
            lift = 0
        else:
            swing = (p - stance) / (1 - stance)
            forward = stride * stance * (smooth(swing) - .5)
            lift = .12 * math.sin(math.pi * swing)**2
        if turning:
            forward = 0
        lift *= effort
        forward *= effort
        offset(data, upper, dy=-bob + lift * .38, dz=forward * .35)
        offset(data, paw, dy=lift * .62, dz=forward * .65)


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


def add_tongue():
    # A small muzzle attachment follows the existing Head bone. Only Eat
    # animates it; zero scale hides it in every other clip and in the bind pose.
    points, normals, triangles = [], [], []
    rings, sides = 8, 12
    for ring in range(rings + 1):
        angle = math.pi * ring / rings
        for side in range(sides):
            around = math.tau * side / sides
            x = math.sin(angle) * math.cos(around)
            y = math.sin(angle) * math.sin(around)
            z = math.cos(angle)
            points.append((x * .057, y * .019 + .028 * max(0, z)**2, z * .087))
            normals.append((x, y, z))
            if ring < rings:
                a = ring * sides + side
                b = ring * sides + (side + 1) % sides
                triangles.extend((a, a + sides, b, b, a + sides, b + sides))
    material = len(gltf['materials'])
    gltf['materials'].append(dict(name='Tongue', doubleSided=True, pbrMetallicRoughness=dict(
        baseColorFactor=[.73, .23, .29, 1], metallicFactor=0, roughnessFactor=.8)))
    mesh = len(gltf['meshes'])
    gltf['meshes'].append(dict(name='Tongue', primitives=[dict(
        attributes=dict(POSITION=add_accessor(points, 'VEC3', bounds=True),
                        NORMAL=add_accessor(normals, 'VEC3')),
        indices=add_accessor(triangles, 'SCALAR', 5121), material=material)]))
    node = len(nodes)
    nodes.append(dict(name='Tongue', mesh=mesh, translation=[0, -.01, .49], scale=[0, 0, 0]))
    nodes[head].setdefault('children', []).append(node)
    return node


# Camera azimuth is 30 degrees. A heading of 120 degrees moves screen-right
# along the clear strip of kitchen floor immediately in front of the bowls.
bowl_heading = math.radians(120)
stride = .255
period = .58
strides = 4
travel_time = strides * period
reach = strides * stride
turn_time = .48


def kitchen_pose(distance, heading):
    data = frame()
    offset(data, root, dx=distance * math.sin(bowl_heading),
           dz=distance * math.cos(bowl_heading))
    data[root, 'rotation'] = quaternion(1, heading)
    return data


def kitchen_walk(t, home=False):
    # Take little steps during turns, then match planted-paw speed to root
    # motion during the straight section, using the existing Walk gait.
    initial = bowl_heading if home else 0
    heading = bowl_heading + math.pi if home else bowl_heading
    direction = -1 if home else 1
    start = reach if home else 0
    if t < turn_time:
        phase = t / turn_time
        data = kitchen_pose(start, initial + (heading - initial) * smooth(phase))
        effort = smooth(t / .09) * smooth((turn_time - t) / .09)
        walk_steps(data, t, turn_time, stride, 0, True, effort)
        return data
    t -= turn_time
    distance = start + direction * min(reach, t * stride / period)
    if t > travel_time:
        elapsed = t - travel_time
        end_heading = math.tau if home else bowl_heading
        data = kitchen_pose(distance, heading + (end_heading - heading) * smooth(elapsed / turn_time))
        if home:
            effort = smooth(elapsed / .09) * smooth((turn_time - elapsed) / .09)
            walk_steps(data, elapsed, turn_time, stride, 0, True, effort)
        return data
    data = kitchen_pose(distance, heading)
    effort = smooth(t / .09) * smooth((travel_time - t) / .09)
    bob = .012 * effort * math.sin(math.tau * 2 * t / period)
    offset(data, body, dy=bob)
    walk_steps(data, t, period, stride, bob, False, effort)
    data[tail, 'rotation'] = quaternion(1, .24 * effort * math.sin(math.tau * t / period))
    return data


def eat(t):
    data = kitchen_pose(reach, bowl_heading)
    lowering = smooth(t / .65) * (1 - smooth((t - 2.2) / .65))
    chewing = lowering * (math.sin(math.tau * 2.7 * t) + 1) / 2
    lick = max(0, math.sin(math.pi * np.clip((t - 2.77) / .40, 0, 1)))**2
    wag = smooth((t - 2.95) / .25) * (1 - smooth((t - 3.6) / .25))
    data[neck, 'rotation'] = quaternion(0, .48 * lowering + .08 * chewing)
    data[head, 'rotation'] = quaternion(0, .35 * lowering + .13 * chewing - .23 * lick)
    data[tongue, 'scale'] = [lick] * 3
    data[tongue, 'translation'] = [0, -.025 + .045 * lick, .49 + .062 * lick]
    data[0, 'weights'] = .9 * lick
    data[tail, 'rotation'] = quaternion(1, .58 * wag * math.sin(math.tau * 4.5 * t))
    return data


clip('Idle', 6, idle)
clip('Walk', 4.72, walk)
clip('Happy', 1.5, happy)
tongue = add_tongue()
# The terminal pose holds long enough for the live mixer to crossfade before
# the timeline loops, keeping the feet and root at the hand-off position.
blend_hold = .55
clip('WalkToBowl', turn_time + travel_time + blend_hold, kitchen_walk)
clip('Eat', 3.85 + blend_hold, eat)
clip('WalkHome', 2 * turn_time + travel_time + blend_hold,
     lambda t: kitchen_walk(min(t, 2 * turn_time + travel_time), home=True))
gltf['buffers'][0]['byteLength'] = len(binary)
metadata = json.dumps(gltf, separators=(',', ':')).encode()
metadata += b' ' * (-len(metadata) % 4)
dest = MODELS / 'Jerry_Baby_Animated.glb'
dest.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(metadata) + len(binary))
                 + struct.pack('<I4s', len(metadata), b'JSON') + metadata
                 + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
print(f'{dest.name}: {len(joint_nodes)} joints, {dest.stat().st_size:,} bytes')
