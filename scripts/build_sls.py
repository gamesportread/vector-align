"""
Space Launch System (Block 1, Artemis I) — high-detail PBR procedural Blender build script.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python scripts/build_sls.py -- public/models/sls_block1.glb

Preserves the exact 9 separable animated node names, origins and coordinates expected
by src/components/liftoff/LiftoffScene3D.tsx and public/models/lc39b_sls.glb:
  CORE, SRB_L, SRB_R, ICPS, ORION, FAIRING_0, FAIRING_1, FAIRING_2, LAS
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from rocket_textures import PBRCanvas, hex_srgb, srgb_to_linear  # noqa: E402

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "public/models/sls_block1.glb"
SEG = 96
TAU = math.tau

bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb_mat(name, hex_col, metal=0.0, rough=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*srgb_to_linear(hex_srgb(hex_col)), 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    return m


# Shared secondary solid PBR materials for brackets, bolts, nozzles, tiles, trusses
MATS = {
    "white": srgb_mat("SLS_White", "#f0efe9", 0.0, 0.45),
    "srb_white": srgb_mat("SLS_BoosterWhite", "#eeede6", 0.0, 0.48),
    "orange": srgb_mat("SLS_CoreOrange", "#c9692d", 0.0, 0.85),
    "orange_dark": srgb_mat("SLS_CoreOrangeDark", "#9a491c", 0.0, 0.88),
    "grey": srgb_mat("SLS_Grey", "#888e94", 0.45, 0.42),
    "silver": srgb_mat("SLS_Silver", "#c7ccd1", 0.72, 0.34),
    "alu": srgb_mat("SLS_Alu", "#dfe3e7", 0.68, 0.32),
    "dark": srgb_mat("SLS_DarkMetal", "#2f3338", 0.72, 0.42),
    "black": srgb_mat("SLS_Black", "#16181c", 0.05, 0.58),
    "nozzle": srgb_mat("SLS_Nozzle", "#25272b", 0.65, 0.45),
    "thermal": srgb_mat("SLS_Thermal", "#d8d6cf", 0.0, 0.78),
    "gold": srgb_mat("SLS_Gold", "#d4a238", 0.86, 0.28),
    "solar": srgb_mat("SLS_Solar", "#182848", 0.28, 0.20),
    "glass": srgb_mat("SLS_Window", "#101720", 0.15, 0.12),
}


def P(x, y, z):
    """three.js (x, y, z) -> Blender (x, -z, y)."""
    return Vector((x, -z, y))


def new_obj(name, me):
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def ensure_mats(obj, names):
    idx = {}
    for n in names:
        m = MATS[n]
        existing = [s.name for s in obj.data.materials]
        if m.name not in existing:
            obj.data.materials.append(m)
            existing.append(m.name)
        idx[n] = existing.index(m.name)
    return idx


def lathe_uv(name, profile, seg=SEG, mat_name="white", x=0.0, z=0.0,
             phi0=0.0, phi_span=TAU, cap_bottom=True, cap_top=True,
             y_min=None, y_max=None, u_full=False):
    """
    Revolve (r, three_y) around vertical axis at three (x, *, z) with continuous cylindrical UVs.
    phi=0 -> +X, phi=pi/2 -> -Z, phi=-pi/2 -> +Z (camera).
    """
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    ensure_mats(o, [mat_name])

    ys = [p[1] for p in profile]
    ymin = min(ys) if y_min is None else y_min
    ymax = max(ys) if y_max is None else y_max
    yrange = max(1e-5, ymax - ymin)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    full = abs(phi_span - TAU) < 1e-6
    n_ang = seg if full else seg + 1
    rings = []
    for r, y in profile:
        ring = []
        for i in range(n_ang):
            phi = phi0 + phi_span * i / seg
            ring.append(bm.verts.new((r * math.cos(phi), r * math.sin(phi), y)))
        rings.append(ring)

    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        va = (profile[k][1] - ymin) / yrange
        vb = (profile[k + 1][1] - ymin) / yrange
        for i in range(seg):
            j = (i + 1) % n_ang if full else i + 1
            ua = ((phi0 + phi_span * i / seg) / TAU) % 1.0 if u_full else (i / seg)
            ub = (ua + (phi_span / TAU) / seg) if u_full else ((i + 1) / seg)
            if u_full and ub < ua:
                ub += 1.0
            f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = 0
            uvs = [(ua, va), (ub, va), (ub, vb), (ua, vb)]
            for loop, uv in zip(f.loops, uvs):
                loop[uv_layer].uv = uv

    if full:
        if cap_bottom and profile[0][0] > 1e-4:
            f = bm.faces.new(list(reversed(rings[0])))
            f.material_index = 0
            for loop in f.loops:
                loop[uv_layer].uv = (0.0, 0.01)
        if cap_top and profile[-1][0] > 1e-4:
            f = bm.faces.new(rings[-1])
            f.material_index = 0
            for loop in f.loops:
                loop[uv_layer].uv = (0.0, 0.99)

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o.matrix_world = Matrix.Translation(P(x, 0, z))
    return o


def cyl3(name, a3, b3, r0, r1=None, seg=14, mat_name="grey", caps=True):
    r1 = r0 if r1 is None else r1
    p0, p1 = P(*a3), P(*b3)
    d = p1 - p0
    L = d.length
    if L < 1e-6:
        L = 1e-6
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    ensure_mats(o, [mat_name])
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    bot = [bm.verts.new((r0 * math.cos(i * TAU / seg), r0 * math.sin(i * TAU / seg), 0.0)) for i in range(seg)]
    top = [bm.verts.new((r1 * math.cos(i * TAU / seg), r1 * math.sin(i * TAU / seg), L)) for i in range(seg)]
    for i in range(seg):
        j = (i + 1) % seg
        f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
        for loop, uv in zip(f.loops, [(i / seg, 0), ((i + 1) / seg, 0), ((i + 1) / seg, 1), (i / seg, 1)]):
            loop[uv_layer].uv = uv
    if caps and r0 > 1e-4:
        bm.faces.new(list(reversed(bot)))
    if caps and r1 > 1e-4:
        bm.faces.new(top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    o.matrix_world = Matrix.Translation(p0) @ rot
    return o


def box3(name, size_three, pos_three, rot_z_bl=0.0, mat_name="grey", bevel=0.0):
    sx, sy, sz = size_three
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    ensure_mats(o, [mat_name])
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            loop[uv_layer].uv = (0.5, 0.5)
    bm.to_mesh(me)
    bm.free()
    o.matrix_world = Matrix.Translation(P(*pos_three)) @ Matrix.Rotation(rot_z_bl, 4, "Z")
    return o


def join_parts(name, objs, smooth_deg=35):
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_deg))
    return o


def set_origin(o, origin3):
    off = P(*origin3)
    o.data.transform(Matrix.Translation(-off))
    o.location = off


# --------------------------------------------------------------------------
# SLS Dimensions (three.js rocket frame, 1 m = 0.11 units)
# --------------------------------------------------------------------------
STACK_YAW = math.pi / 4
FRONT = -math.pi / 2 - STACK_YAW   # phi facing default camera after +45 deg stack yaw
U_FRONT = (FRONT % TAU) / TAU      # 0.625

Y_DECK = -4.80
R_CORE = 0.462
R_SRB = 0.204
X_SRB = 0.705
Y_CORE0 = -4.48
Y_LH2 = -3.84
Y_IT0, Y_IT1 = -0.20, 0.42
Y_LOX1 = 1.84
Y_CORE1 = 2.12
Y_LVSA1 = 3.10
R_UPPER = 0.275
Y_ICPS0, Y_ICPS1 = 2.25, 3.75
Y_OSA1 = 3.92
Y_SM1 = 4.55
Y_CM1 = 4.91
Y_LAS0, Y_LAS_FAIR1, Y_LAS_TOP = 4.50, 5.24, 6.36


# ==========================================================================
# 1. CORE + LVSA PBR TEXTURE (1024 x 2048)
# ==========================================================================
CORE_Y_MIN, CORE_Y_MAX = Y_CORE0, Y_LVSA1


def cv(y):
    return (y - CORE_Y_MIN) / (CORE_Y_MAX - CORE_Y_MIN)


core_tex = PBRCanvas(1024, 2048, base_hex="#c9682c", rough=0.84, metal=0.0)
# Engine section white quilted thermal blankets + dark aft rim
core_tex.paint_band(0.0, cv(Y_LH2), "#e7e5dd", rough=0.76, metal=0.0)
core_tex.paint_band(0.0, cv(Y_CORE0 + 0.07), "#2c2f34", rough=0.65, metal=0.2)
core_tex.add_quilted_blanket(cv(Y_CORE0 + 0.07), cv(Y_LH2 - 0.02), n_cols=28, n_rows=8)
core_tex.add_panel_grid(cv(Y_CORE0 + 0.07), cv(Y_LH2), n_cols=16, n_rows=3, color_var=0.02, rivets=False)
core_tex.add_soot_gradient(0.0, cv(Y_CORE0 + 0.22), strength=0.35, dark_at_bottom=True)

# LH2 tank SOFI foam + darker weld rings
core_tex.add_sofi_foam(cv(Y_LH2), cv(Y_IT0), seed=101)
for wy in (-3.35, -2.55, -1.75, -0.95):
    core_tex.paint_band(cv(wy - 0.022), cv(wy + 0.022), "#9c4a1d", rough=0.88, height_delta=-0.12)
# Optical photogrammetry targets on LH2 tank
for ty in (-3.15, -1.25):
    for du in (0.0, 0.25, 0.50, 0.75):
        core_tex.draw_crosshair_target((U_FRONT + du) % 1.0, cv(ty), 0.014, 0.0065)

# Intertank dark ribbed thermal coat
core_tex.paint_band(cv(Y_IT0), cv(Y_IT1), "#9c4a1d", rough=0.86)
core_tex.add_sofi_foam(cv(Y_IT0), cv(Y_IT1), seed=202)
core_tex.add_corrugation(cv(Y_IT0 + 0.02), cv(Y_IT1 - 0.02), n_ribs=48, amp=0.55, ao_dark=0.18)
core_tex.paint_band(cv(Y_IT0 - 0.012), cv(Y_IT0 + 0.018), "#6c7278", rough=0.42, metal=0.65, height_delta=0.25)
core_tex.paint_band(cv(Y_IT1 - 0.018), cv(Y_IT1 + 0.012), "#6c7278", rough=0.42, metal=0.65, height_delta=0.25)

# LOX tank SOFI foam + weld rings + forward skirt
core_tex.add_sofi_foam(cv(Y_IT1), cv(Y_CORE1), seed=303)
for wy in (0.95, 1.48):
    core_tex.paint_band(cv(wy - 0.020), cv(wy + 0.020), "#9c4a1d", rough=0.88, height_delta=-0.10)
core_tex.paint_band(cv(Y_LOX1), cv(Y_CORE1), "#aa5322", rough=0.86)
core_tex.add_corrugation(cv(Y_LOX1 + 0.02), cv(Y_CORE1 - 0.02), n_ribs=48, amp=0.35, ao_dark=0.12)
for du in (0.0, 0.25, 0.50, 0.75):
    core_tex.draw_crosshair_target((U_FRONT + du) % 1.0, cv(1.22), 0.014, 0.0065)

# LVSA (Launch Vehicle Stage Adapter): crisp aerospace white, stringers, checkerboard tracking collar
core_tex.paint_band(cv(Y_CORE1), cv(Y_LVSA1), "#f1f0ea", rough=0.44, metal=0.0)
core_tex.add_panel_grid(cv(Y_CORE1 + 0.08), cv(Y_LVSA1 - 0.06), n_cols=16, n_rows=4, color_var=0.018, seam_px=2)
core_tex.add_corrugation(cv(Y_CORE1 + 0.14), cv(Y_LVSA1 - 0.09), n_ribs=48, amp=0.42, ao_dark=0.10)
core_tex.paint_band(cv(Y_CORE1 - 0.01), cv(Y_CORE1 + 0.03), "#757b82", rough=0.40, metal=0.65, height_delta=0.25)
core_tex.draw_checker_band(cv(Y_CORE1 + 0.04), cv(Y_CORE1 + 0.12), n_cols=32, n_rows=2)
core_tex.draw_checker_band(cv(Y_LVSA1 - 0.08), cv(Y_LVSA1 - 0.02), n_cols=32, n_rows=2)
core_tex.paint_band(cv(Y_LVSA1 - 0.02), cv(Y_LVSA1), "#464b52", rough=0.42, metal=0.6)
# LVSA umbilical / inspection hatches
for du in (0.08, 0.58):
    u0 = (U_FRONT + du) % 1.0
    core_tex.paint_rect_uv(u0, cv(2.42), u0 + 0.045, cv(2.58), "#3a3f46", rough=0.5, metal=0.4, height_delta=-0.15)

MATS["core_pbr"] = core_tex.build_material("SLS_Core_PBR", normal_strength=2.2)

# Build CORE geometry
core = []
core_prof = [(R_CORE * 0.96, Y_CORE0), (R_CORE * 0.995, Y_CORE0 + 0.04), (R_CORE, Y_CORE0 + 0.07)]
y = Y_CORE0 + 0.07
while y < Y_CORE1 - 0.005:
    y = min(Y_CORE1, y + 0.14)
    core_prof.append((R_CORE, y))
core_prof += [(R_CORE * 1.004, Y_CORE1), (R_CORE * 1.004, Y_CORE1 + 0.10)]
for i in range(1, 11):
    t = i / 10
    core_prof.append((R_CORE + (R_UPPER - R_CORE) * t, Y_CORE1 + 0.10 + (Y_LVSA1 - Y_CORE1 - 0.10) * t))

core.append(lathe_uv("CORE_hull", core_prof, seg=96, mat_name="core_pbr",
                     y_min=CORE_Y_MIN, y_max=CORE_Y_MAX, u_full=True))

# Core aft boattail + 4 RS-25 quilted engine mounting domes/boots
core.append(lathe_uv("CORE_boattail", [(R_CORE * 0.96, Y_CORE0 + 0.001), (0.34, Y_CORE0 - 0.04), (0.0, Y_CORE0 - 0.055)],
                     seg=64, mat_name="thermal", cap_bottom=False))
for ex, ez in ((0.19, 0.19), (-0.19, 0.19), (0.19, -0.19), (-0.19, -0.19)):
    core.append(lathe_uv(f"CORE_boot_{ex}_{ez}",
                         [(0.125, Y_CORE0 - 0.045), (0.115, Y_CORE0 - 0.09), (0.085, Y_CORE0 - 0.12)],
                         x=ex, z=ez, seg=24, mat_name="thermal", cap_bottom=False))

# Structural ring flanges at intertank & LVSA boundaries
for fy, rr, hh in ((Y_IT0, R_CORE + 0.009, 0.025), (Y_IT1, R_CORE + 0.009, 0.025), (Y_CORE1 + 0.02, R_CORE + 0.009, 0.032)):
    core.append(lathe_uv(f"CORE_ring_{fy:.2f}", [(rr - 0.01, fy - hh / 2), (rr, fy - hh / 2), (rr, fy + hh / 2), (rr - 0.01, fy + hh / 2)],
                         seg=64, mat_name="grey", cap_bottom=False, cap_top=False))

# 36 longitudinal 3D stringer ribs on Intertank & LVSA
for k in range(36):
    phi = k * TAU / 36
    c, s = math.cos(phi), -math.sin(phi)
    core.append(cyl3(f"CORE_itrib{k}", (c * (R_CORE + 0.004), Y_IT0 + 0.02, s * (R_CORE + 0.004)),
                     (c * (R_CORE + 0.004), Y_IT1 - 0.02, s * (R_CORE + 0.004)), 0.0065, seg=6, mat_name="orange_dark", caps=False))
    r0_lv, r1_lv = R_CORE + 0.002, R_UPPER + 0.002
    core.append(cyl3(f"CORE_lvsarib{k}", (c * r0_lv, Y_CORE1 + 0.11, s * r0_lv),
                     (c * r1_lv, Y_LVSA1 - 0.02, s * r1_lv), 0.0055, seg=6, mat_name="white", caps=False))

# Twin external LH2 feedlines with machined clamp brackets
for k, phi in enumerate((0.28, math.pi + 0.28)):
    c, s = math.cos(phi), -math.sin(phi)
    rr = R_CORE + 0.022
    core.append(cyl3(f"CORE_feed{k}", (c * rr, Y_LH2 + 0.06, s * rr), (c * rr, Y_IT0 + 0.02, s * rr),
                     0.022, seg=12, mat_name="orange_dark"))
    core.append(cyl3(f"CORE_feed_elbow{k}", (c * rr, Y_LH2 + 0.06, s * rr), (c * (R_CORE - 0.02), Y_LH2 - 0.14, s * (R_CORE - 0.02)),
                     0.020, seg=10, mat_name="silver"))
    for bi in range(8):
        by = Y_LH2 + 0.25 + bi * 0.44
        core.append(box3(f"CORE_fclamp{k}_{bi}", (0.055, 0.024, 0.055),
                         (c * (R_CORE + 0.015), by, s * (R_CORE + 0.015)), rot_z_bl=-phi, mat_name="silver"))

# Twin avionics systems tunnels running up LH2 & LOX tanks
for k, phi in enumerate((-0.32, math.pi - 0.32)):
    c, s = math.cos(phi), -math.sin(phi)
    rr = R_CORE + 0.011
    core.append(box3(f"CORE_tunnel{k}", (0.030, Y_LOX1 - Y_LH2, 0.044),
                     (c * rr, (Y_LH2 + Y_LOX1) / 2, s * rr), rot_z_bl=-phi, mat_name="orange_dark", bevel=0.004))

# Tail Service Mast umbilical plates on +/- Z of engine section (aligned with ML-1 masts)
for s in (-1, 1):
    core.append(box3(f"CORE_tsm_plate{s}", (0.14, 0.26, 0.05), (0, Y_CORE0 + 0.32, s * (R_CORE + 0.015)), mat_name="grey", bevel=0.006))

CORE = join_parts("CORE", core)
set_origin(CORE, (0, (Y_CORE0 + Y_LVSA1) / 2, 0))


# ==========================================================================
# 2. SOLID ROCKET BOOSTERS PBR TEXTURE (1024 x 2048)
# ==========================================================================
Y_SRB_TOP = Y_DECK + 5.94
SRB_Y_MIN, SRB_Y_MAX = Y_DECK, Y_SRB_TOP


def sv(y):
    return (y - SRB_Y_MIN) / (SRB_Y_MAX - SRB_Y_MIN)


SRB_SEGMENT_JOINTS = [Y_DECK + 0.45 + i * 0.92 for i in range(6)]

srb_tex = PBRCanvas(1024, 2048, base_hex="#efeee7", rough=0.44, metal=0.0)
srb_tex.add_panel_grid(sv(Y_DECK + 0.44), sv(Y_SRB_TOP - 0.56), n_cols=12, n_rows=10, color_var=0.015, seam_px=2)
srb_tex.add_micro_wear(0.0, 1.0, strength=0.018, bump=0.05, seed=88)

# Aft skirt dark thermal coat & stiffener zone
srb_tex.paint_band(0.0, sv(Y_DECK + 0.06), "#1d2024", rough=0.65, metal=0.25)
srb_tex.paint_band(sv(Y_DECK + 0.37), sv(Y_DECK + 0.45), "#181a1f", rough=0.58)
srb_tex.add_soot_gradient(0.0, sv(Y_DECK + 0.30), strength=0.25, dark_at_bottom=True)

# Segment clevis field joint dark weather seals
for j in SRB_SEGMENT_JOINTS:
    srb_tex.paint_band(sv(j - 0.015), sv(j + 0.015), "#60666d", rough=0.45, metal=0.5, height_delta=0.20)
    srb_tex.paint_band(sv(j - 0.005), sv(j + 0.005), "#24272c", rough=0.7)

# Forward assembly black/white roll band & frustum markings
srb_tex.paint_band(sv(Y_SRB_TOP - 0.93), sv(Y_SRB_TOP - 0.84), "#17191d", rough=0.56)
srb_tex.draw_checker_band(sv(Y_SRB_TOP - 0.84), sv(Y_SRB_TOP - 0.76), n_cols=16, n_rows=1)
srb_tex.paint_band(sv(Y_SRB_TOP - 0.34), sv(Y_SRB_TOP - 0.28), "#17191d", rough=0.56)
srb_tex.paint_band(sv(Y_SRB_TOP - 0.08), 1.0, "#2b2e33", rough=0.45, metal=0.55)

# Authentic Artemis I Red NASA Worm logo horizontally & Meatball insignia on SRBs
for u_pos in (U_FRONT, (U_FRONT + 0.50) % 1.0):
    srb_tex.draw_nasa_worm_horizontal(u_pos, sv(Y_DECK + 3.65), 0.26, 0.020, hex_col="#b81c14")
    srb_tex.draw_nasa_meatball(u_pos, sv(Y_SRB_TOP - 1.15), 0.055, 0.0118)

MATS["srb_pbr"] = srb_tex.build_material("SLS_SRB_PBR", normal_strength=2.0)


def build_srb(side):
    name = "SRB_L" if side < 0 else "SRB_R"
    x = side * X_SRB
    parts = []

    prof = [(0.288, Y_DECK), (0.272, Y_DECK + 0.05), (0.236, Y_DECK + 0.25), (R_SRB, Y_DECK + 0.42)]
    y = Y_DECK + 0.42
    while y < Y_SRB_TOP - 0.56:
        y = min(Y_SRB_TOP - 0.56, y + 0.16)
        prof.append((R_SRB, y))
    prof += [
        (R_SRB, Y_SRB_TOP - 0.54),
        (0.194, Y_SRB_TOP - 0.43),
        (0.152, Y_SRB_TOP - 0.26),
        (0.095, Y_SRB_TOP - 0.11),
        (0.042, Y_SRB_TOP - 0.025),
        (0.0, Y_SRB_TOP),
    ]
    parts.append(lathe_uv(f"{name}_body", prof, x=x, seg=64, mat_name="srb_pbr",
                          y_min=SRB_Y_MIN, y_max=SRB_Y_MAX, u_full=True))

    # 6 protruding field-joint clevis collars along the 5-segment booster
    for idx_j, j in enumerate(SRB_SEGMENT_JOINTS):
        parts.append(lathe_uv(f"{name}_joint{idx_j}",
                              [(R_SRB - 0.002, j - 0.016), (R_SRB + 0.007, j - 0.012),
                               (R_SRB + 0.007, j + 0.012), (R_SRB - 0.002, j + 0.016)],
                              x=x, seg=48, mat_name="grey", cap_bottom=False, cap_top=False))

    # 3 protruding aft stiffener T-rings on the lower booster segment
    for idx_r, ry in enumerate((Y_DECK + 0.62, Y_DECK + 0.80, Y_DECK + 0.98)):
        parts.append(lathe_uv(f"{name}_stiff{idx_r}",
                              [(R_SRB, ry - 0.008), (R_SRB + 0.012, ry - 0.006),
                               (R_SRB + 0.012, ry + 0.006), (R_SRB, ry + 0.008)],
                              x=x, seg=48, mat_name="srb_white", cap_bottom=False, cap_top=False))

    # 4 hold-down post housings around the flared aft skirt
    for a in range(4):
        ang = math.pi / 4 + a * math.pi / 2
        hx = x + math.cos(ang) * 0.262
        hz = -math.sin(ang) * 0.262
        parts.append(box3(f"{name}_hd{a}", (0.055, 0.13, 0.055), (hx, Y_DECK + 0.065, hz),
                          rot_z_bl=ang, mat_name="grey", bevel=0.005))

    # Detailed multi-ring SRB Nozzle + thermal boot
    parts.append(lathe_uv(f"{name}_nozzle_boot",
                          [(0.11, Y_DECK + 0.03), (0.12, Y_DECK - 0.03), (0.09, Y_DECK - 0.06)],
                          x=x, seg=36, mat_name="thermal", cap_bottom=False, cap_top=False))
    parts.append(lathe_uv(f"{name}_nozzle",
                          [(0.072, Y_DECK + 0.02), (0.092, Y_DECK - 0.06), (0.145, Y_DECK - 0.20),
                           (0.162, Y_DECK - 0.25), (0.150, Y_DECK - 0.255), (0.075, Y_DECK - 0.05)],
                          x=x, seg=48, mat_name="nozzle", cap_bottom=False, cap_top=False))
    for nr_i, (ny, nr) in enumerate(((Y_DECK - 0.09, 0.106), (Y_DECK - 0.15, 0.130), (Y_DECK - 0.21, 0.154))):
        parts.append(lathe_uv(f"{name}_nozring{nr_i}",
                              [(nr - 0.005, ny - 0.009), (nr + 0.007, ny - 0.007),
                               (nr + 0.007, ny + 0.007), (nr - 0.005, ny + 0.009)],
                              x=x, seg=40, mat_name="grey", cap_bottom=False, cap_top=False))

    # External systems tunnel along outer spine of booster
    out_x = x + side * (R_SRB + 0.009)
    parts.append(box3(f"{name}_tunnel", (0.024, Y_SRB_TOP - 0.65 - (Y_DECK + 0.44), 0.034),
                      (out_x, (Y_DECK + 0.44 + Y_SRB_TOP - 0.65) / 2, 0), mat_name="srb_white", bevel=0.004))

    # Booster Separation Motor (BSM) blister pods + dark nozzle throats (frustum & aft)
    for yy, r_base, dz_tilt in ((Y_SRB_TOP - 0.68, R_SRB + 0.004, 0.05), (Y_DECK + 0.28, 0.228, -0.05)):
        for k in range(4):
            a = (k - 1.5) * 0.34 + (0 if side > 0 else math.pi)
            cx = x + math.cos(a) * r_base
            cz = -math.sin(a) * r_base
            parts.append(box3(f"{name}_bsm_pod{yy:.2f}_{k}", (0.032, 0.085, 0.026),
                              (cx, yy, cz), rot_z_bl=a, mat_name="srb_white", bevel=0.004))
            parts.append(cyl3(f"{name}_bsm_noz{yy:.2f}_{k}",
                              (cx + math.cos(a) * 0.012, yy, cz - math.sin(a) * 0.012),
                              (cx + math.cos(a) * 0.032, yy + dz_tilt, cz - math.sin(a) * 0.032),
                              0.010, 0.016, seg=10, mat_name="black"))

    # Upper thrust-beam attach collar & lower 3 diagonal struts connecting to Core
    inner = x - side * (R_SRB - 0.01)
    core_face = side * (R_CORE - 0.01)
    parts.append(cyl3(f"{name}_fwd_thrust", (inner, Y_IT0 + 0.30, 0), (core_face, Y_IT0 + 0.30, 0), 0.042, seg=12, mat_name="grey"))
    parts.append(box3(f"{name}_fwd_collar", (0.04, 0.14, 0.14), (x - side * (R_SRB - 0.005), Y_IT0 + 0.30, 0), mat_name="grey", bevel=0.005))
    for dz in (-0.13, 0.0, 0.13):
        parts.append(cyl3(f"{name}_aft_strut{dz}", (inner, Y_LH2 + 0.24, dz * 0.5),
                          (core_face, Y_LH2 + 0.10, dz), 0.017, seg=10, mat_name="grey"))

    o = join_parts(name, parts)
    set_origin(o, (x, (Y_DECK + Y_SRB_TOP) / 2, 0))
    return o


SRB_L = build_srb(-1)
SRB_R = build_srb(1)


# ==========================================================================
# 3. ICPS + ORION STAGE ADAPTER (OSA) PBR TEXTURE
# ==========================================================================
icps_tex = PBRCanvas(1024, 1024, base_hex="#f0efe9", rough=0.42, metal=0.0)


def iv(y):
    return (y - Y_ICPS0) / (Y_OSA1 - Y_ICPS0)


icps_tex.paint_band(0.0, iv(Y_ICPS0 + 0.45), "#c7ccd1", rough=0.36, metal=0.65)
icps_tex.add_panel_grid(iv(Y_ICPS0 + 0.45), 1.0, n_cols=12, n_rows=6, color_var=0.016, seam_px=2)
icps_tex.paint_band(iv(Y_ICPS1 - 0.42), iv(Y_ICPS1 - 0.32), "#17191d", rough=0.55)
icps_tex.draw_checker_band(iv(Y_ICPS1 - 0.32), iv(Y_ICPS1 - 0.24), n_cols=24, n_rows=1)
icps_tex.paint_band(iv(Y_ICPS1 - 0.02), iv(Y_ICPS1 + 0.03), "#6e747a", rough=0.38, metal=0.6, height_delta=0.22)
MATS["icps_pbr"] = icps_tex.build_material("SLS_ICPS_PBR", normal_strength=2.0)

icps = []
icps.append(lathe_uv("ICPS_tank", [
    (0.0, Y_ICPS0), (0.18, Y_ICPS0 + 0.05), (0.24, Y_ICPS0 + 0.20),
    (R_UPPER * 0.99, Y_ICPS0 + 0.45), (R_UPPER, Y_ICPS0 + 0.60),
    (R_UPPER, Y_ICPS1 - 0.05), (R_UPPER * 1.005, Y_ICPS1),
    (R_UPPER * 1.005, Y_OSA1 - 0.02), (R_UPPER * 0.98, Y_OSA1),
], seg=80, mat_name="icps_pbr", y_min=Y_ICPS0, y_max=Y_OSA1, u_full=True, cap_top=True))
icps.append(cyl3("ICPS_feed", (R_UPPER + 0.012, Y_ICPS0 + 0.48, 0), (R_UPPER + 0.012, Y_ICPS1 - 0.04, 0), 0.014, seg=10, mat_name="alu"))
for k in range(12):
    a0 = k * TAU / 12
    a1 = (k + 0.5) * TAU / 12
    icps.append(cyl3(f"ICPS_trussA{k}", (math.cos(a0) * 0.25, Y_ICPS0 + 0.30, -math.sin(a0) * 0.25),
                     (math.cos(a1) * R_UPPER, Y_ICPS0 + 0.48, -math.sin(a1) * R_UPPER), 0.008, seg=6, mat_name="silver"))
ICPS = join_parts("ICPS", icps)
set_origin(ICPS, (0, (Y_ICPS0 + Y_OSA1) / 2, 0))


# ==========================================================================
# 4. ORION (ESM + CREW MODULE)
# ==========================================================================
orion_tex = PBRCanvas(1024, 1024, base_hex="#aeb3b8", rough=0.38, metal=0.55)


def ov(y):
    return (y - Y_OSA1) / (Y_CM1 - Y_OSA1)


orion_tex.paint_band(0.0, ov(Y_OSA1 + 0.11), "#6d7278", rough=0.42, metal=0.6)
orion_tex.paint_quadrants(ov(Y_OSA1 + 0.13), ov(Y_SM1 - 0.10), n_quads=8, u_offset=0.0, col_a="#d29c32", col_b="#b8bdc2", rough_a=0.28, rough_b=0.36)
y_esm0, y_esm1 = orion_tex._vy(ov(Y_OSA1 + 0.13), ov(Y_SM1 - 0.10))
orion_tex.metal[y_esm0:y_esm1] = 0.78
orion_tex.add_quilted_blanket(ov(Y_OSA1 + 0.13), ov(Y_SM1 - 0.10), n_cols=24, n_rows=8)
orion_tex.paint_band(ov(Y_SM1 - 0.06), ov(Y_SM1 + 0.02), "#24272c", rough=0.65, metal=0.2)
orion_tex.paint_band(ov(Y_SM1 + 0.02), 1.0, "#cfd4d9", rough=0.34, metal=0.65)
orion_tex.add_panel_grid(ov(Y_SM1 + 0.03), 0.96, n_cols=16, n_rows=5, color_var=0.02, seam_px=2)
for du in (-0.04, 0.04):
    u_w = (U_FRONT + du) % 1.0
    orion_tex.paint_rect_uv(u_w - 0.015, ov(Y_SM1 + 0.16), u_w + 0.015, ov(Y_SM1 + 0.24), "#101720", rough=0.12, metal=0.1, height_delta=-0.2)
MATS["orion_pbr"] = orion_tex.build_material("SLS_Orion_PBR", normal_strength=2.0)

orion = []
orion.append(lathe_uv("ORION_hull", [
    (R_UPPER * 0.98, Y_OSA1), (0.25, Y_OSA1 + 0.10),
    (0.25, Y_SM1 - 0.04), (0.262, Y_SM1),
    (0.275, Y_SM1 + 0.03), (0.265, Y_SM1 + 0.05),
    (0.17, Y_CM1 - 0.12), (0.09, Y_CM1 - 0.02), (0.06, Y_CM1), (0.0, Y_CM1),
], seg=64, mat_name="orion_pbr", y_min=Y_OSA1, y_max=Y_CM1, u_full=True))

for k in range(4):
    a = math.pi / 4 + k * math.pi / 2
    wx, wz = math.cos(a) * 0.262, -math.sin(a) * 0.262
    orion.append(box3(f"ORION_wing{k}", (0.075, 0.42, 0.012), (wx, (Y_OSA1 + Y_SM1) / 2 + 0.02, wz),
                      rot_z_bl=a + math.pi / 2, mat_name="solar", bevel=0.002))
    orion.append(box3(f"ORION_hinge{k}", (0.035, 0.04, 0.022), (wx * 0.96, Y_OSA1 + 0.14, wz * 0.96),
                      rot_z_bl=a + math.pi / 2, mat_name="alu"))

for k in range(4):
    a = k * math.pi / 2
    cx, cz = math.cos(a) * 0.256, -math.sin(a) * 0.256
    orion.append(box3(f"ORION_rcs{k}", (0.03, 0.055, 0.045), (cx, Y_SM1 - 0.11, cz), rot_z_bl=a, mat_name="grey", bevel=0.004))

ORION = join_parts("ORION", orion)
set_origin(ORION, (0, (Y_OSA1 + Y_CM1) / 2, 0))


# ==========================================================================
# 5. FAIRING_0..2 (Spacecraft Adapter Jettisonable Fairings)
# ==========================================================================
fair_tex = PBRCanvas(512, 512, base_hex="#efeee7", rough=0.44, metal=0.0)
fair_tex.add_panel_grid(0.05, 0.95, n_cols=4, n_rows=4, color_var=0.015, seam_px=2)
fair_tex.paint_band(0.84, 0.92, "#17191d", rough=0.55)
fair_tex.draw_nasa_meatball(0.35, 0.56, 0.12, 0.12)
fair_tex.draw_us_flag(0.66, 0.56, 0.18, 0.11)
MATS["fairing_pbr"] = fair_tex.build_material("SLS_Fairing_PBR", normal_strength=1.8)

for k in range(3):
    phi0 = FRONT + math.radians(30) + k * TAU / 3
    prof = [(0.285, Y_OSA1 - 0.02), (0.292, Y_OSA1 + 0.10), (0.292, Y_SM1 - 0.08), (0.282, Y_SM1 + 0.02)]
    o = lathe_uv(f"FAIRING_{k}", prof, seg=28, mat_name="fairing_pbr",
                 phi0=phi0, phi_span=TAU / 3 - 0.012, cap_bottom=False, cap_top=False, u_full=False)
    mod = o.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = 0.011
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier="solid")
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    mid = phi0 + (TAU / 3) / 2
    set_origin(o, (math.cos(mid) * 0.29, Y_OSA1, -math.sin(mid) * 0.29))


# ==========================================================================
# 6. LAUNCH ABORT SYSTEM (LAS)
# ==========================================================================
las_tex = PBRCanvas(1024, 1024, base_hex="#f0efe9", rough=0.42, metal=0.0)


def lv(y):
    return (y - (Y_LAS0 - 0.02)) / (Y_LAS_TOP - (Y_LAS0 - 0.02))


las_tex.add_panel_grid(0.02, lv(Y_LAS_FAIR1), n_cols=12, n_rows=4, color_var=0.014, seam_px=2)
las_tex.paint_band(lv(Y_LAS0 + 0.08), lv(Y_LAS0 + 0.13), "#17191d", rough=0.55)
las_tex.paint_band(lv(Y_LAS_FAIR1 - 0.04), lv(Y_LAS_FAIR1 + 0.02), "#5e6369", rough=0.45, metal=0.5)
las_tex.paint_band(lv(Y_LAS_TOP - 0.43), lv(Y_LAS_TOP - 0.30), "#272a30", rough=0.45, metal=0.6)
las_tex.paint_band(lv(Y_LAS_TOP - 0.11), 1.0, "#17191d", rough=0.5)
for du in (-0.035, 0.035):
    u_w = (U_FRONT + du) % 1.0
    las_tex.paint_rect_uv(u_w - 0.012, lv(Y_LAS0 + 0.24), u_w + 0.012, lv(Y_LAS0 + 0.33), "#141a22", rough=0.15, metal=0.15, height_delta=-0.18)
MATS["las_pbr"] = las_tex.build_material("SLS_LAS_PBR", normal_strength=1.8)

las = []
fair_prof = [(0.292, Y_LAS0 - 0.02)]
n = 16
for i in range(n + 1):
    t = i / n
    r = 0.085 + (0.292 - 0.085) * math.cos(t * math.pi / 2) ** 1.3
    fair_prof.append((r, Y_LAS0 + (Y_LAS_FAIR1 - Y_LAS0) * t))
las.append(lathe_uv("LAS_fairing", fair_prof, seg=72, mat_name="las_pbr",
                    y_min=Y_LAS0 - 0.02, y_max=Y_LAS_TOP, u_full=True, cap_bottom=False))
las.append(lathe_uv("LAS_tower", [
    (0.074, Y_LAS_FAIR1 - 0.02), (0.074, Y_LAS_FAIR1 + 0.26),
    (0.064, Y_LAS_FAIR1 + 0.30), (0.064, Y_LAS_TOP - 0.42),
    (0.078, Y_LAS_TOP - 0.42), (0.078, Y_LAS_TOP - 0.30),
    (0.064, Y_LAS_TOP - 0.30), (0.064, Y_LAS_TOP - 0.17),
    (0.052, Y_LAS_TOP - 0.10), (0.028, Y_LAS_TOP - 0.03), (0.0, Y_LAS_TOP),
], seg=48, mat_name="las_pbr", y_min=Y_LAS0 - 0.02, y_max=Y_LAS_TOP, u_full=True))

for k in range(4):
    a = math.pi / 4 + k * math.pi / 2
    c, s = math.cos(a), -math.sin(a)
    las.append(cyl3(f"LAS_noz{k}", (c * 0.055, Y_LAS_FAIR1 + 0.22, s * 0.055),
                    (c * 0.135, Y_LAS_FAIR1 + 0.07, s * 0.135), 0.020, 0.036, seg=14, mat_name="nozzle"))
    las.append(cyl3(f"LAS_nozboot{k}", (c * 0.045, Y_LAS_FAIR1 + 0.23, s * 0.045),
                    (c * 0.095, Y_LAS_FAIR1 + 0.16, s * 0.095), 0.024, 0.026, seg=12, mat_name="grey"))

for k in range(8):
    a = k * TAU / 8
    c, s = math.cos(a), -math.sin(a)
    las.append(cyl3(f"LAS_acm_port{k}", (c * 0.072, Y_LAS_TOP - 0.36, s * 0.072),
                    (c * 0.094, Y_LAS_TOP - 0.36, s * 0.094), 0.008, 0.012, seg=8, mat_name="black"))

for k in range(2):
    a = k * math.pi + STACK_YAW
    c, s = math.cos(a), -math.sin(a)
    las.append(cyl3(f"LAS_jmn{k}", (c * 0.048, Y_LAS_TOP - 0.22, s * 0.048),
                    (c * 0.095, Y_LAS_TOP - 0.275, s * 0.095), 0.012, 0.022, seg=10, mat_name="nozzle"))

LAS = join_parts("LAS", las)
set_origin(LAS, (0, Y_LAS0, 0))


# ==========================================================================
# Export
# ==========================================================================
for ob in bpy.context.scene.objects:
    ob.select_set(ob.type == "MESH")
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_image_format="AUTO",
)
print("EXPORTED", OUT, sorted(o.name for o in bpy.context.scene.objects if o.type == "MESH"))
