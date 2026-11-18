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


def route_pose(distance, heading, route_heading):
    data = frame()
    offset(data, root, dx=distance * math.sin(route_heading),
           dz=distance * math.cos(route_heading))
    data[root, 'rotation'] = quaternion(1, heading)
    return data


def route_walk(t, home=False, *, route_heading=bowl_heading, start=0,
               distance=reach, stride_length=stride, step_period=period, kitchen=False):
    route_end = start + distance
    travel = distance * step_period / stride_length
    # Take little steps during turns, then match planted-paw speed to root
    # motion during the straight section, using the existing Walk gait.
    initial = route_heading if home or start else 0
    heading = route_heading - math.copysign(math.pi, route_heading) if home else route_heading
    if kitchen and home:
        heading = route_heading + math.pi
    direction = -1 if home else 1
    origin = route_end if home else start
    if t < turn_time:
        phase = t / turn_time
        data = route_pose(origin, initial + (heading - initial) * smooth(phase), route_heading)
        effort = smooth(t / .09) * smooth((turn_time - t) / .09)
        walk_steps(data, t, turn_time, stride_length, 0, True, effort)
        return data
    t -= turn_time
    position = origin + direction * min(distance, t * stride_length / step_period)
    if t > travel:
        elapsed = t - travel
        end_heading = (math.tau if kitchen else 0) if home else route_heading
        data = route_pose(position, heading + (end_heading - heading) * smooth(elapsed / turn_time), route_heading)
        if home:
            effort = smooth(elapsed / .09) * smooth((turn_time - elapsed) / .09)
            walk_steps(data, elapsed, turn_time, stride_length, 0, True, effort)
        return data
    data = route_pose(position, heading, route_heading)
    effort = smooth(t / .09) * smooth((travel - t) / .09)
    bob = .012 * effort * math.sin(math.tau * 2 * t / step_period)
    offset(data, body, dy=bob)
    walk_steps(data, t, step_period, stride_length, bob, False, effort)
    data[tail, 'rotation'] = quaternion(1, .24 * effort * math.sin(math.tau * t / step_period))
    return data


def kitchen_walk(t, home=False):
    return route_walk(t, home, kitchen=True)


def eat(t):
    data = route_pose(reach, bowl_heading, bowl_heading)
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


# The bedroom rug serves as a floor-level sleeping spot, in front of the bed.
bed_heading = 1.68
bed_distance = .55
ball_heading = math.radians(120)
ball_approach = .32
chase_distance = .76
ball_gap = .75
ball_radius = .20


def add_ball():
    # A separate, unskinned prop with colored beach-ball panels.
    vertices, normals, colors = [], [], []
    palette = [(1, .63, .01), (.88, .07, .12), (.06, .32, .89), (1, .84, .18)]
    rings, slices = 12, 24

    def point(ring, side, color):
        polar, azimuth = math.pi * ring / rings, math.tau * side / slices
        normal = (math.sin(polar) * math.cos(azimuth), math.cos(polar),
                  math.sin(polar) * math.sin(azimuth))
        vertices.append(tuple(component * ball_radius for component in normal))
        normals.append(normal)
        colors.append(color)

    for ring in range(rings):
        for side in range(slices):
            color = palette[(side // (slices // len(palette))) % len(palette)]
            for row, column in ((ring, side), (ring, side + 1), (ring + 1, side),
                                (ring + 1, side), (ring, side + 1), (ring + 1, side + 1)):
                point(row, column, color)
    material = len(gltf['materials'])
    gltf['materials'].append(dict(name='Beach ball', doubleSided=True,
                                 pbrMetallicRoughness=dict(metallicFactor=0, roughnessFactor=.43)))
    mesh = len(gltf['meshes'])
    gltf['meshes'].append(dict(name='Beach ball', primitives=[dict(
        attributes=dict(POSITION=add_accessor(vertices, 'VEC3', bounds=True),
                        NORMAL=add_accessor(normals, 'VEC3'),
                        COLOR_0=add_accessor(colors, 'VEC3')), material=material)]))
    node = len(nodes)
    nodes.append(dict(name='Beach ball', mesh=mesh, scale=[0, 0, 0]))
    gltf['scenes'][0]['nodes'].append(node)
    return node


def sleep_pose(amount, closed, breath=0, stretch=0):
    data = route_pose(bed_distance, bed_heading, bed_heading)
    drop = .29 * amount
    offset(data, body, dy=-drop + breath)
    for index, (upper, paw) in enumerate(legs):
        front = index < 2
        reach_forward = (.24 if front else .10) * amount + (.18 * stretch if front else 0)
        offset(data, upper, dy=drop * .52 - breath, dz=reach_forward * .40)
        offset(data, paw, dy=drop * .48, dz=reach_forward * .60)
    data[neck, 'rotation'] = quaternion(0, .31 * amount - .13 * stretch)
    data[head, 'rotation'] = quaternion(0, .24 * amount - .21 * stretch)
    data[tail, 'rotation'] = quaternion(0, -.28 * amount)
    data[0, 'weights'] = closed
    return data


def ball_pose(data, roll=0, visible=1):
    position = ball_approach + ball_gap + roll
    dx, dz = math.sin(ball_heading), math.cos(ball_heading)
    data[ball, 'translation'] = [dx * position, -.93 + ball_radius, dz * position]
    half_angle = roll / (2 * ball_radius)
    data[ball, 'rotation'] = [dz * math.sin(half_angle), 0,
                              -dx * math.sin(half_angle), math.cos(half_angle)]
    data[ball, 'scale'] = [visible] * 3
    return data


def push_ball(t):
    contact = smooth(t / .48) * (1 - smooth((t - .49) / .45))
    data = route_pose(ball_approach, ball_heading, ball_heading)
    data[neck, 'rotation'] = quaternion(0, .76 * contact)
    data[head, 'rotation'] = quaternion(0, .42 * contact)
    return ball_pose(data, .19 * smooth((t - .43) / .5))


def chase_ball(t):
    phase = min(t / 1.05, 1)
    position = ball_approach + chase_distance * phase
    data = route_pose(position, ball_heading, ball_heading)
    effort = smooth(t / .10) * smooth((1.05 - t) / .12)
    bob = .04 * effort * math.sin(math.tau * t / .35)**2
    offset(data, body, dy=bob)
    walk_steps(data, t, .35, chase_distance / 3, bob, False, effort)
    return ball_pose(data, .19 + chase_distance * (1 - (1 - phase)**1.6))


def ball_happy(t):
    data = happy(min(t, 1.5))
    position = ball_approach + chase_distance
    offset(data, root, dx=position * math.sin(ball_heading), dz=position * math.cos(ball_heading))
    data[root, 'rotation'] = quaternion(1, ball_heading)
    return ball_pose(data, .19 + chase_distance)


def play_home(t):
    data = route_walk(t, home=True, route_heading=ball_heading,
                      distance=ball_approach + chase_distance)
    travel = (ball_approach + chase_distance) * period / stride
    return ball_pose(data, .19 + chase_distance,
                     1 - smooth((t - 2 * turn_time - travel + .31) / .30))


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
ball = add_ball()
clip('WalkToBed', turn_time + bed_distance * period / stride + blend_hold,
     lambda t: route_walk(t, route_heading=bed_heading, distance=bed_distance))
clip('LieDown', 1.05 + blend_hold,
     lambda t: sleep_pose(smooth(t / 1.05), smooth((t - .46) / .52)))
clip('Sleep', 3.6 + blend_hold,
     lambda t: sleep_pose(1, 1, .012 * math.sin(math.tau * min(t, 3.6) / 1.8)))
clip('WakeUp', 1.65 + blend_hold,
     lambda t: sleep_pose(1 - smooth((t - .37) / .93), 1 - smooth(t / .45),
                          stretch=smooth((t - .44) / .38) * (1 - smooth((t - .90) / .63))))
clip('SleepWalkHome', 2 * turn_time + bed_distance * period / stride + blend_hold,
     lambda t: route_walk(t, home=True, route_heading=bed_heading, distance=bed_distance))
clip('WalkToBall', turn_time + ball_approach * period / stride + blend_hold,
     lambda t: ball_pose(route_walk(t, route_heading=ball_heading, distance=ball_approach),
                         visible=smooth(t / .28)))
clip('PushBall', .96 + blend_hold, push_ball)
clip('ChaseBall', 1.05 + blend_hold, chase_ball)
clip('PlayHappy', 1.5 + blend_hold, ball_happy)
clip('PlayWalkHome', 2 * turn_time + (ball_approach + chase_distance) * period / stride + blend_hold,
     play_home)
def prop_material(name, color, roughness, alpha_mode='OPAQUE'):
    index = len(gltf['materials'])
    gltf['materials'].append(dict(name=name, doubleSided=True, alphaMode=alpha_mode,
                                 pbrMetallicRoughness=dict(baseColorFactor=color,
                                     metallicFactor=0, roughnessFactor=roughness)))
    return index


def ellipsoid(center, radii):
    rings, sides = 8, 16
    points, normals, indices = [], [], []
    for ring in range(rings + 1):
        theta = math.pi * ring / rings
        for side in range(sides):
            phi = math.tau * side / sides
            unit = np.array([math.sin(theta) * math.cos(phi), math.cos(theta),
                             math.sin(theta) * math.sin(phi)])
            points.append(np.asarray(center) + unit * radii)
            normal = unit / radii
            normals.append(normal / np.linalg.norm(normal))
            if ring < rings:
                a = ring * sides + side
                b = ring * sides + (side + 1) % sides
                indices.extend([a, a + sides, b, b, a + sides, b + sides])
    return points, normals, indices


def prop_mesh(name, parts, material):
    points, normals, indices = [], [], []
    for vertices_part, normals_part, indices_part in parts:
        indices.extend(len(points) + i for i in indices_part)
        points.extend(vertices_part)
        normals.extend(normals_part)
    # These small props use a 16-bit index buffer.
    while len(binary) % 4:
        binary.append(0)
    view = len(gltf['bufferViews'])
    packed = np.asarray(indices, dtype='<u2').tobytes()
    gltf['bufferViews'].append(dict(buffer=0, byteOffset=len(binary), byteLength=len(packed)))
    binary.extend(packed)
    index_accessor = len(gltf['accessors'])
    gltf['accessors'].append(dict(bufferView=view, componentType=5123, count=len(indices), type='SCALAR'))
    mesh = len(gltf['meshes'])
    gltf['meshes'].append(dict(name=name, primitives=[dict(
        attributes=dict(POSITION=add_accessor(points, 'VEC3', bounds=True),
                        NORMAL=add_accessor(normals, 'VEC3')),
        indices=index_accessor, material=material)]))
    return mesh


def prop_node(name, mesh, parent, hidden=False):
    node = len(nodes)
    nodes.append(dict(name=name, mesh=mesh, scale=[0 if hidden else 1] * 3))
    if parent is None:
        gltf['scenes'][0]['nodes'].append(node)
    else:
        nodes[parent].setdefault('children', []).append(node)
    return node


def garment(coat):
    # Open neck and hem. The coat is an open cape and leaves the collar
    # front exposed. The shirt wraps farther down the sides of the torso.
    points, normals, indices = [], [], []
    rings = ([(-.65, .36), (-.61, .40), (-.48, .43), (-.20, .43), (.02, .41), (.12, .38)]
             if coat else [(-.52, .39), (-.49, .43), (-.37, .44), (-.09, .42), (.12, .43), (.19, .41)])
    sides = 30
    for row, (depth, width) in enumerate(rings):
        for side in range(sides + 1):
            span = 1.86 if coat else 2.28
            angle = span * (2 * side / sides - 1)
            y_top = .14 if coat else .115
            # The fur arches higher toward the neck. Match that slope
            # without bringing the garment into the muzzle or medallion.
            rise = .18 * smooth((depth + .45) / .66)
            x_at = width * math.sin(angle)
            y_at = -.39 + (y_top + .39 + rise) * math.cos(angle)
            points.append((x_at, y_at, depth + .06 * math.cos(angle)) - positions[body])
            normal = np.array([math.sin(angle), math.cos(angle), -.14])
            normals.append(normal / np.linalg.norm(normal))
            if row < len(rings) - 1 and side < sides:
                a = row * (sides + 1) + side
                b = a + sides + 1
                indices.extend([a, a + 1, b, b, a + 1, b + 1])
    return points, normals, indices


for name, color, coat in [('Blue T-shirt', [.025, .26, .88, 0], False),
                          ('Yellow Raincoat', [.98, .66, .025, 0], True)]:
    material = prop_material(name, color, .46 if coat else .89, 'MASK')
    mesh = prop_mesh(name, [garment(coat)], material)
    prop_node(name, mesh, body)
    if not coat:
        for side, (upper, _) in zip((-1, 1), legs[:2]):
            sleeve = prop_mesh(f'{name} sleeve', [
                ellipsoid(np.array([side * .285, -.37, .25]) - positions[upper], [.145, .19, .155])
            ], material)
            prop_node(f'{name} sleeve', sleeve, upper)

cap_material = prop_material('Red Cap', [.78, .035, .055, 0], .8, 'MASK')
cap_mesh = prop_mesh('Red Cap', [
    ellipsoid(np.array([0., .70, .37]) - positions[head], [.23, .14, .23]),
    ellipsoid(np.array([0., .625, .59]) - positions[head], [.22, .021, .23]),
    ellipsoid(np.array([0., .835, .37]) - positions[head], [.032, .018, .035]),
], cap_material)
prop_node('Red Cap', cap_mesh, head)

bath_heading = math.radians(120)
bath_distance = .56
bath_travel = bath_distance * period / stride
bath_origin = np.array([bath_distance * math.sin(bath_heading), -.93,
                        bath_distance * math.cos(bath_heading)])
water_material = prop_material('Bath water', [.05, .55, .82, .60], .23, 'BLEND')
water = prop_node('Bath water', prop_mesh('Bath water', [
    ellipsoid((0, 0, 0), [.70, .026, .71]),
    ellipsoid((.38, .012, -.26), [.25, .014, .20]),
], water_material), None, True)
foam_material = prop_material('Bath foam', [.84, .95, 1, 1], .34)
foam_shapes = [ellipsoid((.51 * math.cos(i * 2.4), .035 + .04 * (i % 4),
                          .51 * math.sin(i * 2.4)), [.115, .09 + .025 * (i % 3), .11])
               for i in range(17)]
foam = prop_node('Bath foam', prop_mesh('Bath foam', foam_shapes, foam_material), None, True)
drop_mesh = prop_mesh('Bath droplet', [ellipsoid((0, 0, 0), [.034, .059, .034])], water_material)
drops = [prop_node(f'Bath droplet {i + 1}', drop_mesh, None, True) for i in range(9)]


def bath_pose(sit, t, washing=0, shake=0):
    data = route_pose(bath_distance, bath_heading, bath_heading)
    drop = sit * .21
    pitch = -.23 * sit
    offset(data, body, dy=-drop)
    data[body, 'rotation'] = quaternion(0, pitch)
    for i, (upper, paw) in enumerate(legs):
        lift = .12 * washing * max(0, math.sin(math.tau * 1.15 * t + i * math.pi))
        crouch = .035 if i < 2 else .17
        # Convert the desired paw target back into torso space so tilting
        # the body during the sit keeps the planted paws at floor height.
        _, py, pz = positions[paw] - positions[body]
        y_target = py + drop + (lift if i < 2 else 0)
        z_target = pz + (crouch + .065) * sit
        dy = y_target * math.cos(pitch) + z_target * math.sin(pitch) - py
        dz = -y_target * math.sin(pitch) + z_target * math.cos(pitch) - pz
        offset(data, upper, dy=dy * .58, dz=dz * .58)
        offset(data, paw, dy=dy * .42, dz=dz * .42)
    wobble = shake * math.sin(math.tau * 6 * t)
    data[neck, 'rotation'] = quaternion(0, .18 * sit + .26 * washing)
    data[head, 'rotation'] = quaternion(2, .15 * washing * math.sin(math.tau * t) + .40 * wobble)
    data[tail, 'rotation'] = quaternion(1, -.56 * wobble)
    for side, ear in zip((-1, 1), ears):
        data[ear, 'rotation'] = quaternion(2, side * .18 * washing + .32 * wobble)
    data[0, 'weights'] = max(washing * max(0, 1 - abs((t % 1.24) - .62) / .13), shake * .84)
    return data


def bath_effects(data, level, t=0, spray=0):
    for node, y, amount in [(water, .018, level), (foam, .058, level)]:
        data[node, 'translation'] = bath_origin + [0, y, 0]
        data[node, 'scale'] = [amount] * 3
    for i, node in enumerate(drops):
        phase = (t * (1.5 if spray else 1.05) + i / len(drops)) % 1
        angle = i * 2.4
        radius = (.22 + (.85 if spray else .25) * phase)
        height = (.48 if spray else .13) + (.82 if spray else .36) * math.sin(math.pi * phase)
        data[node, 'translation'] = bath_origin + [radius * math.cos(angle), height,
                                                   radius * math.sin(angle)]
        data[node, 'scale'] = [max(level, spray) * math.sin(math.pi * phase)] * 3
    return data


def sit_bath(t):
    sit = smooth(t / .85)
    return bath_effects(bath_pose(sit, t), smooth((t - .55) / .28))


def wash_bath(t):
    wash = smooth(t / .32) * (1 - smooth((t - 2.30) / .48))
    return bath_effects(bath_pose(1, t, washing=wash), 1, min(t, 2.78))


def shake_bath(t):
    shake = smooth((t - .47) / .19) * (1 - smooth((t - 1.38) / .30))
    return bath_effects(bath_pose(1 - smooth(t / .48), t, shake=shake),
                        1 - smooth(t / .51), t, spray=shake)


def dress_turn(t):
    t = min(t, 2.05)
    data = happy(min(t, 1.5))
    angle = math.tau * smooth(t / 2.05)
    data[root, 'rotation'] = quaternion(1, angle)
    effort = .78 * smooth(t / .24) * (1 - smooth((t - 1.69) / .36))
    hop = max(0, math.sin(math.pi * np.clip((t - .35) / .62, 0, 1)))**2
    walk_steps(data, t, .45, stride, .12 * hop, True, effort)
    return data


clip('WalkToBath', turn_time + bath_travel + blend_hold,
     lambda t: route_walk(t, route_heading=bath_heading, distance=bath_distance))
clip('BathSit', .85 + blend_hold, sit_bath)
clip('BathWash', 2.78 + blend_hold, wash_bath)
clip('BathShake', 1.70 + blend_hold, shake_bath)
clip('BathWalkHome', 2 * turn_time + bath_travel + blend_hold,
     lambda t: route_walk(t, home=True, route_heading=bath_heading, distance=bath_distance))
clip('DressTurn', 2.05 + blend_hold, dress_turn)

gltf['buffers'][0]['byteLength'] = len(binary)
metadata = json.dumps(gltf, separators=(',', ':')).encode()
metadata += b' ' * (-len(metadata) % 4)
dest = MODELS / 'Jerry_Baby_Animated.glb'
dest.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(metadata) + len(binary))
                 + struct.pack('<I4s', len(metadata), b'JSON') + metadata
                 + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
print(f'{dest.name}: {len(joint_nodes)} joints, {dest.stat().st_size:,} bytes')
