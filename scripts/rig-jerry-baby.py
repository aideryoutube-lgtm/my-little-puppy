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
# A local lower-muzzle morph keeps the upper muzzle and nose still as Jerry bites.
jaw = np.zeros_like(vertices)
jaw_region = ((x / .20)**2 + ((y - .055) / .105)**2)
jaw[:, 1] = -.095 * (1 - blend(jaw_region, .35, 1)) * blend(z, .56, .76)
# Carry the underweighted back of the skull and ruff into the feeding bow.
# Fade out toward the shoulders, tail, ears and muzzle.
feeding_ruff = np.zeros_like(vertices)
ruff = (blend(y, -.19, .14) * (1 - blend(y, .49, .66)) *
        blend(z, -.48, -.20) * (1 - blend(z, .10, .38)) * (1 - head_weight))
feeding_ruff[:, 1] = -.28 * ruff
feeding_ruff[:, 2] = .14 * ruff
primitive['targets'] = [dict(POSITION=add_accessor(target, 'VEC3', bounds=True))
                        for target in (eyelid, jaw, feeding_ruff)]
gltf['meshes'][0].update(weights=[0, 0, 0], extras={'targetNames': ['Blink', 'Chew', 'FeedingRuff']})
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
        values = [frame[joint, prop] for frame in frames]
        if prop == 'weights':
            values = [value if isinstance(value, tuple) else (value, 0, 0) for value in values]
            values = [weight for morph_weights in values for weight in morph_weights]
        output = add_accessor(values, kind)
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


def walk_steps(data, t, period, stride, bob, turning, effort=1, paw_clearance=.12):
    for (upper, paw), step in zip(legs, (.25, .75, 0, .5)):
        p = (t / period + step) % 1
        stance = .67
        if p < stance:
            forward = stride * (stance / 2 - p)
            lift = 0
        else:
            swing = (p - stance) / (1 - stance)
            forward = stride * stance * (smooth(swing) - .5)
            lift = paw_clearance * math.sin(math.pi * swing)**2
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
    # A small muzzle attachment follows the existing Head bone. Zero scale
    # hides it outside clips that animate the tongue.
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
strides = 5
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
    data = route_walk(t, home, kitchen=True)
    offset(data, neck)
    data[tongue, 'scale'] = [0, 0, 0]
    data[tongue, 'translation'] = nodes[tongue]['translation']
    return data


def eat(t):
    data = route_pose(reach, bowl_heading, bowl_heading)
    # First lower the muzzle, then make four sets of bites. Between sets
    # lift briefly and lick before the next bite, ending with a full head lift.
    bite_time = t - .66
    within_bites = 0 <= bite_time < 3.52
    phase = bite_time % .88
    sip_break = ((smooth((phase - .57) / .11) *
                  (1 - smooth((phase - .74) / .14))) if within_bites else 0)
    lowering = smooth(t / .62) * (1 - smooth((t - 4.0) / .48)) * (1 - .44 * sip_break)
    chewing = ((math.sin(math.tau * 3.6 * bite_time) + 1) / 2 *
               smooth(phase / .07) * (1 - smooth((phase - .46) / .13))
               if within_bites else 0)
    final_lick = math.sin(math.pi * np.clip((t - 4.43) / .34, 0, 1))**2
    lick = max(.70 * sip_break, final_lick)
    wag = smooth((t - 4.43) / .17) * (1 - smooth((t - 4.97) / .18))
    # Lower the neck from the shoulders without levering the ruff upwards.
    # The small neck drop keeps the muzzle on the bowl mark with less pitch.
    offset(data, neck, dy=-.137 * lowering, dz=-.021 * lowering)
    data[neck, 'rotation'] = quaternion(0, .23 * lowering + .025 * chewing)
    data[head, 'rotation'] = quaternion(0, .38 * lowering + .055 * chewing - .15 * lick)
    data[tongue, 'scale'] = [lick] * 3
    data[tongue, 'translation'] = [0, -.025 + .045 * lick, .49 + .062 * lick]
    data[0, 'weights'] = (.65 * lick, chewing, lowering)
    # Relax the curled tail behind the rump as Jerry lowers his head.
    tail_relax = smooth(t / .62) * (1 - smooth((t - 4.0) / .48))
    pitch = -.75 * tail_relax / 2
    yaw = .58 * wag * math.sin(math.tau * 4.5 * t) / 2
    data[tail, 'rotation'] = [
        math.sin(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw),
        math.sin(pitch) * math.sin(yaw), math.cos(pitch) * math.cos(yaw)
    ]
    return data


# Sleep uses artwork-space travel (jerry-baby-3d.js). These poses animate
# the rig locally, so mattress elevation does not change the camera framing.
bed_heading = 2.72
bed_rest_heading = 1.57
bed_exit_heading = bed_heading - math.pi
bed_turn_time = 2.2
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


def bed_stand(heading):
    return route_pose(0, heading, heading)


def bed_gait(t, duration, start, end, step_stride, turning=False, paw_clearance=.12):
    heading = start + (end - start) * smooth(t / duration) if turning else start
    data = bed_stand(heading)
    effort = smooth(t / .12) * smooth((duration - t) / .12)
    bob = .018 * effort * math.sin(math.tau * 2 * t / period)
    offset(data, body, dy=bob)
    walk_steps(data, t, period, step_stride, bob, turning, effort, paw_clearance)
    return data


def approach_bed(t):
    if t < .5:
        return bed_gait(t, .5, 0, bed_heading, 0, True)
    return bed_gait(t - .5, 2.8, bed_heading, bed_heading, .43)


def bed_crouch(amount):
    data = bed_stand(bed_heading)
    offset(data, body, dy=-.21 * amount, dz=-.10 * amount)
    for index, (upper, paw) in enumerate(legs):
        offset(data, upper, dy=.13 * amount, dz=.10 * amount)
        offset(data, paw, dy=.08 * amount)
    data[neck, 'rotation'] = quaternion(0, -.17 * amount)
    return data


def mattress_contact(heading, front=True, weight=1):
    data = bed_stand(heading)
    offset(data, body, dy=-.10 * weight)
    for index, (upper, paw) in enumerate(legs):
        lift = .22 * weight if (index < 2) != front else 0
        offset(data, upper, dy=.10 * weight + lift * .55)
        offset(data, paw, dy=lift * .45, dz=.13 * weight if index < 2 else -.08 * weight)
    data[neck, 'rotation'] = quaternion(0, .20 * weight)
    return data


def blend_pose(start, end, weight):
    return {key: (left + (end[key] - left) * weight if isinstance(left, (float, int))
                  else [a + (b - a) * weight for a, b in zip(left, end[key])])
            for key, left in start.items()}


def bed_jump(t, duration, heading, departure, arrival):
    phase = t / duration
    flight = bed_stand(heading)
    offset(flight, body, dy=.13, dz=.10)
    for index, (upper, paw) in enumerate(legs):
        offset(flight, upper, dy=.07 if index < 2 else -.10, dz=.15 if index < 2 else -.19)
        offset(flight, paw, dy=.12 if index < 2 else -.04, dz=.10 if index < 2 else -.10)
    flight[neck, 'rotation'] = quaternion(0, -.28 if heading == bed_heading else .26)
    if phase < .38:
        return blend_pose(departure, flight, smooth(phase / .38))
    return blend_pose(flight, arrival, smooth((phase - .38) / .62))


def settle_on_bed(t):
    if t < .85:
        return bed_gait(t, .85, bed_heading, bed_heading, .25)
    return bed_gait(t - .85, bed_turn_time, bed_heading, bed_rest_heading + 2 * math.tau, 0, True)


def leave_bed(t):
    if t < .52:
        return bed_gait(t, .52, bed_rest_heading, bed_exit_heading, 0, True)
    return bed_gait(t - .52, .85, bed_exit_heading, bed_exit_heading, .25)


def sleep_walk_home(t):
    if t < .26:
        return mattress_contact(bed_exit_heading, weight=1 - smooth(t / .26))
    if t < 3.06:
        return bed_gait(t - .26, 2.8, bed_exit_heading, bed_exit_heading, .43)
    return bed_gait(t - 3.06, .5, bed_exit_heading, 0, 0, True)


def sleep_pose(amount, closed, breath=0, stretch=0, dream_time=0):
    data = bed_stand(bed_rest_heading)
    drop = .49 * amount
    # Tuck the hind legs, stretch the forepaws and curl the head toward
    # the chest. Oppose torso movement at the legs to keep the paws planted.
    offset(data, body, dy=-drop + breath)
    for index, (upper, paw) in enumerate(legs):
        front = index < 2
        reach_forward = (.30 if front else .18) * amount + (.16 * stretch if front else 0)
        offset(data, upper, dy=drop * .55 - breath, dz=reach_forward * .40)
        offset(data, paw, dy=drop * .45, dz=reach_forward * .60)
    data[neck, 'rotation'] = quaternion(0, .69 * amount - .22 * stretch)
    data[head, 'rotation'] = quaternion(0, -.16 * amount)
    tail_twitch = math.sin(math.tau * dream_time / 2.4) * .07
    data[tail, 'rotation'] = quaternion(0, -.36 * amount + tail_twitch)
    for index, ear in enumerate(ears):
        flick = math.sin(math.pi * np.clip((dream_time - .7 - .24 * index) / .36, 0, 1))**2
        data[ear, 'rotation'] = quaternion(2, (-1)**index * .11 * flick)
    data[0, 'weights'] = closed
    return data


def lie_down(t):
    return sleep_pose(smooth(t / 1.12), smooth((t - .52) / .56))


def wake_up(t):
    return sleep_pose(1 - smooth((t - .22) / 1.32), 1 - smooth(t / .42),
                      stretch=smooth((t - .46) / .42) * (1 - smooth((t - 1.13) / .54)))


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
clip('Eat', 5.16 + blend_hold, eat)
clip('WalkHome', 2 * turn_time + travel_time + blend_hold,
     lambda t: kitchen_walk(min(t, 2 * turn_time + travel_time), home=True))
ball = add_ball()
clip('ApproachBed', 3.3, approach_bed)
clip('Crouch', .46, lambda t: bed_crouch(smooth(t / .46)))
clip('JumpUp', .64, lambda t: bed_jump(t, .64, bed_heading, bed_crouch(1), mattress_contact(bed_heading)))
clip('LandOnMattress', .30, lambda t: mattress_contact(bed_heading, weight=1 - smooth(t / .30)))
clip('SettleOnMattress', .85 + bed_turn_time, settle_on_bed)
clip('LieDown', 1.12, lie_down)
clip('Sleep', 4.8,
     lambda t: sleep_pose(1, 1, .012 * math.sin(math.tau * t / 2.4), dream_time=t))
clip('WakeUp', 1.75, wake_up)
clip('WalkToBedEdge', 1.37, leave_bed)
clip('JumpDown', .56, lambda t: bed_jump(t, .56, bed_exit_heading, bed_stand(bed_exit_heading),
                                        mattress_contact(bed_exit_heading)))
clip('SleepWalkHome', 3.56, sleep_walk_home)
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


def solid(points, faces):
    vertices, normals = [], []
    for a, b, c in faces:
        normal = np.cross(np.subtract(points[b], points[a]), np.subtract(points[c], points[a]))
        normal = normal / np.linalg.norm(normal)
        vertices.extend([points[a], points[b], points[c]])
        normals.extend([normal] * 3)
    return vertices, normals, list(range(len(vertices)))


# House clips animate the existing skeleton in place. The garden renderer
# follows the painted doorway in screen space using these phase timings.
house_heading = math.radians(210)
house_outward = house_heading + math.pi
house_walk_time = 7 * period
house_entry_time = period * 3


def house_walk(t, home=False, duration=house_walk_time):
    # Garden camera azimuth supplies the heading for the live start point.
    if t < .5:
        return bed_gait(t, .5, 0, 0, 0, True)
    t -= .5
    if t < duration:
        return bed_gait(t, duration, 0, 0, .58, paw_clearance=.20)
    return bed_gait(t - duration, .5 if home else .24, 0, 0, 0, True)


def house_door(t, exiting=False):
    heading = house_outward if exiting else house_heading
    gait_time = t - .25
    data = bed_gait(gait_time, house_entry_time, heading, heading, .39, paw_clearance=.18)
    duck = smooth(t / .25) * (1 - smooth((gait_time - house_entry_time + .25) / .25))
    # Add the duck to the gait pose so it preserves each paw's lift and stride.
    data[body, 'translation'][1] -= .09 * duck
    for upper, paw in legs:
        data[upper, 'translation'][1] += .05 * duck
        data[paw, 'translation'][1] += .04 * duck
    data[neck, 'rotation'] = quaternion(0, .48 * duck)
    data[head, 'rotation'] = quaternion(0, .17 * duck)
    return data


def house_rest(t):
    if t < .58:
        return bed_gait(t, .58, house_heading, house_outward, 0, True)
    t -= .58
    crouch = smooth(t / .62) * (1 - smooth((t - 2.9) / .64))
    breath = crouch * .018 * math.sin(math.tau * t / 1.12)
    data = sleep_pose(crouch, crouch, breath=breath)
    data[root, 'rotation'] = quaternion(1, house_outward)
    return data


def house_stretch(t):
    amount = math.sin(math.pi * min(t / 1.28, 1))**2
    data = bed_stand(house_outward)
    offset(data, body, dy=-.12 * amount)
    for upper, paw in legs:
        offset(data, upper, dy=.08 * amount)
        offset(data, paw, dy=.04 * amount)
    for upper, paw in legs[:2]:
        offset(data, upper, dy=.05 * amount, dz=.16 * amount)
        offset(data, paw, dy=.07 * amount, dz=.12 * amount)
    data[neck, 'rotation'] = quaternion(0, .36 * amount)
    data[head, 'rotation'] = quaternion(0, -.19 * amount)
    data[tail, 'rotation'] = quaternion(0, -.38 * amount)
    return data


clip('WalkToHouse', .5 + house_walk_time + .24, house_walk)
clip('EnterHouse', .25 + house_entry_time, house_door)
clip('RestInside', .58 + 3.54, house_rest)
clip('ExitHouse', .25 + house_entry_time, lambda t: house_door(t, exiting=True))
clip('Stretch', 1.28, house_stretch)
clip('HouseWalkHome', .5 + house_walk_time + .5, lambda t: house_walk(t, home=True))


def annulus(inner, outer, low, high):
    points = [(r * math.cos(math.tau * i / 24), y, r * math.sin(math.tau * i / 24))
              for r, y in [(inner, high), (outer, high), (outer * .91, low), (inner * .90, low)]
              for i in range(24)]
    faces = []
    for row in range(4):
        for i in range(24):
            a, b = row * 24 + i, row * 24 + (i + 1) % 24
            c, d = (a + 24) % 96, (b + 24) % 96
            faces.extend([(a, b, c), (b, d, c)])
    return solid(points, faces)


drink_heading = math.radians(150)
drink_distance = 1.25
water_position = np.array([(drink_distance + .58) * math.sin(drink_heading), -.93,
                           (drink_distance + .58) * math.cos(drink_heading)])
ceramic = prop_material('Water bowl blue ceramic', [.055, .28, .52, 1], .27)
surface = prop_material('Drinking water', [.14, .61, .80, 1], .21)
ripple_material = prop_material('Water ripple', [.55, .84, .94, .72], .33, 'BLEND')
drink_bowl = prop_node('Blue water bowl', prop_mesh('Blue water bowl', [
    annulus(.265, .32, 0, .20), ellipsoid((0, .025, 0), [.283, .025, .283])
], ceramic), None, True)
drink_surface = prop_node('Water surface', prop_mesh('Water surface', [
    ellipsoid((0, .153, 0), [.263, .012, .263])
], surface), None, True)
ripple_mesh = prop_mesh('Water ripple', [annulus(.239, .26, -.001, .001)], ripple_material)
ripples = [prop_node(f'Water ripple {i + 1}', ripple_mesh, None, True) for i in range(2)]


def with_water(data, t=None):
    for node in (drink_bowl, drink_surface):
        data[node, 'translation'] = water_position
        data[node, 'scale'] = [1, 1, 1]
    for i, node in enumerate(ripples):
        elapsed = t - .85 - i * .24 if t is not None else -1
        phase = (elapsed % .48) / .48
        strength = math.sin(math.pi * phase)**.5 if 0 <= elapsed <= 1.92 else 0
        data[node, 'translation'] = water_position + [0, .170, 0]
        data[node, 'scale'] = [(.23 + .70 * phase) * strength, strength,
                               (.23 + .70 * phase) * strength]
    return data


def drink_water(t):
    data = route_pose(drink_distance, drink_heading, drink_heading)
    lower = smooth(t / .68) * (1 - smooth((t - 2.64) / .62))
    lap = math.sin(math.pi * ((t - .73) % .24) / .24)**4 if .73 <= t <= 2.65 else 0
    data[neck, 'rotation'] = quaternion(0, .74 * lower)
    data[head, 'rotation'] = quaternion(0, .70 * lower + .08 * lap)
    data[tongue, 'translation'] = [0, -.026, .49 + .11 * lap]
    data[tongue, 'scale'] = [lap] * 3
    data[tail, 'rotation'] = quaternion(1, .12 * lower * math.sin(math.tau * t))
    return with_water(data, t)


def lick_lips(t):
    data = route_pose(drink_distance, drink_heading, drink_heading)
    lick = math.sin(math.pi * min(t / .63, 1))**2
    data[head, 'rotation'] = quaternion(0, -.15 * lick)
    data[tongue, 'translation'] = [0, -.026 + .07 * lick, .49 + .072 * lick]
    data[tongue, 'scale'] = [lick] * 3
    data[0, 'weights'] = .75 * lick
    return with_water(data)


drink_walk_time = drink_distance * period / stride
clip('WalkToWater', turn_time + drink_walk_time + blend_hold,
     lambda t: with_water(route_walk(t, route_heading=drink_heading, distance=drink_distance)))
clip('DrinkWater', 3.26 + blend_hold, drink_water)
clip('LickLips', .63 + blend_hold, lick_lips)
clip('DrinkWalkHome', 2 * turn_time + drink_walk_time + blend_hold,
     lambda t: with_water(route_walk(t, home=True, route_heading=drink_heading, distance=drink_distance)))

# Use complete gait cycles at a fixed cadence for different lawn distances.
for cycles in (4, 5, 6, 8, 9, 10, 11):
    travel_time = cycles * period
    clip(f'WalkToHouse{cycles}', .5 + travel_time + .24,
         lambda t: house_walk(t, duration=travel_time))
    clip(f'HouseWalkHome{cycles}', .5 + travel_time + .5,
         lambda t: house_walk(t, home=True, duration=travel_time))


gltf['buffers'][0]['byteLength'] = len(binary)
metadata = json.dumps(gltf, separators=(',', ':')).encode()
metadata += b' ' * (-len(metadata) % 4)
dest = MODELS / 'Jerry_Baby_Animated.glb'
dest.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(metadata) + len(binary))
                 + struct.pack('<I4s', len(metadata), b'JSON') + metadata
                 + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
print(f'{dest.name}: {len(joint_nodes)} joints, {dest.stat().st_size:,} bytes')
