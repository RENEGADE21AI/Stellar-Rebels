"""Model and render the Stellar Rebels orthographic sprite workbench in Blender."""

import argparse
from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Quaternion, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source-art' / 'stellar' / 'blender'
OUT = ROOT / 'arcade' / 'media' / 'sprites'
SOURCE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--batch', choices=('slice', 'fleet', 'cover'), default='slice')
parser.add_argument('--samples', type=int, default=20)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0


def surface_map(mat, shader, category):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coords = nodes.new('ShaderNodeTexCoord')
    grain = nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 42
    grain.inputs['Detail'].default_value = 3
    links.new(coords.outputs['Object'], grain.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .055 if category == 'glass' else .15 if category == 'ivory' else .25
    bump.inputs['Distance'].default_value = .009 if category == 'glass' else .027 if category == 'ivory' else .038
    links.new(grain.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    range_node = nodes.new('ShaderNodeMapRange')
    roughness = shader.inputs['Roughness'].default_value
    range_node.inputs['To Min'].default_value = .095 if category == 'glass' else max(.12, roughness - .16)
    range_node.inputs['To Max'].default_value = .235 if category == 'glass' else roughness + .20
    if category == 'glass':
        shader.inputs['Coat Weight'].default_value = .58
        shader.inputs['Coat Roughness'].default_value = .12
    links.new(grain.outputs['Fac'], range_node.inputs['Value'])
    links.new(range_node.outputs['Result'], shader.inputs['Roughness'])

    file = SOURCE / 'materials' / (category + '.jpg')
    if not file.exists():
        return
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(file), check_existing=True)
    tex.image.pack()
    tex.extension = 'REPEAT'
    tex.projection = 'BOX'
    tex.projection_blend = .15
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (.44, .44, .44) if category == 'graphite' else (.49, .49, .49)
    links.new(coords.outputs['Object'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    blend = nodes.new('ShaderNodeMixRGB')
    blend.blend_type = 'MIX'
    blend.inputs[0].default_value = .30 if category == 'glass' else .64
    blend.inputs[1].default_value = shader.inputs['Base Color'].default_value
    links.new(tex.outputs['Color'], blend.inputs[2])
    links.new(blend.outputs[0], shader.inputs['Base Color'])


def material(name, color, metal=.45, rough=.32, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    elif not name.endswith('broad erosion'):
        if 'ceramic' in name or 'pearl' in name:
            category = 'ivory'
        elif 'blue polarized' in name:
            category = 'glass'
        elif any(part in name for part in ('copper', 'flight orange', 'oxide', 'brass')):
            category = 'copper'
        else:
            category = 'graphite'
        surface_map(mat, shader, category)
    return mat


IVORY = material('Enamel / ceramic ivory', (.62, .58, .49), .22, .31)
PALE = material('Enamel / pearl gray', (.35, .41, .44), .41, .30)
TITAN = material('Alloy / cold titanium', (.084, .11, .14), .73, .30)
DARK = material('Alloy / graphite', (.023, .028, .034), .65, .34)
JOINT = material('Alloy / polished bevel', (.27, .33, .36), .73, .23)
EMBER = material('Paint / flight orange', (.52, .096, .025), .42, .32)
COPPER = material('Alloy / hot cast copper', (.20, .056, .031), .73, .33)
CARMINE = material('Enamel / Dominion oxide', (.24, .028, .026), .52, .32)
BRASS = material('Alloy / signal brass', (.38, .20, .07), .68, .28)
CANOPY = material('Optics / blue polarized', (.035, .15, .235), .76, .22)
TURQUOISE = material('Reactor / ion cyan', (.015, .66, .78), .26, .25, 2.5)
ALERT = material('Reactor / coral red', (.96, .052, .014), .20, .25, 2.0)
AMBER = material('Reactor / amber', (.96, .27, .02), .25, .23, 1.95)
PLUM = material('Alloy / deep plum', (.21, .102, .27), .62, .31)
VIOLET = material('Reactor / lilac', (.49, .20, 1.0), .28, .25, 2.4)
JADE = material('Reactor / sea glass', (.10, .87, .55), .28, .22, 2.4)
ICE = material('Reactor / high blue', (.13, .50, 1), .28, .25, 2.8)

scene = None
group = None
facing = 1
renders = []


def object_mesh(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name + ' mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def aim(obj, target=(0, 0, 0)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def light(name, position, energy, color, size, target=(0, 0, 0)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color, data.shape, data.size = energy, color, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    aim(obj, target)


def begin(name, scale=4.8, pixels=256, enemy=False, landscape=False):
    global scene, group, facing
    facing = -1 if enemy else 1
    scene = bpy.data.scenes.new(name)
    group = bpy.data.collections.new(name + ' / original model')
    scene.collection.children.link(group)
    world = bpy.data.worlds.new(name + ' world')
    world.use_nodes = True
    bg = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    bg.inputs[0].default_value = (.09, .12, .18, 1) if not landscape else (.013, .02, .034, 1)
    bg.inputs[1].default_value = .19 if not landscape else .08
    scene.world = world
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = pixels if isinstance(pixels, tuple) else (pixels, pixels)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = not landscape
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - High Contrast'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    camera = bpy.data.objects.new('Orthographic game camera', bpy.data.cameras.new('Orthographic game camera'))
    scene.collection.objects.link(camera)
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = scale
    camera.location = (0, -1.45, 10) if not landscape else (0, 0, 18)
    aim(camera)
    scene.camera = camera
    if not landscape:
        light('Grazing softbox', (-4, 4, 5.7), 1100, (1, .88, .75), 4.1)
        light('Blue starboard fill', (4.6, -1, 4.7), 525, (.51, .73, 1), 3)
        light('Aft rim', (1.2, -5, 3), 820, (1, .54, .32), 2.2)
    renders.append((name, scene))


def armor(name, points, z, thickness, primary, side=None, bevel=.043):
    if sum(a[0]*b[1] - b[0]*a[1] for a, b in zip(points, (*points[1:], points[0]))) < 0:
        points = tuple(reversed(points))
    layer = [(x * facing, y * facing) for x, y in points]
    count = len(layer)
    vertices = [(x, y, zz) for zz in (z-thickness, z) for x, y in layer]
    faces = [list(reversed(range(count))), list(range(count, count * 2))]
    faces += [(i, (i+1)%count, (i+1)%count+count, i+count) for i in range(count)]
    obj = object_mesh(name, vertices, faces, primary)
    if side is not None:
        obj.data.materials.append(side)
        for face in obj.data.polygons[2:]:
            face.material_index = 1
    if bevel:
        modifier = obj.modifiers.new('Machined edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3
        modifier.harden_normals = True
        normals = obj.modifiers.new('Weighted panels', 'WEIGHTED_NORMAL')
        normals.keep_sharp = True
    return obj


def tile(name, x, y, width, length, z, thickness, mat, taper=0, bevel=.04):
    a, b = width/2, length/2
    outline = ((x-a, y-b), (x+a, y-b), (x+a-taper, y+b), (x-a+taper, y+b))
    return armor(name, outline, z, thickness, mat, bevel=bevel)


def mirror(points, side):
    return tuple((x*side, y) for x, y in points)


def circle(x, y, radius, sides=24):
    return tuple((x + radius*cos(a*2*pi/sides), y + radius*sin(a*2*pi/sides)) for a in range(sides))


def loop(name, x, y, r, width, z, mat, count=32):
    outer, inner = circle(x,y,r,count), circle(x,y,r-width,count)
    vertices = [(xx*facing, yy*facing, z) for xx, yy in (*outer, *inner)]
    faces = [(i, (i+1)%count, (i+1)%count+count, i+count) for i in range(count)]
    obj = object_mesh(name, vertices, faces, mat)
    solid = obj.modifiers.new('Thickness', 'SOLIDIFY')
    solid.thickness = .055
    return obj


def vents(x, y, width, z, count, tint=DARK):
    for i in range(count):
        tile(f'Cooling channel {i+1}', x, y + .13*i, width, .055, z, .031, tint, bevel=.012)


def pipe(name, start, end, outside, inside, mat, cap=None, facets=14):
    a = Vector((start[0]*facing,start[1]*facing,start[2]))
    b = Vector((end[0]*facing,end[1]*facing,end[2]))
    normal = (b-a).normalized()
    right = normal.cross(Vector((0,0,1)))
    if right.length < .001:
        right = normal.cross(Vector((0,1,0)))
    right.normalize()
    up = normal.cross(right)
    verts = []
    for centre,radius in ((a,outside),(b,outside*.92),(b,inside),(b.lerp(a,.42),inside)):
        for i in range(facets):
            theta = 2*pi*i/facets
            verts.append(tuple(centre + (right*cos(theta) + up*sin(theta))*radius))
    faces = []
    for ring_index in range(3):
        base = facets * ring_index
        faces += [(base+i, base+(i+1)%facets, base+(i+1)%facets+facets, base+i+facets) for i in range(facets)]
    faces.append(tuple(range(3*facets,4*facets)))
    obj = object_mesh(name,verts,faces,mat)
    if cap:
        obj.data.materials.append(cap)
        obj.data.polygons[-1].material_index = 1
    return obj


def fasteners(points, z, size=.04, alloy=JOINT):
    for index,(x,y) in enumerate(points):
        armor(f'Hex fastener {index+1}',circle(x,y,size,6),z,.043,alloy,DARK,.009)


def engine(x, y, width, reactor=TURQUOISE):
    tile('Thrust bell / housing', x, y+.10, width,.51,.26,.35,TITAN,taper=.05)
    pipe('Thrust bell / sculpted nozzle', (x,y+.09,.11),(x,y-.43,.09),width*.50,width*.31,JOINT,reactor)
    pipe('Drive ajutage', (x,y-.31,.09),(x,y-.45,.075),width*.43,width*.31,DARK,reactor)
    tile('Notched drive strip', x, y-.26, width*.42, .095, .278, .07, reactor, taper=.025, bevel=.02)


def canopy(points, z=.46):
    armor('Pressure glazing', points, z, .19, CANOPY, JOINT, bevel=.055)
    tile('Canopy spine', 0, .25, .038, .50, z+.012, .028, JOINT, bevel=.008)


def kestrel(cover=False):
    begin('title-craft' if cover else 'kestrel', 4.85 if cover else 4.24, 920 if cover else 420)
    if cover:
        c = scene.camera
        c.location = (4.3, 3.4, 7.2)
        aim(c, (0, 0, .22))
        c.rotation_mode = 'QUATERNION'
        c.rotation_quaternion = c.rotation_euler.to_quaternion() @ Quaternion((0, 0, 1), -.43)
        light('Sunset reflection',(-7,2.4,1.6),580,(1,.34,.14),4)
    armor('Kestrel central fuselage', ((0,1.84),(.32,1.24),(.53,.41),(.44,-1.21),(.20,-1.55),(-.20,-1.55),(-.44,-1.21),(-.53,.41),(-.32,1.24)), .34,.43, IVORY,TITAN)
    armor('Underframe spine', ((0,1.73),(.22,1.23),(.30,.55),(.42,.23),(.35,-1.62),(-.35,-1.62),(-.42,.23),(-.30,.55),(-.22,1.23)),.255,.51,DARK,TITAN,.065)
    for side in (-1,1):
        outline = ((.35,.67),(.96,.51),(1.74,-1.28),(1.60,-1.54),(.88,-.82),(.48,-.93))
        armor('Swept wing structural spar', mirror(outline,side), .09,.29,TITAN,DARK)
        armor('Swept wing / ceramic plate', mirror(((.48,.57),(.98,.42),(1.66,-1.28),(1.53,-1.33),(.87,-.66),(.56,-.76)),side), .22,.19,IVORY,JOINT)
        armor('Wing layered shoulder',mirror(((.57,.57),(.96,.46),(1.24,-.11),(1.01,-.21),(.73,.08),(.53,.17)),side),.292,.18,PALE,DARK,.042)
        armor('Cutaway trailing plate',mirror(((.88,-.64),(1.13,-.67),(1.54,-1.33),(1.41,-1.26),(1.01,-.87)),side),.192,.14,DARK,TITAN,.035)
        armor('Swept outer edge cap',mirror(((1.14,-.56),(1.36,-.77),(1.76,-1.35),(1.60,-1.53),(1.49,-1.29),(1.38,-1.03)),side),.27,.18,PALE,JOINT,.044)
        armor('Wing deflection ridge',mirror(((.93,.17),(1.01,.13),(1.34,-.80),(1.26,-.82),(1.06,-.38)),side),.27,.082,TITAN,JOINT,.019)
        armor('Lower heat sink',mirror(((.61,-.56),(.87,-.53),(.97,-1.04),(.80,-1.19),(.56,-.97)),side),.32,.29,TITAN,DARK,.043)
        vents(.72*side,-.99,.15,.343,3,JOINT)
        armor('Wing flight marking', mirror(((.89,-.47),(1.22,-.46),(1.41,-.79),(1.10,-.78)),side), .244,.04,EMBER,bevel=.013)
        tile('Inboard intake', .70*side, -.20, .38,.82,.41,.34,JOINT,.062)
        tile('Inboard intake throat', .70*side, -.16, .24,.59,.427,.062,DARK,.036)
        vents(.70*side,-.32,.19,.443,3,TITAN)
        engine(.70*side,-1.06,.38)
        tile('Pulse hardpoint', .68*side,.66,.125,.59,.26,.20,DARK,.009)
        tile('Charged muzzle', .68*side,.93,.085,.15,.286,.10,TURQUOISE,bevel=.015)
        pipe('Parallel cannon bore',(.68*side,.64,.205),(.68*side,1.075,.211),.072,.052,TITAN,TURQUOISE,12)
        tile('Running light',.49*side,-.63,.053,.34,.353,.048,TURQUOISE,taper=.013,bevel=.012)
        fasteners(mirror(((.114,1.18),(.29,.46),(.95,.09),(1.18,-.48),(1.48,-1.17),(.84,-.43)),side),.291,.036,DARK)
    tile('Nose flight stripe',0,1.25,.15,.63,.365,.039,EMBER,.024,bevel=.014)
    canopy(((0,1.02),(.24,.66),(.25,.13),(.15,-.33),(-.15,-.33),(-.25,.13),(-.24,.66)), .53)
    armor('Raised forward armor',((0,1.78),(.24,1.17),(.22,.83),(.12,.72),(-.12,.72),(-.22,.83),(-.24,1.17)),.386,.22,IVORY,TITAN,.033)
    tile('Recessed nose array',0,1.32,.093,.40,.405,.083,JOINT,taper=.019,bevel=.018)
    tile('Nose alignment light',0,1.45,.022,.24,.414,.028,TURQUOISE,.005,.009)
    armor('Center service cover', ((-.15,-.46),(.15,-.46),(.16,-1.21),(-.16,-1.21)), .40,.09,PALE,JOINT)


def scout():
    begin('scout', 3.9, 232, enemy=True)
    armor('Scout arris', ((0,1.52),(.45,.70),(.63,.18),(1.55,-.62),(1.41,-1.15),(.88,-.99),(.42,-.65),(0,-1.18),(-.42,-.65),(-.88,-.99),(-1.41,-1.15),(-1.55,-.62),(-.63,.18),(-.45,.70)), .25,.38,CARMINE,DARK)
    for side in (-1,1):
        armor('Split serrated wing', mirror(((.46,.44),(.79,.32),(1.57,-.56),(1.41,-.82),(.91,-.51),(.51,-.42)),side), .35,.17,TITAN,DARK)
        armor('Oxide plate', mirror(((.58,.28),(.84,.12),(1.30,-.49),(1.13,-.54),(.80,-.27),(.65,-.21)),side), .42,.10,CARMINE,JOINT)
        armor('Overlapping shield veneer',mirror(((.88,.05),(1.14,-.04),(1.46,-.41),(1.37,-.49),(1.05,-.27)),side),.423,.195,DARK,JOINT,.032)
        tile('Wing warning lumen',.83*side,-.19,.07,.23,.464,.03,ALERT,bevel=.011)
        fasteners(mirror(((.45,.05),(.75,-.27),(1.05,-.38)),side),.452,.045,TITAN)
        engine(.57*side,-.79,.30,ALERT)
    armor('Scout flight deck', ((0,1.42),(.28,.84),(.34,-.46),(0,-.81),(-.34,-.46),(-.28,.84)), .51,.19,DARK,JOINT)
    tile('Scout retinal emitter',0,.40,.24,.29,.54,.065,ALERT,.06,.025)


def lancer():
    begin('lancer', 4.15, 250, enemy=True)
    armor('Lancer launch magazine', ((-.73,.47),(.73,.47),(.91,-1.10),(.61,-1.50),(-.62,-1.50),(-.91,-1.12)), .25,.35,DARK,TITAN)
    for side in (-1,1):
        armor('Pincer rail body', mirror(((.47,-1.24),(.96,-1.11),(1.20,-.72),(1.18,.02),(1.06,.63),(.81,1.49),(.71,1.69),(.54,1.38),(.49,.89),(.58,.35),(.47,.04)),side), .41,.51,TITAN,JOINT,.06)
        armor('Angular shoulder and coolant flange',mirror(((.81,-1.08),(1.15,-.80),(1.15,-.29),(.95,-.15),(.72,-.46)),side),.527,.232,DARK,JOINT,.052)
        armor('Forward chrome rail vane',mirror(((.72,.13),(.98,.42),(.81,1.23),(.64,1.36),(.62,1.02)),side),.517,.219,JOINT,TITAN,.039)
        tile('Exposed cooling array', .84*side,-.54,.33,.68,.550,.19,COPPER,.036)
        vents(.84*side,-.78,.26,.572,5,DARK)
        tile('Hot shoe rail', .68*side,.89,.11,1.19,.48,.19,ALERT,.02)
        pipe('Rail structural barrel',(.73*side,.28,.25),(.73*side,1.57,.28),.147,.094,DARK,ALERT)
        for y in (.50,.79,1.05):
            tile('Rail mounting boss',.75*side,y,.34,.088,.482,.20,TITAN,bevel=.024)
        tile('Weapon energized contact',.60*side,1.00,.059,.56,.53,.055,ALERT,taper=.012,bevel=.016)
        pipe('Rail cooling tube',(side*.51,-.93,.29),(side*.47,.33,.31),.063,.04,COPPER,DARK)
        engine(.58*side,-1.17,.37,AMBER)
    tile('Central targeting housing',0,-.15,.63,.84,.50,.36,DARK,.07)
    armor('Triangular targeting element', ((-.20,-.05),(0,.32),(.20,-.05),(0,-.19)),.55,.085,AMBER,bevel=.022)


def diver():
    begin('diver', 3.82, 238, enemy=True)
    armor('Diver knife hull', ((-.57,-1.22),(-.51,.21),(-.30,1.20),(0,1.76),(.32,1.06),(.44,.41),(.53,-1.14),(0,-1.44)),.29,.41,COPPER,DARK)
    for side in (-1,1):
        armor('Diver outboard scythe',mirror(((.32,-.56),(.69,-.29),(1.06,-1.04),(.95,-1.33),(.54,-1.18),(.40,-.87)),side),.17,.20,EMBER,TITAN)
        tile('Burst inlet', .22*side,.47,.112,.83,.36,.06,BRASS,.018,.018)
    canopy(((0,.99),(.24,.53),(.20,-.34),(0,-.65),(-.20,-.34),(-.24,.53)), .48)
    engine(0,-1.17,.42,ALERT)


def relay():
    begin('relay', 4.4, 288, enemy=True)
    hull = ((-.64,1.28),(.64,1.28),(.98,.44),(.91,-.96),(.54,-1.26),(-.54,-1.26),(-.91,-.96),(-.98,.44))
    armor('Linker horizontal command bus',hull,.41,.52,PLUM,DARK,.07)
    for side in (-1,1):
        spine = ((.70,-.95),(1.35,-.63),(1.56,.36),(1.25,1.17),(.92,.64))
        armor('Sweep antenna outrigger',mirror(spine,side),.32,.32,JOINT,DARK,.045)
        tile('Antenna charge strip',side*1.28,.36,.14,.60,.36,.08,VIOLET,.02,.02)
        engine(side*.53,-.92,.43,ICE)
        tile('Frame diagonal',side*.69,-.29,.12,.88,.47,.20,PALE,.022)
    armor('Raised radio antenna',circle(0,.19,.73,8),.57,.29,DARK,JOINT,.055)
    loop('Linker oscillator ring',0,.19,.57,.087,.611,VIOLET,24)
    tile('Transponder cage',0,.18,.17,.60,.66,.15,TITAN,bevel=.038)


def gatekeeper():
    begin('gatekeeper', 8.75, 440, enemy=True)
    armor('Gatekeeper central bulkhead', ((-2.2,-.69),(-.99,-1.50),(1.03,-1.50),(2.22,-.65),(1.86,.79),(1.20,1.53),(-1.18,1.53),(-1.88,.79)), .42,.70,DARK,TITAN,.095)
    armor('Reinforced reactor spine', ((-1.59,-.68),(-.98,-1.30),(.98,-1.30),(1.59,-.68),(1.26,.77),(.69,1.52),(-.69,1.52),(-1.26,.77)), .557,.63,TITAN,JOINT,.084)
    for side in (-1,1):
        scythe = ((.92,-1.10),(1.59,-1.42),(2.64,-1.03),(3.44,-.28),(3.91,.67),(3.59,1.62),(3.13,2.22),(3.08,1.28),(2.66,.73),(1.92,.47),(1.31,.25))
        armor('Orbital fortress scythe', mirror(scythe, side), .49,.70,COPPER,DARK,.11)
        for i, outline in enumerate((
            ((1.42,-1.12),(2.30,-.94),(2.76,-.62),(2.63,-.14),(1.81,-.51),(1.39,-.49)),
            ((2.83,-.65),(3.44,-.15),(3.70,.48),(3.38,.59),(2.94,.29),(2.72,-.11)),
            ((3.43,.77),(3.68,.74),(3.53,1.45),(3.25,1.90),(3.27,1.12)),
        )):
            armor(f'Copper sector {i+1}', mirror(outline, side), .65,.22,BRASS if i==0 else COPPER,JOINT,.065)
        for j, points in enumerate((
            ((1.68,-.92),(2.08,-.80),(2.36,-.61),(2.28,-.30),(1.75,-.49)),
            ((2.42,-.26),(2.64,-.36),(2.97,-.19),(3.28,.39),(3.02,.38),(2.75,.10)),
            ((3.44,.64),(3.65,.70),(3.49,1.43),(3.32,1.70),(3.33,1.19)),
        )):
            armor(f'Stepped armor tile {j+1}',mirror(points,side),.744,.28,TITAN,JOINT,.043)
        pipe('Heavy reactor line', (side*1.39,-.49,.25),(side*1.88,.32,.40),.115,.075,COPPER,DARK)
        pipe('Aft cable bundle', (side*2.30,-.76,.29),(side*2.75,-.11,.35),.095,.060,JOINT,DARK)
        pipe('Heavy mount piston',(side*2.12,-.14,.10),(side*2.31,1.33,.14),.235,.175,JOINT,DARK,18)
        pipe('Turret rotation socket',(side*2.28,1.04,.24),(side*2.28,1.04,.42),.325,.245,TITAN,COPPER,16)
        armor('Vented rear shear layer',mirror(((1.01,-1.17),(1.56,-1.29),(2.33,-1.05),(2.27,-.87),(1.78,-.91),(1.28,-.81)),side),.791,.22,DARK,JOINT,.047)
        fasteners(mirror(((1.56,-.83),(1.97,-.80),(2.37,-.43),(2.72,-.50),(3.12,-.13),(3.44,.35),(3.47,.87),(3.33,1.26)),side),.776,.057,JOINT)
        tile('Turret arm / support', side*2.27, .65, .30,1.55,.14,.38,JOINT,.04)
        tile('Turret arm / collar', side*2.28,1.06,.65,.40,.22,.35,TITAN,.10)
        tile('Red running light', side*2.37,-.70,.065,.46,.69,.05,ALERT,bevel=.01)
        vents(side*1.34,-.68,.34,.58,5,JOINT)
    armor('Reactor bowl',circle(0,.13,1.05,20),.65,.34,TITAN,DARK,.065)
    loop('Amber reactor collar',0,.13,.88,.092,.72,AMBER)
    loop('Machined reactor flange',0,.13,.67,.11,.79,JOINT)
    armor('Reactor iris',circle(0,.13,.46,16),.81,.16,ALERT,BRASS,.038)
    loop('Inner luminous capacitor',0,.13,.39,.049,.907,AMBER,32)
    loop('Inner indented copper seal',0,.13,.29,.05,.922,DARK,24)
    armor('Central cap',circle(0,.13,.21,8),.89,.16,BRASS,JOINT,.022)
    for i in range(8):
        theta = i*pi/4
        tile('Fastening lug',cos(theta)*.98,.13+sin(theta)*.98,.18,.23,.81,.1,JOINT,bevel=.028)
        a,b = theta+.14,theta+.58
        sector=[(r*cos(angle),.13+r*sin(angle)) for r,angle in ((.94,a),(1.13,a),(1.13,b),(.94,b))]
        armor('Optical shutter segment',sector,.844,.15,DARK,JOINT,.028)


def turret():
    begin('turret', 2.75, 192, enemy=True)
    armor('Servo turret bed',circle(0,-.16,.83,12),.27,.51,TITAN,DARK,.08)
    armor('Armored servo housing', ((-.78,-.44),(-.40,-.78),(.42,-.78),(.77,-.36),(.67,.31),(-.67,.31)),.48,.33,COPPER,JOINT,.073)
    for side in (-1,1):
        tile('Turret autocannon', side*.29,.39,.22,1.16,.45,.39,DARK,.02)
        pipe('Machined turret bore',(side*.29,.24,.27),(side*.29,1.02,.27),.137,.085,JOINT,ALERT)
        tile('Turret glowing charge', side*.29,.71,.095,.22,.48,.17,AMBER,.014,.028)
        tile('Dark barrel bracket',side*.29,.39,.27,.12,.52,.29,TITAN,bevel=.032)
        vents(side*.31,-.58,.24,.524,3,DARK)
    tile('Turret synchronizer',0,-.25,.20,.48,.55,.11,BRASS,.036)


def rock():
    begin('rock', 3.8, 184)
    vertices = [(-1.29,-.69,-.35),(-.46,-1.26,-.2),(.68,-1.05,-.27),(1.44,-.33,-.01),(1.26,.63,-.21),(.39,1.20,-.38),(-.65,1.09,-.16),(-1.31,.35,-.29),(-.63,-.33,.62),(.51,-.60,.63),(.85,.46,.50),(-.22,.65,.88),(0,0,-.86)]
    faces = [(0,1,8),(1,2,9,8),(2,3,9),(3,4,10,9),(4,5,10),(5,6,11,10),(6,7,8,11),(7,0,8),(8,9,11),(9,10,11)]
    faces += [(12,(i+1)%8,i) for i in range(8)]
    obj = object_mesh('Fractured silicate',vertices,faces,PLUM)
    obj.data.materials.append(TITAN)
    obj.data.materials.append(COPPER)
    for j, face in enumerate(obj.data.polygons):
        face.material_index = 2 if j in (3,6) else 1 if j%4==0 else 0


def capsule(name, tint, sides):
    begin('pickup-' + name, 2.9, 180)
    shape = circle(0,0,1.04,sides)
    armor('Canister shell',shape,.16,.29,TITAN,JOINT,.065)
    armor('Edge illumination',circle(0,0,.89,sides),.23,.16,tint,DARK,.037)
    armor('Canister dark lens',circle(0,0,.68,sides),.29,.16,DARK,TITAN,.046)
    if name == 'repair':
        tile('Repair cross horizontal',0,0,.96,.23,.37,.13,tint,bevel=.04)
        tile('Repair cross vertical',0,0,.23,.96,.371,.13,tint,bevel=.04)
    else:
        symbols = {
            'power': ((-.34,-.33),(0,.35),(.34,-.33),(.13,-.33),(0,-.07),(-.13,-.33)),
            'barrier': ((-.40,.27),(0,.43),(.4,.27),(.33,-.12),(0,-.46),(-.33,-.12)),
            'overdrive': ((-.22,.43),(.28,.43),(.06,.07),(.36,.07),(-.27,-.47),(-.11,-.12),(-.35,-.12))
        }
        armor('Equipment glyph', symbols[name], .38,.15,tint,bevel=.034)
        if name=='barrier':
            armor('Shield inset', ((-.22,.17),(0,.27),(.22,.17),(.18,-.08),(0,-.26),(-.18,-.08)), .407,.056,DARK,bevel=.02)


def planet(name, colors, location, radius, illumination, trace=0):
    begin('env-' + name, 10, (486,972), landscape=True)
    points = []
    rings, slices = 48, 64
    for row in range(rings+1):
        pitch = pi*row/rings
        for column in range(slices):
            theta = 2*pi*column/slices
            points.append((radius*sin(pitch)*cos(theta),radius*sin(pitch)*sin(theta),radius*cos(pitch)))
    faces = [(i*slices+j, (i+1)*slices+j, (i+1)*slices+(j+1)%slices, i*slices+(j+1)%slices) for i in range(rings) for j in range(slices)]
    mat = material(name + ' / broad erosion', colors[0], .13,.91)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    texture = nodes.new('ShaderNodeTexNoise')
    texture.inputs['Scale'].default_value = 5.7 + trace
    texture.inputs['Detail'].default_value = 5
    coords = nodes.new('ShaderNodeTexCoord')
    links.new(coords.outputs['Generated'],texture.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*colors[0],1)
    ramp.color_ramp.elements[1].color = (*colors[1],1)
    ramp.color_ramp.elements[0].position = .30
    ramp.color_ramp.elements[1].position = .71
    links.new(texture.outputs['Fac'],ramp.inputs[0])
    links.new(ramp.outputs[0],shader.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .18
    bump.inputs['Distance'].default_value = .092
    links.new(texture.outputs[0],bump.inputs['Height'])
    links.new(bump.outputs[0],shader.inputs['Normal'])
    obj = object_mesh(name + ' distant limb', points, faces, mat)
    obj.location = location
    for face in obj.data.polygons:
        face.use_smooth = True
    light('Distant sun', (-4, 5, 8), 430, illumination, 5, location)
    light('Backscatter', (3, -3, 7), 88, (.42,.51,1), 4, location)


def slice_models():
    kestrel()
    scout()
    lancer()
    diver()
    relay()
    gatekeeper()
    turret()
    rock()
    for pick, color, sides in (('power',VIOLET,6),('barrier',ICE,8),('repair',JADE,12),('overdrive',AMBER,4)):
        capsule(pick,color,sides)
    planet('breach', ((.037,.012,.025),(.24,.079,.040)), (-4.51,2.3,0), 3.40, (1,.61,.38))


def interceptor():
    begin('needle', 4.58, 392)
    armor('Interceptor long keel', ((0,2.02),(.19,1.68),(.33,.97),(.41,-.37),(.30,-1.77),(.19,-1.92),(-.19,-1.92),(-.30,-1.77),(-.41,-.37),(-.33,.97),(-.19,1.68)),.37,.49,IVORY,TITAN,.045)
    for side in (-1,1):
        armor('Keel flank armour', mirror(((.19,1.42),(.45,.79),(.50,-.45),(.44,-1.59),(.28,-1.77),(.27,-.24)),side),.32,.40,TITAN,JOINT,.042)
        armor('Clipped control fin',mirror(((.38,.09),(.75,-.43),(.89,-1.28),(.71,-1.53),(.39,-1.39)),side),.11,.18,PALE,JOINT,.036)
        armor('Fin trailing cap',mirror(((.55,-.41),(.75,-.65),(.86,-1.26),(.72,-1.34),(.66,-.82)),side),.159,.12,EMBER,DARK,.019)
        pipe('Lance staging heatpipe',(.30*side,-.65,.31),(.26*side,.88,.38),.064,.031,COPPER,DARK,12)
        tile('Observer running light',.39*side,-.58,.048,.52,.38,.034,TURQUOISE,taper=.009,bevel=.011)
        fasteners(mirror(((.40,.27),(.41,-.78),(.65,-1.17)),side),.367,.034,JOINT)
    engine(0,-1.51,.63)
    canopy(((0,1.15),(.168,.89),(.21,.27),(.16,-.17),(-.16,-.17),(-.21,.27),(-.168,.89)),.53)
    pipe('Concentrated plasma lance',(0,1.27,.26),(0,1.94,.31),.090,.047,JOINT,TURQUOISE)
    tile('Nose emitter spine',0,1.55,.064,.49,.402,.035,TURQUOISE,.012,.014)


def sweeper():
    begin('sweeper',4.42,280,enemy=True)
    armor('Sweeper saddle', ((-.63,.88),(.63,.88),(.91,.42),(.79,-.79),(0,-1.36),(-.79,-.79),(-.91,.42)),.33,.42,PLUM,DARK,.057)
    for side in (-1,1):
        wing = ((.55,-.72),(1.16,-.95),(1.97,-.71),(1.82,.09),(1.30,.72),(1.04,.99),(.88,.37),(1.36,-.14),(.83,-.28))
        armor('Sweeping crescent arm',mirror(wing,side),.30,.37,TITAN,JOINT,.066)
        armor('Hardened arm inserts',mirror(((1.18,-.74),(1.73,-.67),(1.63,-.28),(1.51,-.01),(1.26,.27),(1.20,-.03),(1.41,-.39)),side),.392,.22,PLUM,JOINT,.047)
        armor('Focus rails',mirror(((1.58,-.49),(1.71,-.51),(1.55,-.04),(1.28,.32),(1.33,.06)),side),.44,.08,VIOLET,TITAN,.022)
        engine(side*.62,-.83,.40,VIOLET)
        pipe('Sweeper plasma output',(1.17*side,-.46,.20),(1.38*side,.07,.21),.115,.075,DARK,VIOLET)
    armor('Firing prism', ((0,.70),(.37,.25),(0,-.30),(-.37,.25)),.54,.30,VIOLET,TITAN,.063)
    loop('Accumulation coil',0,.12,.49,.068,.462,JOINT,24)


def escort():
    begin('escort',4.17,270,enemy=True)
    shield = ((0,1.65),(1.34,1.00),(1.55,.14),(1.16,-1.18),(0,-1.51),(-1.16,-1.18),(-1.55,.14),(-1.34,1.00))
    armor('Escort shield hull',shield,.40,.65,TITAN,DARK,.081)
    shell = ((0,1.39),(1.04,.86),(1.23,.11),(.85,-.94),(0,-1.26),(-.85,-.94),(-1.23,.11),(-1.04,.86))
    armor('Layered deflector ceramic',shell,.56,.34,PALE,DARK,.07)
    for side in (-1,1):
        armor('Deflector segment',mirror(((.38,.88),(.86,.73),(1.11,.18),(.85,-.56),(.54,-.77),(.65,-.04)),side),.663,.21,TITAN,JOINT,.049)
        armor('Field conductor',mirror(((.82,-.63),(.94,-.71),(1.19,.12),(1.10,.40),(1.02,.37),(1.08,.04)),side),.686,.061,ICE,DARK,.014)
        engine(.50*side,-.92,.38,ICE)
        fasteners(mirror(((1.18,.42),(.81,.75),(.89,-.83)),side),.66,.054,DARK)
    armor('Shield transceiver housing',circle(0,.17,.50,6),.70,.26,DARK,JOINT,.063)
    loop('Shield transceiver',0,.17,.39,.095,.743,JADE,12)


def harrow():
    begin('warden',8.68,434,enemy=True)
    armor('Harrow mining tug',((-.94,2.03),(.94,2.03),(1.68,1.17),(1.78,-1.17),(.95,-2.13),(-.95,-2.13),(-1.78,-1.17),(-1.68,1.17)),.49,.77,TITAN,DARK,.106)
    for side in (-1,1):
        truss = ((1.28,-1.61),(3.60,-1.49),(3.96,-.54),(3.83,.80),(3.47,1.67),(2.38,1.80),(2.23,.92),(2.75,.45),(2.61,-.20),(1.28,-.37))
        armor('Miner pillared ram',mirror(truss,side),.49,.78,DARK,JOINT,.106)
        plate = ((1.56,-1.37),(3.40,-1.30),(3.70,-.55),(3.51,.53),(3.13,1.48),(2.52,1.55),(2.51,1.02),(2.86,.73),(3.17,-.45),(2.83,-.81),(1.57,-.90))
        armor('Heat-treated boom plating',mirror(plate,side),.68,.40,COPPER,DARK,.075)
        x=side*3.11
        armor('Projector mounting dish',circle(x,.52,.53,12),.75,.36,TITAN,DARK,.066)
        loop('Rock field projector',x,.52,.46,.098,.81,AMBER)
        armor('Recessed mining lens',circle(x,.52,.32,8),.823,.146,DARK,TITAN,.05)
        tile('Charge marks',x*.943,-.42,.082,.56,.726,.041,AMBER,bevel=.018)
        pipe('Boom hydraulic strut',(side*1.61,-1.22,.13),(side*3.50,-.87,.22),.17,.11,JOINT,DARK)
        vents(side*1.04,-1.27,.36,.54,5,JOINT)
        fasteners(mirror(((1.59,-.89),(2.09,-1.17),(2.72,-1.00),(3.26,-.63),(3.21,1.36)),side),.773,.07,JOINT)
    armor('Operation enclosure',((-.80,1.38),(.80,1.38),(1.28,.67),(.87,-.59),(-.87,-.59),(-1.28,.67)),.74,.45,JOINT,DARK,.09)
    tile('Dredge drive core',0,.45,.31,1.05,.78,.089,AMBER,.04,.04)
    for x in (-.55,.55):
        engine(x,-1.55,.64,AMBER)


def carrier():
    begin('matron',8.66,440,enemy=True)
    armor('Relay carrier spine',((0,2.26),(.86,1.57),(1.08,.09),(1.13,-1.15),(.64,-1.94),(-.64,-1.94),(-1.13,-1.15),(-1.08,.09),(-.86,1.57)),.52,.75,TITAN,DARK,.09)
    for side in (-1,1):
        shoulder = ((.88,-.96),(2.12,-1.26),(3.69,-.89),(3.98,-.12),(3.80,.85),(3.07,1.65),(2.43,1.44),(2.25,.70),(1.76,.35),(1.26,.72))
        armor('Shield-tender long pod',mirror(shoulder,side),.47,.62,DARK,TITAN,.107)
        armor('Outer angled thermo panel',mirror(((1.65,-.81),(2.33,-1.04),(3.56,-.72),(3.72,-.19),(3.51,.54),(3.04,1.28),(2.62,1.24),(2.52,.43),(2.08,-.06)),side),.61,.30,TITAN,JOINT,.075)
        armor('Blue emitter gallery',mirror(((2.6,-.38),(3.42,-.38),(3.36,.09),(3.14,.51),(2.75,.32)),side),.688,.21,CANOPY,JOINT,.052)
        tile('Wing capacitor',side*3.15,-.14,.17,.61,.73,.085,ICE,.022,.026)
        tile('Shield emitter connector',side*2.46,.19,.58,.43,.32,.54,DARK,.084,.034)
        pipe('Auxiliary power bus',(side*1.19,-.62,.14),(side*2.89,-.70,.31),.114,.08,JOINT,DARK)
        fasteners(mirror(((1.45,-.63),(1.94,-.90),(2.27,-.79),(3.25,-.55),(3.52,.09),(3.36,.68),(2.94,1.14)),side),.742,.057,JOINT)
    armor('Carrier command face',((0,2.02),(.59,1.40),(.88,.21),(.72,-.76),(-.72,-.76),(-.88,.21),(-.59,1.4)),.70,.40,PLUM,JOINT,.078)
    loop('Relay core collar',0,.28,.67,.11,.758,VIOLET,28)
    armor('Core facet',circle(0,.28,.44,6),.809,.21,ICE,TITAN,.054)
    engine(0,-1.45,.90,ICE)


def inner_fleet():
    interceptor()
    sweeper()
    escort()
    harrow()
    carrier()
    planet('belt',((.016,.014,.043),(.098,.067,.215)),(4.38,2.75,0),3.75,(.69,.67,1),2)
    planet('relay',((.009,.022,.031),(.064,.181,.192)),(-4.46,-.92,0),3.82,(.49,.86,1),4)


if args.batch == 'slice':
    slice_models()
elif args.batch == 'cover':
    kestrel(cover=True)
else:
    inner_fleet()

bpy.context.window.scene = renders[0][1]
for name, target in renders:
    target.render.filepath = '//' + name + '.png'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (args.batch + '.blend')), compress=True)
for name, target in renders:
    target.render.filepath = str((SOURCE if args.batch == 'cover' else OUT) / (name + '.png'))
    bpy.ops.render.render(write_still=True, scene=target.name)
