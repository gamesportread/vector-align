"""
Procedural Apollo 11 Saturn V (SA-506) GLB generator for VectorAlign Mission 1.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build_saturn_v.py -- public/models/saturn_v.glb

True NASA Apollo 11 dimensions in Three.js rocket frame (1 m = 0.11 units):
  S-IC & S-II diameter = 10.06 m -> R1 = 0.553
  S-IVB & IU diameter  =  6.60 m -> R3 = 0.363
  Apollo CSM diameter  =  3.91 m -> R_CSM = 0.215
  Fin tip span radius  =  9.45 m -> 1.040
  Height (F-1 exit -5.34 to LES Q-ball +6.85) = 12.19 units (110.8 m)

Runtime node names & local origins preserved for LiftoffScene3D.tsx:
  SIC, SII, SIVB, CSM, SLA_POS, SLA_NEG, LES
"""

import bmesh
import bpy
import math
import numpy as np
import os
import sys
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rocket_textures import PBRCanvas

TAU = math.tau

argv = sys.argv
OUT = argv[argv.index("--") + 1] if "--" in argv else "public/models/saturn_v.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def P(x, y, z):
    """Map Three.js (x, y_up, z) -> Blender (x, -z, y_up)."""
    return Vector((x, -z, y))


def new_obj(name, mesh):
    o = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(o)
    return o


def make_mat(name, color_hex, roughness=0.5, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    h = color_hex.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

    def to_lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    bsdf.inputs["Base Color"].default_value = (to_lin(r), to_lin(g), to_lin(b), 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m


MATS = {
    "white": make_mat("SV_White", "#f1f0ea", 0.42, 0.0),
    "black": make_mat("SV_Black", "#16181c", 0.56, 0.04),
    "silver": make_mat("SV_Silver", "#c8cdd2", 0.28, 0.85),
    "alu": make_mat("SV_Alu", "#9ea4ab", 0.34, 0.82),
    "grey": make_mat("SV_DarkGrey", "#3b4046", 0.46, 0.55),
    "gold": make_mat("SV_GoldKapton", "#d49c2a", 0.26, 0.88),
    "red": make_mat("SV_Red", "#b8241d", 0.40, 0.0),
    "glass": make_mat("SV_Glass", "#0c141d", 0.08, 0.15),
    "brass": make_mat("SV_Brass", "#a68238", 0.34, 0.82),
}


def ensure_mats(obj, mat_names):
    for nm in mat_names:
        m = MATS[nm]
        if m.name not in [ms.name for ms in obj.data.materials]:
            obj.data.materials.append(m)
    return {nm: list(obj.data.materials).index(MATS[nm]) for nm in mat_names}


def lathe_uv(name, profile, x=0.0, z=0.0, seg=72, mat_name="white",
             phi0=0.0, phi_span=TAU, cap_bottom=True, cap_top=True,
             y_min=None, y_max=None, u_full=True):
    """Build revolved geometry around vertical Three.js Y-axis with clean cylindrical UVs."""
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    mid = ensure_mats(o, [mat_name])[mat_name]
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    closed = abs(phi_span - TAU) < 1e-4
    n_s = seg if closed else seg + 1
    phis = [phi0 + (i / seg) * phi_span for i in range(n_s)]
    rings = []

    ys = [p[1] for p in profile]
    ymin = min(ys) if y_min is None else y_min
    ymax = max(ys) if y_max is None else y_max
    yspan = max(1e-6, ymax - ymin)

    for r, y in profile:
        if r <= 1e-5:
            rings.append([bm.verts.new(P(x, y, z))])
        else:
            rings.append([
                bm.verts.new(P(x + r * math.cos(p), y, z - r * math.sin(p)))
                for p in phis
            ])

    def uv_at(i_col, r_val, y_val):
        u = (phis[i_col % n_s] / TAU) if u_full else (i_col / max(1, seg))
        v = max(0.001, min(0.999, (y_val - ymin) / yspan))
        return (u, v)

    for j in range(len(profile) - 1):
        r0_list, r1_list = rings[j], rings[j + 1]
        _, y0 = profile[j]
        _, y1 = profile[j + 1]
        if len(r0_list) == 1 and len(r1_list) == 1:
            continue
        for i in range(seg):
            i2 = (i + 1) % n_s if closed else i + 1
            if not closed and i2 >= len(r0_list) and len(r0_list) > 1:
                continue
            if len(r0_list) == 1:
                f = bm.faces.new((r0_list[0], r1_list[i], r1_list[i2]))
                f.material_index = mid
                uvs = [(0.5, uv_at(i, 0, y0)[1]), uv_at(i, 1, y1), uv_at(i2, 1, y1)]
            elif len(r1_list) == 1:
                f = bm.faces.new((r0_list[i], r0_list[i2], r1_list[0]))
                f.material_index = mid
                uvs = [uv_at(i, 1, y0), uv_at(i2, 1, y0), (0.5, uv_at(i, 0, y1)[1])]
            else:
                f = bm.faces.new((r0_list[i], r0_list[i2], r1_list[i2], r1_list[i]))
                f.material_index = mid
                u_a = (phis[i] / TAU) if u_full else (i / seg)
                u_b = ((phis[i] + phi_span / seg) / TAU) if u_full else ((i + 1) / seg)
                v0 = max(0.001, min(0.999, (y0 - ymin) / yspan))
                v1 = max(0.001, min(0.999, (y1 - ymin) / yspan))
                uvs = [(u_a, v0), (u_b, v0), (u_b, v1), (u_a, v1)]
            for loop, uv in zip(f.loops, uvs):
                loop[uv_layer].uv = uv

    if closed and cap_bottom and len(rings[0]) > 2:
        f = bm.faces.new(list(reversed(rings[0])))
        f.material_index = mid
        for loop in f.loops:
            loop[uv_layer].uv = (0.5, 0.01)
    if closed and cap_top and len(rings[-1]) > 2:
        f = bm.faces.new(rings[-1])
        f.material_index = mid
        for loop in f.loops:
            loop[uv_layer].uv = (0.5, 0.99)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    return o


def cyl3(name, p0, p1, r, seg=14, mat_name="alu", caps=True):
    a, b = P(*p0), P(*p1)
    dv = b - a
    ln = dv.length
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    ensure_mats(o, [mat_name])
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=caps, cap_tris=False, segments=seg,
        radius1=r, radius2=r, depth=ln,
    )
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            loop[uv_layer].uv = (0.5, 0.5)
    bm.to_mesh(me)
    bm.free()
    mid = (a + b) * 0.5
    q = Vector((0, 0, 1)).rotation_difference(dv.normalized())
    o.matrix_world = Matrix.Translation(mid) @ q.to_matrix().to_4x4()
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


def build_f1_fairing(name, phi, r_core, r_peak, y_bot, y_top, mat_name="black"):
    """Build a sculpted teardrop F-1 engine fairing protruding along radial angle phi."""
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    ensure_mats(o, [mat_name])
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    n_rows = 12
    n_arc = 9
    grid = []
    for j in range(n_rows + 1):
        t = j / n_rows  # 0 at bottom skirt, 1 at fairing apex
        y = y_bot + (y_top - y_bot) * t
        # Skirt bulge stays wide near bottom, tapers cleanly into hull at t=1
        bulge = (r_peak - r_core) * ((1.0 - t) ** 1.35) * (0.85 + 0.15 * math.cos(t * math.pi))
        half_ang = math.radians(17.5 * (1.0 - 0.65 * t ** 1.2))
        row = []
        for i in range(n_arc):
            s = (i / (n_arc - 1)) * 2.0 - 1.0  # -1..+1 across azimuthal width
            ang = s * half_ang
            prof = math.cos(s * math.pi * 0.5) ** 1.15
            rad = r_core - 0.01 + bulge * prof
            lx = rad * math.cos(ang)
            lz = -rad * math.sin(ang)
            row.append(bm.verts.new(P(lx, y, lz)))
        grid.append(row)

    for j in range(n_rows):
        for i in range(n_arc - 1):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop in f.loops:
                loop[uv_layer].uv = (0.5, 0.5)

    # Bottom cap closing against thrust skirt
    bot_center = bm.verts.new(P(r_core - 0.02, y_bot, 0.0))
    for i in range(n_arc - 1):
        f = bm.faces.new((bot_center, grid[0][i + 1], grid[0][i]))
        for loop in f.loops:
            loop[uv_layer].uv = (0.5, 0.5)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o.matrix_world = Matrix.Rotation(phi, 4, "Z")
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    return o


def build_swept_fin(name, phi, r_root, r_tip, y_bot, y_root_top, y_tip_top, mat_name="white"):
    """Build aerodynamic diamond-section swept stabilizer fin with root fillet."""
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    ensure_mats(o, [mat_name])
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    # Sharp leading/trailing edges + thick center ridge for sleek supersonic delta look
    r_mid = r_root + (r_tip - r_root) * 0.45
    y_le_mid = y_root_top - (y_root_top - y_tip_top) * 0.45
    y_bot_mid = y_bot
    root_t = 0.022
    tip_t = 0.006

    v_r_bot = bm.verts.new(P(r_root, y_bot, 0.0))
    v_r_top = bm.verts.new(P(r_root, y_root_top, 0.0))
    v_r_pos = bm.verts.new(P(r_root, (y_bot + y_root_top) * 0.48, root_t))
    v_r_neg = bm.verts.new(P(r_root, (y_bot + y_root_top) * 0.48, -root_t))

    v_m_bot = bm.verts.new(P(r_mid, y_bot_mid, 0.0))
    v_m_top = bm.verts.new(P(r_mid, y_le_mid, 0.0))
    v_m_pos = bm.verts.new(P(r_mid, (y_bot_mid + y_le_mid) * 0.48, root_t * 0.65))
    v_m_neg = bm.verts.new(P(r_mid, (y_bot_mid + y_le_mid) * 0.48, -root_t * 0.65))

    v_t_bot = bm.verts.new(P(r_tip, y_bot + 0.02, 0.0))
    v_t_top = bm.verts.new(P(r_tip, y_tip_top, 0.0))
    v_t_pos = bm.verts.new(P(r_tip, (y_bot + 0.02 + y_tip_top) * 0.5, tip_t))
    v_t_neg = bm.verts.new(P(r_tip, (y_bot + 0.02 + y_tip_top) * 0.5, -tip_t))

    faces = [
        (v_r_bot, v_m_bot, v_m_pos, v_r_pos), (v_r_pos, v_m_pos, v_m_top, v_r_top),
        (v_r_bot, v_r_neg, v_m_neg, v_m_bot), (v_r_neg, v_r_top, v_m_top, v_m_neg),
        (v_m_bot, v_t_bot, v_t_pos, v_m_pos), (v_m_pos, v_t_pos, v_t_top, v_m_top),
        (v_m_bot, v_m_neg, v_t_neg, v_t_bot), (v_m_neg, v_m_top, v_t_top, v_t_neg),
        (v_t_bot, v_t_neg, v_t_top, v_t_pos),
        (v_r_bot, v_r_pos, v_r_top, v_r_neg),
    ]
    for verts in faces:
        f = bm.faces.new(verts)
        for loop in f.loops:
            loop[uv_layer].uv = (0.5, 0.5)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o.matrix_world = Matrix.Rotation(phi, 4, "Z")
    return o


def join_parts(name, objs, smooth_deg=36):
    bpy.ops.object.select_all(action="DESELECT")
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
    """Recenter geometry around origin3 while keeping node translation (0,0,0) for DetailedRocket3D."""
    off = P(*origin3)
    o.data.transform(Matrix.Translation(-off))
    o.location = Vector((0.0, 0.0, 0.0))


# --------------------------------------------------------------------------
# True NASA Apollo 11 SA-506 Dimensions (Three.js units, 1 m = 0.11 units)
# --------------------------------------------------------------------------
Y_DECK = -4.85
R1 = 0.553       # S-IC & S-II radius (10.06 m dia)
R3 = 0.363       # S-IVB & IU radius (6.60 m dia)
R_CSM = 0.215    # Apollo CSM radius (3.91 m dia)

# Vertical milestones (m -> * 0.11):
Y_SIC0 = -4.80     # Thrust skirt base resting on hold-downs (-4.85)
Y_SIC_TANK0 = -3.72
Y_SIC_IT0 = -0.92
Y_SIC_IS0 = -0.66  # S-IC / S-II interstage bottom
Y_SIC_TOP = -0.03  # S-IC / S-II interstage top (sep plane)

Y_SII0 = -0.03
Y_SII_AFT1 = 0.18
Y_SII_TANK1 = 2.07
Y_SII_TOP = 2.70   # S-II / S-IVB tapered interstage top (sep plane)

Y_SIVB0 = 2.70
Y_SIVB_AFT1 = 2.98
Y_IU0 = 4.03
Y_IU1 = 4.15       # Top of Instrument Unit / bottom hinge of SLA

Y_SLA1 = 5.09      # Top of SLA (radius R3 -> R_CSM)
Y_SM1 = 5.59       # Top of Service Module
Y_CM1 = 5.94       # Apex of Command Module

Y_BPC0 = 5.58
Y_BPC1 = 5.96
Y_TOWER1 = 6.44
Y_LES_TOP = 6.85   # Q-Ball tip (total -5.34 .. +6.85 = 12.19 units = 110.8 m)

U_FRONT = 0.75     # +Z face toward default Three.js camera
U_BACK = 0.25      # -Z face


# ==========================================================================
# 1. S-IC FIRST STAGE + S-IC/S-II INTERSTAGE
# ==========================================================================
sic_tex = PBRCanvas(1024, 2048, base_hex="#f1f0ea", rough=0.40, metal=0.0)


def v1(y):
    return (y - Y_SIC0) / (Y_SIC_TOP - Y_SIC0)


sic_tex.paint_quadrants(v1(Y_SIC0), v1(Y_SIC_TANK0), n_quads=4, u_offset=0.125, phase=0,
                        col_a="#15171b", col_b="#f1f0ea", rough_a=0.55, rough_b=0.40)
sic_tex.add_corrugation(v1(Y_SIC0), v1(Y_SIC_TANK0), n_ribs=72, amp=0.52, ao_dark=0.14)
sic_tex.add_panel_grid(v1(Y_SIC_TANK0), v1(Y_SIC_IT0), n_cols=16, n_rows=10, color_var=0.015, seam_px=2)
sic_tex.add_soot_gradient(0.0, v1(Y_SIC0 + 0.30), strength=0.30, dark_at_bottom=True)

# Ring weld frames on thrust skirt & intertank transition (keep main USA zone uninterrupted)
for ry in (-3.68, -0.94):
    sic_tex.paint_band(v1(ry - 0.018), v1(ry + 0.018), "#2c3036", rough=0.48, metal=0.45, height_delta=0.18)

# Black forward LOX skirt band + corrugated black S-IC/S-II interstage
sic_tex.paint_band(v1(Y_SIC_IT0), v1(Y_SIC_TOP), "#15171b", rough=0.56)
sic_tex.add_corrugation(v1(Y_SIC_IT0), v1(Y_SIC_TOP - 0.04), n_ribs=72, amp=0.55, ao_dark=0.16)
sic_tex.paint_band(v1(Y_SIC_IS0 - 0.015), v1(Y_SIC_IS0 + 0.015), "#656b73", rough=0.40, metal=0.65, height_delta=0.25)
sic_tex.paint_band(v1(Y_SIC_TOP - 0.03), 1.0, "#757b82", rough=0.38, metal=0.70, height_delta=0.25)

# Authentic Apollo 11 SA-506 markings: bold black stacked U S A + US Flag + Roll targets
for u_p in (U_FRONT, U_BACK):
    sic_tex.draw_vertical_letters("USA", u_p, v1(-1.42), 0.135, 0.068, 0.018, hex_col="#121417")
    sic_tex.draw_us_flag((u_p + 0.075) % 1.0, v1(-1.12), 0.068, 0.017)
for u_p in (0.0, 0.25, 0.50, 0.75):
    sic_tex.draw_crosshair_target((u_p + 0.125) % 1.0, v1(-3.35), 0.014, 0.0055)
    sic_tex.draw_crosshair_target((u_p + 0.125) % 1.0, v1(-1.05), 0.014, 0.0055)

MATS["sic_pbr"] = sic_tex.build_material("SV_SIC_PBR", normal_strength=2.2)

sic = []
sic_prof = [(R1 * 0.96, Y_SIC0)]
y = Y_SIC0
while y < Y_SIC_TOP - 0.01:
    y = min(Y_SIC_TOP, y + 0.18)
    sic_prof.append((R1, y))
sic.append(lathe_uv("SIC_hull", sic_prof, seg=96, mat_name="sic_pbr",
                    y_min=Y_SIC0, y_max=Y_SIC_TOP, u_full=True, cap_bottom=True, cap_top=True))

# Heatshield bottom deck plate & center F-1 mount ring
sic.append(lathe_uv("SIC_heatshield", [(R1 * 0.96, Y_SIC0 + 0.005), (0.36, Y_SIC0 - 0.025), (0.0, Y_SIC0 - 0.03)],
                    seg=64, mat_name="alu", cap_bottom=False))
for ex, ez in ((0.0, 0.0), (0.28, 0.28), (-0.28, 0.28), (-0.28, -0.28), (0.28, -0.28)):
    sic.append(lathe_uv(f"SIC_f1dome_{ex}_{ez}", [(0.11, Y_SIC0), (0.10, Y_SIC0 - 0.03), (0.08, Y_SIC0 - 0.04)],
                        x=ex, z=ez, seg=24, mat_name="grey", cap_bottom=False))

# Structural flange rings at tank & interstage boundaries
for fy in (Y_SIC_TANK0, Y_SIC_IT0, Y_SIC_IS0, Y_SIC_TOP - 0.015):
    sic.append(lathe_uv(f"SIC_flange_{fy:.2f}",
                        [(R1 - 0.005, fy - 0.016), (R1 + 0.009, fy - 0.014),
                         (R1 + 0.009, fy + 0.014), (R1 - 0.005, fy + 0.016)],
                        seg=72, mat_name="black", cap_bottom=False, cap_top=False))

# Twin LOX external pressurized feedlines + vertical cable tunnels
for k, phi in enumerate((0.0, math.pi)):
    c, s = math.cos(phi), -math.sin(phi)
    rr = R1 + 0.015
    sic.append(box3(f"SIC_tunnel{k}", (0.034, 3.05, 0.048),
                    (c * rr, (Y_SIC_TANK0 + Y_SIC_IS0) * 0.5, s * rr),
                    rot_z_bl=-phi, mat_name="white", bevel=0.004))
for k, phi in enumerate((math.radians(22), math.pi + math.radians(22))):
    c, s = math.cos(phi), -math.sin(phi)
    rr = R1 + 0.016
    sic.append(cyl3(f"SIC_loxline{k}", (c * rr, Y_SIC_TANK0 + 0.12, s * rr),
                    (c * rr, Y_SIC_IT0 + 0.04, s * rr), 0.014, seg=10, mat_name="white"))

# 4 sculpted F-1 fairings + swept delta fins + hold-down forging shoes (aligned with HDA_0..3)
for k in range(4):
    phi = math.pi / 4 + k * math.pi / 2
    c, s = math.cos(phi), -math.sin(phi)
    sic.append(build_f1_fairing(f"SIC_f1fair{k}", phi, R1, 0.695, Y_SIC0, Y_SIC0 + 1.25, mat_name="black"))
    sic.append(build_swept_fin(f"SIC_fin{k}", phi, 0.65, 1.04, Y_SIC0 + 0.16, Y_SIC0 + 0.78, Y_SIC0 + 0.36, mat_name="white"))
    # Hold-down forging shoe reaching ML deck (-4.85) under each fairing
    sic.append(box3(f"SIC_hdshoe{k}", (0.11, 0.11, 0.075), (c * 0.575, Y_DECK + 0.055, s * 0.575),
                    rot_z_bl=phi, mat_name="alu", bevel=0.006))

# 8 retrorocket / ullage motor housings around S-IC/S-II interstage
for k in range(4):
    base_ang = k * math.pi / 2 + math.pi / 4
    for dphi in (-0.11, 0.11):
        phi = base_ang + dphi
        c, s = math.cos(phi), -math.sin(phi)
        sic.append(box3(f"SIC_retro{k}_{dphi:.2f}", (0.045, 0.26, 0.036),
                        (c * (R1 + 0.014), Y_SIC_IS0 + 0.19, s * (R1 + 0.014)),
                        rot_z_bl=-phi, mat_name="black", bevel=0.005))

SIC = join_parts("SIC", sic)
set_origin(SIC, (0.0, (Y_SIC0 + Y_SIC_TOP) * 0.5, 0.0))


# ==========================================================================
# 2. S-II SECOND STAGE + S-II/S-IVB TAPERED INTERSTAGE
# ==========================================================================
sii_tex = PBRCanvas(1024, 2048, base_hex="#f1f0ea", rough=0.40, metal=0.0)


def v2(y):
    return (y - Y_SII0) / (Y_SII_TOP - Y_SII0)


sii_tex.paint_band(0.0, v2(Y_SII_AFT1), "#15171b", rough=0.56)
sii_tex.add_corrugation(0.0, v2(Y_SII_AFT1), n_ribs=72, amp=0.55, ao_dark=0.16)
sii_tex.add_panel_grid(v2(Y_SII_AFT1), v2(Y_SII_TANK1), n_cols=16, n_rows=8, color_var=0.015, seam_px=2)
sii_tex.add_corrugation(v2(Y_SII_TANK1 - 0.22), v2(Y_SII_TANK1), n_ribs=72, amp=0.42, ao_dark=0.12)
sii_tex.paint_band(v2(Y_SII_TANK1 - 0.025), v2(Y_SII_TANK1 + 0.02), "#585e65", rough=0.42, metal=0.65, height_delta=0.22)

# Iconic tapered S-II / S-IVB interstage alternating black-and-white roll quadrants
sii_tex.paint_quadrants(v2(Y_SII_TANK1), 1.0, n_quads=4, u_offset=0.125, phase=0,
                        col_a="#15171b", col_b="#f1f0ea", rough_a=0.55, rough_b=0.40)
sii_tex.add_corrugation(v2(Y_SII_TANK1 + 0.02), v2(Y_SII_TOP - 0.02), n_ribs=64, amp=0.48, ao_dark=0.14)
sii_tex.paint_band(v2(Y_SII_TOP - 0.025), 1.0, "#6c7278", rough=0.38, metal=0.68, height_delta=0.22)

# Authentic Red UNITED STATES + US Flag + targets on S-II
for u_p in (U_FRONT, U_BACK):
    sii_tex.draw_text("UNITED STATES", u_p, v2(1.06), 0.050, 0.44, hex_col="#c1241c", rotate_ccw_deg=90.0)
    sii_tex.draw_us_flag((u_p + 0.08) % 1.0, v2(1.62), 0.068, 0.026)
for u_p in (0.125, 0.375, 0.625, 0.875):
    sii_tex.draw_crosshair_target(u_p, v2(0.45), 0.014, 0.008)

MATS["sii_pbr"] = sii_tex.build_material("SV_SII_PBR", normal_strength=2.2)

sii = []
sii_prof = [(R1 * 0.99, Y_SII0)]
y = Y_SII0
while y < Y_SII_TANK1 - 0.01:
    y = min(Y_SII_TANK1, y + 0.22)
    sii_prof.append((R1, y))
for i in range(1, 13):
    t = i / 12
    sii_prof.append((R1 + (R3 - R1) * t, Y_SII_TANK1 + (Y_SII_TOP - Y_SII_TANK1) * t))

sii.append(lathe_uv("SII_hull", sii_prof, seg=88, mat_name="sii_pbr",
                    y_min=Y_SII0, y_max=Y_SII_TOP, u_full=True, cap_bottom=True, cap_top=True))
sii.append(lathe_uv("SII_aftdome", [(R1 * 0.98, Y_SII0), (0.34, Y_SII0 - 0.03), (0.0, Y_SII0 - 0.04)],
                    seg=48, mat_name="alu", cap_bottom=False))
for k in range(2):
    phi = k * math.pi + math.radians(15)
    c, s = math.cos(phi), -math.sin(phi)
    sii.append(box3(f"SII_tunnel{k}", (0.028, 1.85, 0.040),
                    (c * (R1 + 0.014), (Y_SII_AFT1 + Y_SII_TANK1) * 0.5, s * (R1 + 0.014)),
                    rot_z_bl=-phi, mat_name="white", bevel=0.004))

SII = join_parts("SII", sii)
set_origin(SII, (0.0, (Y_SII0 + Y_SII_TOP) * 0.5, 0.0))


# ==========================================================================
# 3. S-IVB THIRD STAGE + INSTRUMENT UNIT (IU)
# ==========================================================================
sivb_tex = PBRCanvas(1024, 1024, base_hex="#f1f0ea", rough=0.40, metal=0.0)


def v3(y):
    return (y - Y_SIVB0) / (Y_IU1 - Y_SIVB0)


sivb_tex.paint_quadrants(0.0, v3(Y_SIVB_AFT1), n_quads=4, u_offset=0.125, phase=1,
                         col_a="#15171b", col_b="#f1f0ea", rough_a=0.55, rough_b=0.40)
sivb_tex.add_panel_grid(v3(Y_SIVB_AFT1), v3(Y_IU0), n_cols=16, n_rows=5, color_var=0.015, seam_px=2)
sivb_tex.add_corrugation(v3(Y_SIVB0), v3(Y_SIVB_AFT1), n_ribs=48, amp=0.45, ao_dark=0.14)
sivb_tex.paint_band(v3(Y_SIVB_AFT1 - 0.012), v3(Y_SIVB_AFT1 + 0.012), "#656b73", rough=0.40, metal=0.65, height_delta=0.2)

# Instrument Unit black/metallic telemetry collar
sivb_tex.paint_band(v3(Y_IU0), 1.0, "#181a1f", rough=0.52, metal=0.12)
sivb_tex.paint_band(v3(Y_IU0 - 0.012), v3(Y_IU0 + 0.010), "#767c84", rough=0.38, metal=0.72, height_delta=0.22)
for du in (0.04, 0.29, 0.54, 0.79):
    sivb_tex.paint_rect_uv(du, v3(Y_IU0 + 0.02), du + 0.055, v3(Y_IU1 - 0.02), "#b8bec4", rough=0.34, metal=0.78, height_delta=0.12)

for u_p in (U_FRONT, U_BACK):
    sivb_tex.draw_us_flag(u_p, v3(3.58), 0.11, 0.08)
    sivb_tex.draw_crosshair_target((u_p + 0.12) % 1.0, v3(3.58), 0.022, 0.028)

MATS["sivb_pbr"] = sivb_tex.build_material("SV_SIVB_PBR", normal_strength=2.0)

sivb = []
sivb.append(lathe_uv("SIVB_hull", [
    (R3 * 0.99, Y_SIVB0), (R3, Y_SIVB0 + 0.10), (R3, Y_SIVB_AFT1),
    (R3, Y_IU0), (R3, Y_IU1),
], seg=72, mat_name="sivb_pbr", y_min=Y_SIVB0, y_max=Y_IU1, u_full=True))
sivb.append(lathe_uv("SIVB_aftdome", [(R3 * 0.98, Y_SIVB0), (0.20, Y_SIVB0 - 0.04), (0.0, Y_SIVB0 - 0.05)],
                     seg=40, mat_name="alu", cap_bottom=False))
# Twin APS Auxiliary Propulsion Blister Pods + attitude nozzles
for k, phi in enumerate((0.0, math.pi)):
    c, s = math.cos(phi), -math.sin(phi)
    sivb.append(box3(f"SIVB_aps{k}", (0.055, 0.22, 0.048),
                     (c * (R3 + 0.020), Y_SIVB0 + 0.15, s * (R3 + 0.020)),
                     rot_z_bl=-phi, mat_name="white", bevel=0.008))
    sivb.append(box3(f"SIVB_tunnel{k}", (0.022, 1.02, 0.032),
                     (c * (R3 + 0.010), 3.48, s * (R3 + 0.010)),
                     rot_z_bl=-phi, mat_name="white", bevel=0.003))

SIVB = join_parts("SIVB", sivb)
set_origin(SIVB, (0.0, (Y_SIVB0 + Y_IU1) * 0.5, 0.0))


# ==========================================================================
# 4. SLA PETALS (SLA_POS & SLA_NEG, hinged at Y_IU1 = 4.15)
# ==========================================================================
sla_tex = PBRCanvas(512, 512, base_hex="#f1f0ea", rough=0.40, metal=0.0)
sla_tex.add_panel_grid(0.03, 0.97, n_cols=8, n_rows=6, color_var=0.016, seam_px=2)
# Bold vertical black roll stripes centered per petal quadrant
for u_s in (0.125, 0.375, 0.625, 0.875):
    sla_tex.paint_rect_uv(u_s - 0.045, 0.02, u_s + 0.045, 0.86, "#15171b", rough=0.55)
sla_tex.paint_band(0.0, 0.045, "#60666d", rough=0.42, metal=0.65, height_delta=0.18)
sla_tex.paint_band(0.94, 1.0, "#60666d", rough=0.42, metal=0.65, height_delta=0.18)
MATS["sla_pbr"] = sla_tex.build_material("SV_SLA_PBR", normal_strength=2.0)


def build_sla_half(name, phi0):
    prof = [(R3 - 0.01, Y_IU1), (R3, Y_IU1 + 0.06)]
    for i in range(1, 9):
        t = i / 8
        prof.append((R3 + (R_CSM - R3) * t, Y_IU1 + 0.06 + (Y_SLA1 - (Y_IU1 + 0.06)) * t))
    o = lathe_uv(name, prof, seg=36, mat_name="sla_pbr", phi0=phi0, phi_span=math.pi,
                 cap_bottom=False, cap_top=False, y_min=Y_IU1, y_max=Y_SLA1, u_full=True)
    mod = o.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = 0.012
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier="solid")
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(36))
    set_origin(o, (0.0, Y_IU1, 0.0))
    return o


SLA_POS = build_sla_half("SLA_POS", -math.pi / 2)
SLA_NEG = build_sla_half("SLA_NEG", math.pi / 2)


# ==========================================================================
# 5. APOLLO CSM + LUNAR MODULE (nested inside SLA, origin at Y_IU1 = 4.15)
# ==========================================================================
csm_tex = PBRCanvas(1024, 1024, base_hex="#c6cbd1", rough=0.30, metal=0.80)


def v4(y):
    return (y - Y_SLA1) / (Y_CM1 - Y_SLA1)


# Service Module silver aluminum skin + white environmental radiator panels + dark panel frames
csm_tex.paint_band(0.0, v4(Y_SLA1 + 0.04), "#5b6168", rough=0.40, metal=0.72)
csm_tex.add_panel_grid(0.04, v4(Y_SM1 - 0.02), n_cols=16, n_rows=6, color_var=0.025, seam_px=2)
csm_tex.paint_quadrants(v4(Y_SLA1 + 0.10), v4(Y_SM1 - 0.09), n_quads=8, u_offset=0.0,
                        col_a="#edf0f3", col_b="#b4bac2", rough_a=0.38, rough_b=0.28)
y_rad0, y_rad1 = csm_tex._vy(v4(Y_SLA1 + 0.10), v4(Y_SM1 - 0.09))
u_rad = ((np.arange(1024, dtype=float) + 0.5) / 1024.0 * 8.0).astype(int) % 2 == 0
import numpy as np
csm_tex.metal[y_rad0:y_rad1, u_rad] = 0.08
csm_tex.metal[y_rad0:y_rad1, ~u_rad] = 0.85

# Command Module heatshield rim & chrome-silver/white thermal shell + crew windows
csm_tex.paint_band(v4(Y_SM1 - 0.02), v4(Y_SM1 + 0.04), "#2a2d33", rough=0.58, metal=0.25)
csm_tex.paint_band(v4(Y_SM1 + 0.04), 1.0, "#dadfe5", rough=0.26, metal=0.86)
csm_tex.add_panel_grid(v4(Y_SM1 + 0.05), 0.96, n_cols=16, n_rows=4, color_var=0.015, seam_px=2)
for du in (-0.04, 0.04):
    uw = (U_FRONT + du) % 1.0
    csm_tex.paint_rect_uv(uw - 0.016, v4(Y_SM1 + 0.13), uw + 0.016, v4(Y_SM1 + 0.21), "#0e151f", rough=0.10, metal=0.1, height_delta=-0.18)

MATS["csm_pbr"] = csm_tex.build_material("SV_CSM_PBR", normal_strength=1.8)

csm = []
# Lunar Module tucked cleanly inside SLA (Y_IU1 + 0.04 .. Y_SLA1 - 0.10)
csm.append(box3("LM_descent", (0.28, 0.30, 0.28), (0.0, Y_IU1 + 0.28, 0.0), mat_name="gold", bevel=0.015))
csm.append(lathe_uv("LM_ascent", [(0.15, Y_IU1 + 0.44), (0.16, Y_IU1 + 0.66), (0.10, Y_IU1 + 0.78), (0.0, Y_IU1 + 0.78)],
                    seg=20, mat_name="alu"))
csm.append(box3("LM_ascent_cabin", (0.20, 0.20, 0.22), (0.0, Y_IU1 + 0.56, 0.04), mat_name="silver", bevel=0.01))
# Folded LM landing gear struts inside SLA envelope
for k in range(4):
    phi = k * math.pi / 2
    c, s = math.cos(phi), -math.sin(phi)
    csm.append(cyl3(f"LM_leg{k}", (c * 0.18, Y_IU1 + 0.22, s * 0.18), (c * 0.28, Y_IU1 + 0.06, s * 0.28), 0.010, seg=8, mat_name="gold"))

# SPS Engine Nozzle inside SLA + Service Module & Command Module
csm.append(lathe_uv("CSM_sps", [(0.04, Y_SLA1 + 0.01), (0.095, Y_SLA1 - 0.28), (0.088, Y_SLA1 - 0.28), (0.036, Y_SLA1 + 0.01)],
                    seg=32, mat_name="grey", cap_bottom=False))
csm.append(lathe_uv("CSM_hull", [
    (0.0, Y_SLA1), (R_CSM * 0.99, Y_SLA1 + 0.01), (R_CSM, Y_SLA1 + 0.06),
    (R_CSM, Y_SM1 - 0.02), (R_CSM * 1.02, Y_SM1 + 0.01),
    (R_CSM, Y_SM1 + 0.04), (0.15, Y_CM1 - 0.14), (0.06, Y_CM1 - 0.02), (0.0, Y_CM1),
], seg=64, mat_name="csm_pbr", y_min=Y_SLA1, y_max=Y_CM1, u_full=True))

# 4 RCS Thruster Quad Pods around Service Module + High-Gain Antenna dish folded aft
for k in range(4):
    phi = k * math.pi / 2 + math.pi / 4
    c, s = math.cos(phi), -math.sin(phi)
    px, pz = c * (R_CSM + 0.012), s * (R_CSM + 0.012)
    csm.append(box3(f"CSM_rcs{k}", (0.032, 0.065, 0.038), (px, Y_SM1 - 0.14, pz), rot_z_bl=-phi, mat_name="silver", bevel=0.004))
    for n_dy in (-0.03, 0.03):
        csm.append(cyl3(f"CSM_rcsnz{k}_{n_dy}", (px, Y_SM1 - 0.14 + n_dy * 0.4, pz),
                        (px, Y_SM1 - 0.14 + n_dy * 1.4, pz), 0.006, seg=8, mat_name="grey"))
csm.append(cyl3("CSM_dock_probe", (0.0, Y_CM1 - 0.01, 0.0), (0.0, Y_CM1 + 0.07, 0.0), 0.014, seg=12, mat_name="silver"))

CSM = join_parts("CSM", csm)
set_origin(CSM, (0.0, Y_IU1, 0.0))


# ==========================================================================
# 6. LAUNCH ESCAPE SYSTEM (BPC + Open Truss Tower + Escape Motor + Q-Ball)
# ==========================================================================
les_tex = PBRCanvas(512, 1024, base_hex="#f3f2ec", rough=0.38, metal=0.0)


def v5(y):
    return (y - Y_BPC0) / (Y_LES_TOP - Y_BPC0)


les_tex.add_panel_grid(0.02, v5(Y_BPC1), n_cols=12, n_rows=4, color_var=0.014, seam_px=2)
les_tex.paint_band(0.0, v5(Y_BPC0 + 0.05), "#2c3036", rough=0.52, metal=0.35)
les_tex.paint_band(v5(Y_TOWER1), v5(Y_TOWER1 + 0.06), "#2c3036", rough=0.45, metal=0.6)
les_tex.paint_band(v5(Y_LES_TOP - 0.14), v5(Y_LES_TOP - 0.07), "#b8241d", rough=0.38)
les_tex.paint_band(v5(Y_LES_TOP - 0.04), 1.0, "#8f969e", rough=0.32, metal=0.80)
for du in (-0.04, 0.04):
    uw = (U_FRONT + du) % 1.0
    les_tex.paint_rect_uv(uw - 0.016, v5(Y_BPC0 + 0.14), uw + 0.016, v5(Y_BPC0 + 0.22), "#111822", rough=0.12, height_delta=-0.16)
MATS["les_pbr"] = les_tex.build_material("SV_LES_PBR", normal_strength=1.6)

les = []
# Boost Protective Cover cone + Motor Skirt
les.append(lathe_uv("LES_bpc", [
    (R_CSM + 0.008, Y_BPC0), (R_CSM + 0.008, Y_BPC0 + 0.05),
    (0.158, Y_CM1 - 0.12), (0.068, Y_CM1 + 0.01), (0.072, Y_BPC1 + 0.05), (0.040, Y_BPC1 + 0.05),
], seg=64, mat_name="les_pbr", y_min=Y_BPC0, y_max=Y_LES_TOP, u_full=True, cap_bottom=False))

# Upper solid Escape Motor + Pitch Control Motor + Nose Q-Ball
les.append(lathe_uv("LES_motor", [
    (0.066, Y_TOWER1 - 0.02), (0.068, Y_TOWER1 + 0.02),
    (0.054, Y_TOWER1 + 0.04), (0.054, Y_LES_TOP - 0.10),
    (0.036, Y_LES_TOP - 0.04), (0.024, Y_LES_TOP - 0.02), (0.0, Y_LES_TOP),
], seg=36, mat_name="les_pbr", y_min=Y_BPC0, y_max=Y_LES_TOP, u_full=True))

# 4-legged open titanium Launch Escape Tower truss + diagonal X-braces + 4 canted nozzles
r_tr0, r_tr1 = 0.060, 0.044
y_tr0, y_tr1 = Y_BPC1 + 0.03, Y_TOWER1 + 0.01
for k in range(4):
    phi = math.pi / 4 + k * math.pi / 2
    phi_n = math.pi / 4 + ((k + 1) % 4) * math.pi / 2
    c0, s0 = math.cos(phi), -math.sin(phi)
    c1, s1 = math.cos(phi_n), -math.sin(phi_n)
    les.append(cyl3(f"LES_leg{k}", (c0 * r_tr0, y_tr0, s0 * r_tr0), (c0 * r_tr1, y_tr1, s0 * r_tr1), 0.0085, seg=8, mat_name="silver"))
    ym = (y_tr0 + y_tr1) * 0.5
    rm = (r_tr0 + r_tr1) * 0.5
    les.append(cyl3(f"LES_ring{k}", (c0 * rm, ym, s0 * rm), (c1 * rm, ym, s1 * rm), 0.006, seg=6, mat_name="silver"))
    les.append(cyl3(f"LES_diagA{k}", (c0 * r_tr0, y_tr0 + 0.03, s0 * r_tr0), (c1 * rm, ym, s1 * rm), 0.005, seg=6, mat_name="alu"))
    les.append(cyl3(f"LES_diagB{k}", (c0 * rm, ym, s0 * rm), (c1 * r_tr1, y_tr1 - 0.02, s1 * r_tr1), 0.005, seg=6, mat_name="alu"))
    les.append(cyl3(f"LES_noz{k}", (c0 * 0.052, Y_TOWER1 + 0.02, s0 * 0.052),
                    (c0 * 0.088, Y_TOWER1 - 0.05, s0 * 0.088), 0.014, seg=10, mat_name="grey"))

LES = join_parts("LES", les)
set_origin(LES, (0.0, Y_BPC1, 0.0))


# ==========================================================================
# Export single GLB with packed PBR maps
# ==========================================================================
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_texcoords=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)
print("EXPORTED", OUT, sorted(o.name for o in bpy.data.objects))
