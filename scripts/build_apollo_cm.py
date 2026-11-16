"""
Procedural NASA Apollo Block II Command Module (CM-107) GLB generator for VectorAlign Mission 4.

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/build_apollo_cm.py -- public/models/apollo_cm.glb

Scale matches LandingScene3D capsule frame:
  Base radius = 1.35 units (3.91 m full-scale CM diameter -> 1 scene unit ~ 1.45 m)
  Heat shield curvature bottom ~ -1.04, base shoulder = -0.68, apex cap top = +1.38

Named sub-objects preserved for runtime animation in LandingScene3D.tsx:
  CM_Hull        (primary 32.5 deg cone, recessed crew hatch, 4 sculpted windows, RCS pods, internal bulkhead & 4 retro nozzles)
  CM_ChuteBay    (forward recovery bay: docking tunnel, 3 main chute clevises, drogue & main mortar tubes)
  CM_ApexCap     (origin [0, 1.04, 0] - forward heat-shield cover that blows off on drogue deploy)
  CM_HeatShield  (origin [0, -0.78, 0] - detachable Avcoat honeycomb spherical heat shield)
"""

import bmesh
import bpy
import math
import numpy as np
import os
import sys
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rocket_textures import PBRCanvas, fbm_periodic, hex_srgb, srgb_to_linear

TAU = math.tau

argv = sys.argv
OUT = argv[argv.index("--") + 1] if "--" in argv else "public/models/apollo_cm.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def P(x, y, z):
    """Map Three.js (x, y_up, z) -> Blender (x, -z, y_up)."""
    return Vector((x, -z, y))


def new_obj(name, mesh):
    o = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(o)
    return o


def make_mat(name, color_hex, roughness=0.5, metallic=0.0, emission_hex=None, emission_strength=0.0):
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
    if emission_hex is not None and "Emission Color" in bsdf.inputs:
        eh = emission_hex.lstrip("#")
        er, eg, eb = (int(eh[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
        bsdf.inputs["Emission Color"].default_value = (to_lin(er), to_lin(eg), to_lin(eb), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return m


MATS = {
    "titanium": make_mat("CM_Titanium", "#3a404a", 0.36, 0.84),
    "dark_ti": make_mat("CM_DarkTi", "#1a1e24", 0.48, 0.72),
    "steel": make_mat("CM_Steel", "#9ca4ae", 0.24, 0.88),
    "silver": make_mat("CM_SilverFoil", "#d2d8df", 0.20, 0.90),
    "gold_kapton": make_mat("CM_GoldKapton", "#d49b28", 0.24, 0.90),
    "orange_beacon": make_mat("CM_BeaconOrange", "#d94e1f", 0.42, 0.08),
    "charcoal": make_mat("CM_Charcoal", "#121519", 0.72, 0.25),
    "glass": make_mat("CM_QuartzGlass", "#0b1a2c", 0.05, 0.18, emission_hex="#0d3559", emission_strength=0.35),
    "inconel": make_mat("CM_Inconel", "#2b2728", 0.42, 0.78),
    "kevlar": make_mat("CM_Kevlar", "#b89048", 0.56, 0.05),
}


def ensure_mats(obj, mat_names):
    for nm in mat_names:
        m = MATS[nm]
        if m.name not in [ms.name for ms in obj.data.materials]:
            obj.data.materials.append(m)
    return {nm: list(obj.data.materials).index(MATS[nm]) for nm in mat_names}


def lathe_uv(name, profile, x=0.0, z=0.0, seg=72, mat_name="titanium",
             phi0=0.0, phi_span=TAU, cap_bottom=True, cap_top=True,
             y_min=None, y_max=None, radial_uv=False):
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
    rs = [p[0] for p in profile]
    ymin = min(ys) if y_min is None else y_min
    ymax = max(ys) if y_max is None else y_max
    yspan = max(1e-6, ymax - ymin)
    rmax = max(1e-4, max(rs))

    for r, y in profile:
        if r <= 1e-5:
            rings.append([bm.verts.new(P(x, y, z))])
        else:
            rings.append([
                bm.verts.new(P(x + r * math.cos(p), y, z - r * math.sin(p)))
                for p in phis
            ])

    def uv_at(i_col, r_val, y_val):
        if radial_uv:
            ang = phis[i_col % n_s]
            rn = min(0.49, 0.48 * (r_val / rmax))
            return (0.5 + rn * math.cos(ang), 0.5 + rn * math.sin(ang))
        u = phis[i_col % n_s] / TAU
        v = max(0.001, min(0.999, (y_val - ymin) / yspan))
        return (u, v)

    for j in range(len(profile) - 1):
        r0_list, r1_list = rings[j], rings[j + 1]
        r0, y0 = profile[j]
        r1, y1 = profile[j + 1]
        if len(r0_list) == 1 and len(r1_list) == 1:
            continue
        for i in range(seg):
            i2 = (i + 1) % n_s if closed else i + 1
            if len(r0_list) == 1:
                f = bm.faces.new((r0_list[0], r1_list[i], r1_list[i2]))
                f.material_index = mid
                if radial_uv:
                    uvs = [(0.5, 0.5), uv_at(i, r1, y1), uv_at(i2, r1, y1)]
                else:
                    uvs = [(0.5, uv_at(i, 0, y0)[1]), uv_at(i, r1, y1), uv_at(i2, r1, y1)]
            elif len(r1_list) == 1:
                f = bm.faces.new((r0_list[i], r0_list[i2], r1_list[0]))
                f.material_index = mid
                if radial_uv:
                    uvs = [uv_at(i, r0, y0), uv_at(i2, r0, y0), (0.5, 0.5)]
                else:
                    uvs = [uv_at(i, r0, y0), uv_at(i2, r0, y0), (0.5, uv_at(i, 0, y1)[1])]
            else:
                f = bm.faces.new((r0_list[i], r0_list[i2], r1_list[i2], r1_list[i]))
                f.material_index = mid
                if radial_uv:
                    uvs = [uv_at(i, r0, y0), uv_at(i2, r0, y0), uv_at(i2, r1, y1), uv_at(i, r1, y1)]
                else:
                    u_a = phis[i] / TAU
                    u_b = (phis[i] + phi_span / seg) / TAU
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
    return o


def place_oriented_box(name, size_xyz, pos_three, rot_euler_bl, mat_name="titanium", bevel=0.01):
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    mid = ensure_mats(o, [mat_name])[mat_name]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(size_xyz[0], size_xyz[2], size_xyz[1]), verts=bm.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect="EDGES")
    for f in bm.faces:
        f.material_index = mid
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o.location = P(*pos_three)
    o.rotation_euler = rot_euler_bl
    return o


def cyl3(name, p0, p1, r0, r1=None, seg=18, mat_name="titanium", caps=True):
    r1 = r0 if r1 is None else r1
    a, b = P(*p0), P(*p1)
    dv = b - a
    length = dv.length
    if length < 1e-6:
        return None
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    mid = ensure_mats(o, [mat_name])[mat_name]
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=length)
    for f in bm.faces:
        f.material_index = mid
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o.location = (a + b) * 0.5
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(dv.normalized())
    return o


def sphere3(name, center_three, radius, mat_name="gold_kapton", u_seg=20, v_seg=12):
    me = bpy.data.meshes.new(name)
    o = new_obj(name, me)
    mid = ensure_mats(o, [mat_name])[mat_name]
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=radius)
    for f in bm.faces:
        f.material_index = mid
    bm.to_mesh(me)
    bm.free()
    o.location = P(*center_three)
    return o


def join_parts(name, objs, smooth_deg=34):
    objs = [o for o in objs if o is not None]
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for f in ob.data.polygons:
        f.use_smooth = True
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_deg))
    except Exception:
        pass
    return ob


def set_origin(o, origin3):
    target_bl = P(*origin3)
    delta = target_bl - o.location
    o.data.transform(Matrix.Translation(-delta))
    o.location = target_bl


# ==========================================================================
# APOLLO COMMAND MODULE DIMENSIONS (1.35 base radius = 1.955 m)
# ==========================================================================
R_BASE = 1.355
Y_BASE = -0.68
Y_SHOULDER = -0.56
Y_TOP_CONE = 0.94
R_TOP_CONE = 0.455
CONE_SLOPE = (R_BASE - R_TOP_CONE) / (Y_TOP_CONE - Y_SHOULDER)  # ~0.60 -> ~31-32.5 deg half-angle
CONE_ANGLE = math.atan(CONE_SLOPE)  # ~0.54 rad (~31 deg)


def cone_radius_at(y):
    t = max(0.0, min(1.0, (y - Y_SHOULDER) / (Y_TOP_CONE - Y_SHOULDER)))
    return R_BASE + (R_TOP_CONE - R_BASE) * t


def cone_surface_frame(phi, y, offset_normal=0.0):
    """Return Three.js position and Blender Euler aligning local +Z along cone outward normal."""
    r = cone_radius_at(y)
    nx_3 = math.cos(phi) * math.cos(CONE_ANGLE)
    ny_3 = math.sin(CONE_ANGLE)
    nz_3 = -math.sin(phi) * math.cos(CONE_ANGLE)
    px_3 = r * math.cos(phi) + nx_3 * offset_normal
    py_3 = y + ny_3 * offset_normal
    pz_3 = -r * math.sin(phi) + nz_3 * offset_normal
    n_bl = P(nx_3, ny_3, nz_3).normalized()
    # Local +Y = up along cone generatrix tangent, +Z = outward normal
    up_hint = P(-math.cos(phi) * math.sin(CONE_ANGLE), math.cos(CONE_ANGLE), math.sin(phi) * math.sin(CONE_ANGLE)).normalized()
    right_bl = up_hint.cross(n_bl).normalized()
    up_bl = n_bl.cross(right_bl).normalized()
    rot_m = Matrix((right_bl, up_bl, n_bl)).transposed()
    return (px_3, py_3, pz_3), rot_m.to_euler()


# ==========================================================================
# 1. COMMAND MODULE HULL PBR TEXTURE (2048x1024 Albedo + Normal + ORM)
# ==========================================================================
cm_tex = PBRCanvas(2048, 1024, base_hex="#d4dbe2", rough=0.26, metal=0.84)


def vh(y):
    return (y - Y_BASE) / (1.02 - Y_BASE)


# Lower charred compression ring & seal band
cm_tex.paint_band(0.0, vh(-0.56), "#20252d", rough=0.52, metal=0.68)
cm_tex.paint_band(vh(-0.56), vh(-0.50), "#464d57", rough=0.38, metal=0.82, height_delta=0.20)
# Aluminized Kapton / stainless steel skin panels with staggered weld seams + rivets
cm_tex.add_panel_grid(vh(-0.50), vh(0.92), n_cols=24, n_rows=7, color_var=0.032, seam_px=2, seam_depth=-0.42, seam_dark=0.72, rivets=True, seed=107)
# Slight dark anodized thermal collar at forward deck rim
cm_tex.paint_band(vh(0.89), 1.0, "#2c323b", rough=0.40, metal=0.76, height_delta=0.18)
# Natural atmospheric entry scorch darkening creeping up from base shoulder
cm_tex.add_soot_gradient(vh(-0.56), vh(-0.14), strength=0.44, dark_at_bottom=True)
cm_tex.add_micro_wear(vh(-0.50), 0.96, strength=0.03, bump=0.06, seed=1969)

# U_FRONT = 0.75 faces +Z (hatch & side windows); keep hull clear of flags/agency/mission markings
U_FRONT = 0.75

# Photogrammetry roll targets around flanks & back
for u_tgt in (0.18, 0.36, 0.62, 0.88):
    cm_tex.draw_crosshair_target(u_tgt, vh(0.56), 0.014, 0.034)
    cm_tex.draw_crosshair_target(u_tgt, vh(-0.24), 0.014, 0.034)

# Orange & black rescue warning stencils near crew hatch front (phi=-pi/2 -> u=0.75)
cm_tex.paint_rect_uv(0.75 - 0.036, vh(0.52), 0.75 + 0.036, vh(0.56), "#d94e1f", rough=0.42, metal=0.0, height_delta=0.08)
cm_tex.draw_text("RESCUE", 0.75, vh(0.54), 0.055, 0.032, hex_col="#12151a")

MATS["cm_hull_pbr"] = cm_tex.build_material("CM_Hull_PBR", normal_strength=2.2)

# ==========================================================================
# 2. AVCOAT HONEYCOMB HEAT SHIELD PBR TEXTURE (1024x1024)
# ==========================================================================
hs_tex = PBRCanvas(1024, 1024, base_hex="#3c3029", rough=0.76, metal=0.10)
xx = np.linspace(-1.0, 1.0, 1024, dtype=np.float32)[None, :]
yy = np.linspace(-1.0, 1.0, 1024, dtype=np.float32)[:, None]
rr = np.hypot(xx, yy) / 0.48
# Hexagonal phenolic fiberglass honeycomb cell pattern
hx_scale = 26.0
u_h = xx * hx_scale
v_h = yy * hx_scale * 1.1547
c1 = np.abs(((u_h + 0.5 * v_h) % 1.0) - 0.5)
c2 = np.abs(((u_h - 0.5 * v_h) % 1.0) - 0.5)
c3 = np.abs((v_h % 1.0) - 0.5)
hex_wall = np.minimum(np.minimum(c1, c2), c3)
cell_rim = (hex_wall < 0.08).astype(np.float32)
ablation_fbm = fbm_periodic(1024, 1024, 12, 12, octaves=4, seed=404)
radial_char = np.clip(0.32 + 0.62 * np.power(np.clip(rr, 0.0, 1.1), 1.4) + (ablation_fbm - 0.5) * 0.32, 0.12, 1.0)
col_warm = np.array(srgb_to_linear(hex_srgb("#684d3b")), dtype=np.float32)
col_char = np.array(srgb_to_linear(hex_srgb("#191513")), dtype=np.float32)
hs_tex.color = col_warm * (1.0 - radial_char[..., None]) + col_char * radial_char[..., None]
hs_tex.color *= (1.0 - 0.22 * cell_rim[..., None])
hs_tex.height = -cell_rim * 0.35 + (ablation_fbm - 0.5) * 0.45
hs_tex.rough = np.clip(0.68 + 0.26 * radial_char + cell_rim * 0.08, 0.45, 0.96)
hs_tex.metal[:] = 0.08
MATS["cm_shield_pbr"] = hs_tex.build_material("CM_Shield_PBR", normal_strength=2.6)

# ==========================================================================
# 3. BUILD CM_Hull (OML + Hatch + 4 Recessed Windows + RCS + Internal Aft Deck)
# ==========================================================================
hull_parts = []
hull_profile = [
    (0.0, Y_BASE - 0.02),
    (R_BASE * 0.96, Y_BASE - 0.015),
    (R_BASE, Y_BASE + 0.03),
    (R_BASE + 0.008, Y_BASE + 0.08),
    (R_BASE, Y_SHOULDER),
    (cone_radius_at(-0.20), -0.20),
    (cone_radius_at(0.20), 0.20),
    (cone_radius_at(0.60), 0.60),
    (R_TOP_CONE, Y_TOP_CONE),
    (R_TOP_CONE - 0.02, Y_TOP_CONE + 0.03),
    (0.41, Y_TOP_CONE + 0.03),
    (0.41, Y_TOP_CONE - 0.06),
    (0.0, Y_TOP_CONE - 0.06),
]
hull_parts.append(lathe_uv("CM_Shell", hull_profile, seg=96, mat_name="cm_hull_pbr", y_min=Y_BASE, y_max=1.02, cap_bottom=False, cap_top=False))

# Lower compression heat-shield retention skirt & 24 perimeter shear tie brackets
hull_parts.append(lathe_uv("CM_BaseCollar", [
    (R_BASE - 0.02, Y_BASE - 0.025),
    (R_BASE + 0.022, Y_BASE - 0.01),
    (R_BASE + 0.020, Y_BASE + 0.045),
    (R_BASE - 0.005, Y_BASE + 0.055),
], seg=64, mat_name="dark_ti", cap_bottom=False, cap_top=False))

# Forward Crew Hatch (+Z front at phi = -pi/2) flush along 32.5 deg wall
hatch_pos, hatch_rot = cone_surface_frame(-math.pi / 2, 0.08, offset_normal=0.018)
hull_parts.append(place_oriented_box("CM_HatchFrame", (0.66, 0.56, 0.055), hatch_pos, hatch_rot, mat_name="titanium", bevel=0.014))
hatch_door_pos, _ = cone_surface_frame(-math.pi / 2, 0.08, offset_normal=0.034)
hull_parts.append(place_oriented_box("CM_HatchDoor", (0.56, 0.46, 0.040), hatch_door_pos, hatch_rot, mat_name="silver", bevel=0.010))
# Hatch circular viewport + external rotary dog handle
hatch_win_b, _ = cone_surface_frame(-math.pi / 2, 0.14, offset_normal=0.042)
hatch_win_t, _ = cone_surface_frame(-math.pi / 2, 0.14, offset_normal=0.064)
hull_parts.append(cyl3("CM_HatchWinRim", hatch_win_b, hatch_win_t, 0.115, 0.105, seg=24, mat_name="dark_ti"))
hatch_glass_t, _ = cone_surface_frame(-math.pi / 2, 0.14, offset_normal=0.068)
hull_parts.append(cyl3("CM_HatchGlass", hatch_win_b, hatch_glass_t, 0.086, 0.084, seg=24, mat_name="glass"))
handle_pos, handle_rot = cone_surface_frame(-math.pi / 2, -0.04, offset_normal=0.066)
hull_parts.append(place_oriented_box("CM_HatchLatch", (0.14, 0.035, 0.025), handle_pos, handle_rot, mat_name="steel", bevel=0.005))

# 2 Side Observation Windows (phi = -pi/2 +- 0.52, y = 0.18) + 2 Forward Rendezvous Windows (+-0.30, y = 0.60)
window_specs = [
    (-math.pi / 2 - 0.52, 0.18, 0.30, 0.25),
    (-math.pi / 2 + 0.52, 0.18, 0.30, 0.25),
    (-math.pi / 2 - 0.30, 0.60, 0.21, 0.19),
    (-math.pi / 2 + 0.30, 0.60, 0.21, 0.19),
]
for idx, (phi, wy, ww, wh) in enumerate(window_specs):
    w_frame_p, w_rot = cone_surface_frame(phi, wy, offset_normal=0.015)
    hull_parts.append(place_oriented_box(f"CM_WinBezel_{idx}", (ww, wh, 0.055), w_frame_p, w_rot, mat_name="titanium", bevel=0.010))
    w_recess_p, _ = cone_surface_frame(phi, wy, offset_normal=0.022)
    hull_parts.append(place_oriented_box(f"CM_WinReveal_{idx}", (ww * 0.80, wh * 0.78, 0.048), w_recess_p, w_rot, mat_name="charcoal", bevel=0.004))
    w_glass_p, _ = cone_surface_frame(phi, wy, offset_normal=0.030)
    hull_parts.append(place_oriented_box(f"CM_WinPane_{idx}", (ww * 0.70, wh * 0.68, 0.038), w_glass_p, w_rot, mat_name="glass", bevel=0.003))

# 4 Aft Roll/Pitch/Yaw Scarfed RCS Fairing Pods + Nozzle Throats ( flush near y=-0.42 )
for idx, phi in enumerate((-math.pi * 0.28, -math.pi * 0.72, math.pi * 0.28, math.pi * 0.72)):
    rp, r_rot = cone_surface_frame(phi, -0.40, offset_normal=0.026)
    hull_parts.append(place_oriented_box(f"CM_RcsPod_{idx}", (0.16, 0.22, 0.09), rp, r_rot, mat_name="dark_ti", bevel=0.016))
    # Paired tangential roll thruster nozzle cones sticking slightly from pod sides
    r_at = cone_radius_at(-0.40) + 0.03
    for sgn in (-1, 1):
        px, pz = r_at * math.cos(phi), -r_at * math.sin(phi)
        tx, tz = -math.sin(phi) * sgn * 0.12, -math.cos(phi) * sgn * 0.12
        hull_parts.append(cyl3(f"CM_RcsBell_{idx}_{sgn}", (px, -0.40, pz), (px + tx, -0.40, pz + tz), 0.024, 0.044, seg=12, mat_name="steel"))

# Aft Umbilical Fairing + VHF Scimitar Recovery Antenna Blade on back cone
umb_p, umb_r = cone_surface_frame(math.pi / 2, -0.25, offset_normal=0.028)
hull_parts.append(place_oriented_box("CM_UmbilicalFairing", (0.22, 0.44, 0.09), umb_p, umb_r, mat_name="titanium", bevel=0.018))
ant_b, _ = cone_surface_frame(math.pi / 2 - 0.38, 0.72, offset_normal=0.00)
ant_t, _ = cone_surface_frame(math.pi / 2 - 0.38, 0.84, offset_normal=0.22)
hull_parts.append(cyl3("CM_VHFAntenna", ant_b, ant_t, 0.022, 0.008, seg=10, mat_name="orange_beacon"))

# Internal Aft Bulkhead, 4 Gold Kapton Tanks, Crush-Core Damper, & 4 Canted 1.5m Retro-Rocket Nozzles
hull_parts.append(lathe_uv("CM_AftBulkhead", [
    (0.0, Y_BASE + 0.02),
    (R_BASE * 0.88, Y_BASE + 0.02),
    (R_BASE * 0.88, Y_BASE - 0.02),
    (0.0, Y_BASE - 0.02),
], seg=48, mat_name="titanium"))
for k in range(8):
    ang = k * (math.pi / 4.0)
    hull_parts.append(cyl3(f"CM_AftRib_{k}", (0.28 * math.cos(ang), Y_BASE - 0.02, -0.28 * math.sin(ang)),
                           (1.16 * math.cos(ang), Y_BASE - 0.02, -1.16 * math.sin(ang)), 0.032, 0.032, seg=8, mat_name="steel"))
# 4 Gold Kapton Helium / RCS Spheres tucked in aft quadrants
for k in range(4):
    ang = k * (math.pi / 2.0)
    hull_parts.append(sphere3(f"CM_KaptonTank_{k}", (0.86 * math.cos(ang), Y_BASE - 0.06, 0.86 * math.sin(ang)), 0.145, mat_name="gold_kapton"))
# Central Aluminum Honeycomb Crush-Core Landing Attenuator
hull_parts.append(lathe_uv("CM_CrushCore", [
    (0.0, Y_BASE - 0.14), (0.34, Y_BASE - 0.14), (0.38, Y_BASE - 0.02), (0.0, Y_BASE - 0.02)
], seg=28, mat_name="kevlar"))
# 4 Canted Solid Retro-Rocket Motor Pods + Contoured Bells at (+-0.56, -0.78, +-0.56)
for rx in (-0.56, 0.56):
    for rz in (-0.56, 0.56):
        hull_parts.append(cyl3(f"CM_RetroCase_{rx}_{rz}", (rx * 0.90, Y_BASE + 0.01, rz * 0.90), (rx * 0.98, Y_BASE - 0.10, rz * 0.98), 0.115, 0.095, seg=16, mat_name="kevlar"))
        hull_parts.append(cyl3(f"CM_RetroBell_{rx}_{rz}", (rx * 0.98, Y_BASE - 0.09, rz * 0.98), (rx * 1.07, Y_BASE - 0.25, rz * 1.07), 0.068, 0.165, seg=20, mat_name="inconel", caps=False))
        hull_parts.append(cyl3(f"CM_RetroThroat_{rx}_{rz}", (rx * 0.98, Y_BASE - 0.09, rz * 0.98), (rx * 1.02, Y_BASE - 0.15, rz * 1.02), 0.052, 0.075, seg=14, mat_name="charcoal"))

CM_Hull = join_parts("CM_Hull", hull_parts)
set_origin(CM_Hull, (0.0, 0.0, 0.0))


# ==========================================================================
# 4. BUILD CM_ChuteBay (Recessed Forward Parachute Deck + Docking Tunnel + Mortars)
# ==========================================================================
bay_parts = []
bay_parts.append(lathe_uv("CM_BayFloor", [
    (0.0, 0.88), (0.42, 0.88), (0.42, 0.98), (0.455, 0.98), (0.455, 0.88)
], seg=48, mat_name="dark_ti", cap_bottom=False, cap_top=False))
bay_parts.append(lathe_uv("CM_DockTunnel", [
    (0.0, 0.88), (0.21, 0.88), (0.22, 1.18), (0.25, 1.22), (0.25, 1.27), (0.19, 1.27), (0.18, 1.20), (0.0, 1.20)
], seg=40, mat_name="steel"))
# 3 Titanium Main Chute Forged Riser Clevises + 3 Main Mortar Tubes + 2 Drogue Mortar Tubes
for i in range(3):
    ang = i * (TAU / 3.0)
    bay_parts.append(cyl3(f"CM_MainMortar_{i}", (0.31 * math.cos(ang), 0.89, 0.31 * math.sin(ang)),
                          (0.35 * math.cos(ang), 1.11, 0.35 * math.sin(ang)), 0.075, 0.072, seg=16, mat_name="titanium"))
    bay_parts.append(cyl3(f"CM_Clevis_{i}", (0.24 * math.cos(ang + 0.5), 0.92, 0.24 * math.sin(ang + 0.5)),
                          (0.24 * math.cos(ang + 0.5), 1.14, 0.24 * math.sin(ang + 0.5)), 0.032, 0.028, seg=10, mat_name="steel"))
for i in range(2):
    ang = i * math.pi + 0.52
    bay_parts.append(cyl3(f"CM_DrogueMortar_{i}", (0.31 * math.cos(ang), 0.89, 0.31 * math.sin(ang)),
                          (0.34 * math.cos(ang), 1.09, 0.34 * math.sin(ang)), 0.052, 0.050, seg=14, mat_name="gold_kapton"))

CM_ChuteBay = join_parts("CM_ChuteBay", bay_parts)
set_origin(CM_ChuteBay, (0.0, 0.0, 0.0))


# ==========================================================================
# 5. BUILD CM_ApexCap (Detachable Forward Heat-Shield Dome Cover)
# ==========================================================================
apex_parts = []
apex_parts.append(lathe_uv("CM_ApexShell", [
    (0.42, Y_TOP_CONE),
    (R_TOP_CONE + 0.008, Y_TOP_CONE),
    (R_TOP_CONE + 0.004, Y_TOP_CONE + 0.05),
    (0.34, Y_TOP_CONE + 0.19),
    (0.21, Y_TOP_CONE + 0.33),
    (0.11, Y_TOP_CONE + 0.41),
    (0.0, Y_TOP_CONE + 0.43),
], seg=64, mat_name="cm_hull_pbr", y_min=Y_BASE, y_max=1.38))
apex_parts.append(lathe_uv("CM_ApexDockCollar", [
    (0.065, Y_TOP_CONE + 0.40), (0.095, Y_TOP_CONE + 0.40), (0.088, Y_TOP_CONE + 0.46), (0.045, Y_TOP_CONE + 0.46), (0.0, Y_TOP_CONE + 0.44)
], seg=28, mat_name="steel"))
CM_ApexCap = join_parts("CM_ApexCap", apex_parts)
set_origin(CM_ApexCap, (0.0, 1.06, 0.0))


# ==========================================================================
# 6. BUILD CM_HeatShield (Spherical Avcoat Ablative Honeycomb Dish + Backplate)
# ==========================================================================
hs_parts = []
hs_prof = []
R_HS = 1.385
CURVE_DEPTH = 0.28
# Bottom exterior spherical cap from center (0, -0.78 - 0.28) outward to rolled rim (R_HS, -0.75), then inner face back to center
for i in range(14):
    frac = i / 13.0
    r = frac * R_HS
    y = -0.78 - CURVE_DEPTH * math.cos(frac * math.pi * 0.5)
    hs_prof.append((r, y))
hs_prof.extend([
    (R_HS + 0.01, -0.71),
    (R_HS - 0.03, -0.68),
    (R_HS * 0.70, -0.71),
    (0.0, -0.75),
])
hs_parts.append(lathe_uv("CM_ShieldDish", hs_prof, seg=72, mat_name="cm_shield_pbr", radial_uv=True, cap_bottom=False, cap_top=False))
# Outer stainless compression lip ring
hs_parts.append(lathe_uv("CM_ShieldRim", [
    (R_HS - 0.035, -0.76), (R_HS + 0.015, -0.75), (R_HS + 0.015, -0.685), (R_HS - 0.035, -0.685)
], seg=64, mat_name="dark_ti", cap_bottom=False, cap_top=False))
# Top inner titanium attachment shear lugs (visible once shield detaches!)
for k in range(6):
    ang = k * (TAU / 6.0)
    hs_parts.append(cyl3(f"CM_ShieldLug_{k}", (1.02 * math.cos(ang), -0.71, 1.02 * math.sin(ang)),
                         (1.02 * math.cos(ang), -0.64, 1.02 * math.sin(ang)), 0.035, 0.025, seg=10, mat_name="steel"))

CM_HeatShield = join_parts("CM_HeatShield", hs_parts)
set_origin(CM_HeatShield, (0.0, -0.78, 0.0))


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
