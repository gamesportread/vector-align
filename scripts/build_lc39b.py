"""
LC-39B (Artemis era) with Mobile Launcher 1 — high-detail procedural PBR Blender build script.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python scripts/build_lc39b.py -- public/models/lc39b_sls.glb

Reuses shared PBR materials (pad_textures.py) and LC-39 hardstand/pad builder (pad_common.py),
then builds SLS-specific Artemis hardware in SLS local frame (boosters along +-X, tower on -Z
facing the core). LiftoffScene3D rotates ML, TOWER, and ARM_0..4 by +45 deg about Y at runtime.

Exported nodes (runtime contract preserved for LiftoffScene3D.tsx):
  PAD        hardstand mound, crawler ramp, firebrick flame trench, ribbed deflector, floodlights
  ML         ML-1 platform, mount mechanisms, SRB support posts, sculpted TSMUs, deluge manifolds
  TOWER      ML-1 umbilical tower (H-beams, base enclosure, open stairs, 3D lattice pedestal crane)
  ARM_0..4   umbilical / Artemis Crew Access Arm + White Room (origin = hinge, swings +Y)
  LIGHTNING  three 600 ft lightning towers, top baskets, beacons, 24-seg catenaries, anchor guys
  WATER      elevated sound-suppression water tower, X-braced trestle, balcony, stanchioned pipe
Materials named PAD_Concrete get world-planar UVs + weathered concrete texture at runtime.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "lc39b_sls.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)

from pad_common import (  # noqa: E402
    BASE_Y,
    Builder,
    add_aviation_beacon,
    add_caged_ladder,
    add_crane_lattice,
    add_floodlight_pod,
    add_gusset_plate,
    add_railing,
    add_stair_flight,
    build_lc39_pad,
)
from pad_textures import (  # noqa: E402
    create_pad_materials,
    make_solid_mat,
    make_sphere_tank_pbr,
    make_steel_panel_pbr,
)

MATS = create_pad_materials()
MATS.update({
    "tower": make_steel_panel_pbr("ML1_TowerSteel", "#9ca2a8", n_cols=3, n_rows=4, rough=0.46, metal=0.48, soot_bottom=0.12, seed=18),
    "tower_dark": make_steel_panel_pbr("ML1_Shadow", "#52585e", n_cols=3, n_rows=4, rough=0.52, metal=0.52, seed=19),
    "lightning": make_steel_panel_pbr("LC39B_Lattice", "#bcc2c6", n_cols=2, n_rows=4, rough=0.44, metal=0.60, wear=0.04, seed=24),
    "fiberglass": make_solid_mat("LC39B_Fiberglass", "#ece9de", metal=0.0, rough=0.50),
    "wire": make_solid_mat("LC39B_Catenary", "#484d52", metal=0.65, rough=0.42),
    "water": make_sphere_tank_pbr("LC39B_WaterTank", "#e5e8e7", seed=92),
})

DECK = 1.80
R_CORE = 0.462
X_SRB = 0.705

# ==========================================================================
# PAD: hardstand, crawler ramp, brick trench, flame deflector, pad floodlights
# ==========================================================================
PAD = build_lc39_pad(MATS)

# ==========================================================================
# ML: Mobile Launcher 1 base (49 x 41 x 7.6 m), long axis along Z (tower on -Z)
# ==========================================================================
Z0, Z1, HX, Y0 = -3.55, 2.35, 2.25, 0.96
HOLE_X, HOLE_Z = 1.02, 0.46
ML_YC = (Y0 + DECK) * 0.5
ML_H = DECK - Y0
ML_ZLEN = Z1 - Z0
ML_ZC = (Z0 + Z1) * 0.5

ml = Builder("ML", MATS)

# Blast-hardened ML-1 steel hull around rectangular Core + SRB flame trench slot
ml.box((0.0, ML_YC, (Z0 - HOLE_Z) * 0.5), (2 * HX, ML_H, -HOLE_Z - Z0), "ml")
ml.box((0.0, ML_YC, (HOLE_Z + Z1) * 0.5), (2 * HX, ML_H, Z1 - HOLE_Z), "ml")
for s in (-1, 1):
    ml.box((s * (HOLE_X + HX) * 0.5, ML_YC, 0.0), (HX - HOLE_X, ML_H, 2 * HOLE_Z), "ml")

# Armored diamond tread deck plating + equipment hatch frames
ml.box((0.0, DECK + 0.008, (Z0 - HOLE_Z) * 0.5), (2 * HX - 0.10, 0.016, -HOLE_Z - Z0 - 0.06), "deck", uv_scale=0.65)
ml.box((0.0, DECK + 0.008, (HOLE_Z + Z1) * 0.5), (2 * HX - 0.10, 0.016, Z1 - HOLE_Z - 0.06), "deck", uv_scale=0.65)
for s in (-1, 1):
    ml.box((s * (HOLE_X + HX) * 0.5, DECK + 0.008, 0.0), (HX - HOLE_X - 0.06, 0.016, 2 * HOLE_Z + 0.04), "deck", uv_scale=0.65)

# Flame aperture blast collar, hazard stripe curb & 18-nozzle deluge header loop
for s in (-1, 1):
    ml.box((0.0, DECK + 0.024, s * (HOLE_Z + 0.05)), (2 * HOLE_X + 0.20, 0.036, 0.10), "ml_dark")
    ml.box((0.0, DECK + 0.045, s * (HOLE_Z + 0.05)), (2 * HOLE_X + 0.20, 0.012, 0.09), "hazard", uv_scale=1.8)
    ml.box((s * (HOLE_X + 0.05), DECK + 0.024, 0.0), (0.10, 0.036, 2 * HOLE_Z), "ml_dark")
    ml.box((s * (HOLE_X + 0.05), DECK + 0.045, 0.0), (0.09, 0.012, 2 * HOLE_Z), "hazard", uv_scale=1.8)
    ml.cyl((-HOLE_X - 0.12, DECK + 0.06, s * (HOLE_Z + 0.14)), (HOLE_X + 0.12, DECK + 0.06, s * (HOLE_Z + 0.14)), 0.024, "pipe", seg=8)
    ml.cyl((s * (HOLE_X + 0.14), DECK + 0.06, -HOLE_Z - 0.12), (s * (HOLE_X + 0.14), DECK + 0.06, HOLE_Z + 0.12), 0.024, "pipe", seg=8)
    for dx_n in (-0.82, -0.42, 0.0, 0.42, 0.82):
        ml.cyl((dx_n, DECK + 0.06, s * (HOLE_Z + 0.13)), (dx_n, DECK + 0.02, s * (HOLE_Z - 0.03)), 0.014, "ml_dark", r1=0.022, seg=8)
    for dz_n in (-0.30, 0.0, 0.30):
        ml.cyl((s * (HOLE_X + 0.13), DECK + 0.06, dz_n), (s * (HOLE_X - 0.03), DECK + 0.02, dz_n), 0.014, "ml_dark", r1=0.022, seg=8)

# Beveled access hatches on forward & aft ML-1 deck
for hx in (-1.45, 1.45):
    for hz in (-3.00, 1.70):
        ml.box((hx, DECK + 0.022, hz), (0.48, 0.030, 0.36), "ml_dark")
        ml.box((hx, DECK + 0.040, hz), (0.40, 0.014, 0.28), "cladding")

# Heavy I-beam side stiffeners, perimeter rub-rails & louvered blast doors
for s in (-1, 1):
    x_face = s * HX
    ml.box((x_face + s * 0.02, DECK - 0.03, ML_ZC), (0.04, 0.06, ML_ZLEN + 0.04), "ml_dark")
    ml.box((x_face + s * 0.02, Y0 + 0.03, ML_ZC), (0.04, 0.06, ML_ZLEN + 0.04), "ml_dark")
    for z in (Z0 + 0.35 + i * 0.58 for i in range(10)):
        if z > Z1 - 0.2:
            break
        ml.ibeam((x_face + s * 0.015, Y0 + 0.04, z), (x_face + s * 0.015, DECK - 0.04, z), 0.06, 0.07, "ml_dark")
    for dz_d in (-2.55, -0.80, 1.25):
        ml.box((x_face + s * 0.012, ML_YC - 0.08, dz_d), (0.024, 0.46, 0.34), "cladding_dark")
        ml.box((x_face + s * 0.025, ML_YC - 0.08, dz_d), (0.012, 0.38, 0.28), "ml_dark")

for z_end, sz in ((Z0, -1), (Z1, 1)):
    ml.box((0.0, DECK - 0.03, z_end + sz * 0.02), (2 * HX + 0.04, 0.06, 0.04), "ml_dark")
    ml.box((0.0, Y0 + 0.03, z_end + sz * 0.02), (2 * HX + 0.04, 0.06, 0.04), "ml_dark")
    for x in (-1.8 + i * 0.6 for i in range(7)):
        ml.ibeam((x, Y0 + 0.04, z_end + sz * 0.015), (x, DECK - 0.04, z_end + sz * 0.015), 0.06, 0.07, "ml_dark")

# Six mount mechanism pedestals on hardstand
for px in (-1.70, 1.70):
    for pz in (-2.90, -0.90, 1.70):
        ml.box((px, 0.14, pz), (0.68, 0.28, 0.68), "concrete")
        ml.box((px, (Y0 - 0.12) * 0.5 + 0.14, pz), (0.54, Y0 - 0.26, 0.54), "concrete")
        ml.box((px, Y0 - 0.08, pz), (0.62, 0.16, 0.62), "ml_dark")
        ml.cyl((px, Y0 - 0.16, pz), (px, Y0 + 0.02, pz), 0.14, "ml", seg=10)

# External 2-flight industrial access stairs climbing to rear-west corner of ML-1
ml.box((-HX - 0.22, 0.90, -3.05), (0.34, 0.05, 0.34), "grating", uv_scale=2.2)
add_railing(ml, (-HX - 0.38, 0.92, -3.21), (-HX - 0.38, 0.92, -2.89), height=0.095)
add_railing(ml, (-HX - 0.38, 0.92, -3.21), (-HX - 0.06, 0.92, -3.21), height=0.095)
add_stair_flight(ml, (-HX - 0.22, 0.04, -1.95), (-HX - 0.22, 0.90, -2.90), width=0.22, steps=8)
add_stair_flight(ml, (-HX - 0.06, 0.92, -3.05), (-HX - 0.06, DECK + 0.01, -2.15), width=0.22, steps=8)
ml.beam((-HX - 0.36, 0.0, -3.05), (-HX - 0.36, 0.92, -3.05), 0.035, "ml_dark")
ml.beam((-HX - 0.08, 0.0, -3.05), (-HX - 0.08, 0.92, -3.05), 0.035, "ml_dark")

# Eight SRB Vehicle Support Posts around left & right Solid Rocket Boosters
for s in (-1, 1):
    for a in range(4):
        ang = math.pi / 4 + a * math.pi / 2
        px, pz = s * X_SRB + math.cos(ang) * 0.24, math.sin(ang) * 0.24
        ml.box((px, DECK + 0.015, pz), (0.14, 0.03, 0.14), "ml_dark", yaw=-ang)
        ml.box((px, DECK + 0.045, pz), (0.095, 0.045, 0.095), "tower_dark", yaw=-ang)
        ml.cyl((px, DECK + 0.065, pz), (px, DECK + 0.095, pz), 0.025, "pipe", seg=8)

# Two tall sculpted Artemis Tail Service Mast Umbilicals (TSMUs) mating to CORE_tsm_plate (local y = 2.49, z = +-0.48)
for s in (-1, 1):
    cz = s * 0.88
    ml.box((0.0, DECK + 0.025, cz), (0.46, 0.05, 0.38), "ml_dark")
    ml.box((0.0, DECK + 0.055, cz + s * 0.145), (0.40, 0.03, 0.04), "hazard", uv_scale=1.8)
    # Tapered blast-hardened TSMU hood housing sloping inward as it rises
    poly_b = [(-0.18, cz - s * 0.14), (0.18, cz - s * 0.14), (0.18, cz + s * 0.14), (-0.18, cz + s * 0.14)]
    poly_t = [(-0.14, cz - s * 0.09), (0.14, cz - s * 0.09), (0.14, cz + s * 0.12), (-0.14, cz + s * 0.12)]
    ml.prism_xz(poly_b, DECK + 0.05, DECK + 0.86, "cladding", poly_xz_top=poly_t)
    # Outward access panel door, vertical structural ribs & side pneumatic manifold
    ml.box((0.0, DECK + 0.32, cz + s * 0.135), (0.18, 0.38, 0.025), "ml_dark")
    for sx_r in (-0.145, 0.145):
        ml.beam((sx_r, DECK + 0.06, cz + s * 0.14), (sx_r * 0.82, DECK + 0.84, cz + s * 0.12), 0.026, "ml_dark")
    ml.cyl((0.18, DECK + 0.06, cz), (0.18, DECK + 0.72, cz), 0.018, "pipe_orange", seg=8)
    # Inward thermal blast shield face & tilt counterweight head cap
    ml.box((0.0, DECK + 0.45, cz - s * 0.125), (0.28, 0.72, 0.04), "ml_dark")
    ml.box((0.0, DECK + 0.89, cz + s * 0.02), (0.34, 0.07, 0.26), "ml_dark")
    # Retraction hydraulic damper & articulated twin cryo umbilical hoses reaching CORE_tsm_plate (y = 2.49, z = +-0.48)
    ml.cyl((0.0, DECK + 0.28, cz + s * 0.11), (0.0, DECK + 0.62, cz - s * 0.12), 0.028, "pipe", seg=8)
    for hx in (-0.07, 0.07):
        ml.pipe_elbow([
            (hx, DECK + 0.76, cz - s * 0.11),
            (hx * 0.9, 2.53, s * 0.65),
            (hx * 0.7, 2.49, s * 0.485),
        ], 0.022, "hose", seg=8)
    ml.box((0.0, 2.49, s * 0.485), (0.20, 0.10, 0.036), "ml_dark")

# ML-1 perimeter 2-rail safety railings + kickplates
add_railing(ml, (-HX + 0.06, DECK + 0.015, Z1 - 0.05), (HX - 0.06, DECK + 0.015, Z1 - 0.05), toe_key="ml_dark")
add_railing(ml, (-HX + 0.06, DECK + 0.015, Z0 + 0.05), (HX - 0.06, DECK + 0.015, Z0 + 0.05), toe_key="ml_dark")
add_railing(ml, (HX - 0.05, DECK + 0.015, Z0 + 0.06), (HX - 0.05, DECK + 0.015, Z1 - 0.06), toe_key="ml_dark")
add_railing(ml, (-HX + 0.05, DECK + 0.015, Z0 + 0.06), (-HX + 0.05, DECK + 0.015, -2.35), toe_key="ml_dark")
add_railing(ml, (-HX + 0.05, DECK + 0.015, -1.96), (-HX + 0.05, DECK + 0.015, Z1 - 0.06), toe_key="ml_dark")

# Propellant & purge lines, GN2 cylinder racks & corner deck floodlights
for dx in (-0.42, -0.24, 0.24, 0.42):
    ml.cyl((dx, DECK + 0.055, -1.92), (dx, DECK + 0.055, -0.58), 0.034, "pipe", seg=8)
    ml.cyl((dx * 0.65, DECK + 0.10, -1.92), (dx * 0.65, DECK + 0.10, -0.75), 0.020, "hose", seg=8)
for bz in (-1.75, -1.30, -0.88):
    ml.box((0.0, DECK + 0.03, bz), (0.98, 0.06, 0.045), "ml_dark")
for gx in (-1.65, -1.50, -1.35):
    for gy_off in (0.14, 0.28):
        ml.cyl((gx, DECK + gy_off, -3.30), (gx, DECK + gy_off, -2.65), 0.048, "pipe", seg=10)
ml.box((-1.50, DECK + 0.18, -2.98), (0.48, 0.32, 0.50), "ml_dark")
ml.box((1.55, DECK + 0.24, -2.85), (0.56, 0.48, 0.56), "cladding")
ml.box((1.55, DECK + 0.50, -2.85), (0.60, 0.05, 0.60), "ml_dark")

for fx, fz in ((-1.95, 2.05), (1.95, 2.05), (-1.95, -1.10), (1.95, -1.10)):
    ml.cyl((fx, DECK + 0.01, fz), (fx, DECK + 0.24, fz), 0.022, "ml_dark", seg=8)
    add_floodlight_pod(ml, (fx, DECK + 0.26, fz), (0.0, DECK + 1.8, 0.0), scale=0.85)

ML = ml.finish(smooth_angle=25)

# ==========================================================================
# TOWER: ML-1 umbilical tower (H-beams, base enclosure, open stairs & crane)
# ==========================================================================
TZ, TW, TH, BAY = -2.55, 1.32, 11.55, 0.55
nb = int(round(TH / BAY))
hw = TW * 0.5

tw = Builder("TOWER", MATS)
corners = [(-hw, TZ - hw), (hw, TZ - hw), (hw, TZ + hw), (-hw, TZ + hw)]

# Main flanged corner H-beams & heavy base haunch pedestals
for cx, cz in corners:
    tw.ibeam((cx, DECK, cz), (cx, DECK + TH, cz), 0.115, 0.115, "tower", uv_scale=0.75)
    tw.box((cx, DECK + 0.09, cz), (0.26, 0.18, 0.26), "ml_dark")
    tw.box((cx, DECK + 0.19, cz), (0.19, 0.03, 0.19), "tower")

# Two framed corrugated elevator shafts on the north (-Z) side of tower (open inside)
shaft_xs = (-0.31, 0.31)
sz0, sz1 = TZ - 0.42, TZ - 0.12
for sx_c in shaft_xs:
    sx0, sx1 = sx_c - 0.15, sx_c + 0.15
    for px in (sx0, sx1):
        for pz in (sz0, sz1):
            tw.beam((px, DECK, pz), (px, DECK + TH, pz), 0.024, "ml_dark")
    tw.box((sx_c, DECK + TH * 0.5, (sz0 + sz1) * 0.5), (0.24, TH - 0.06, 0.24), "cladding_dark", uv_scale=0.9)

# 2-story blast-hardened ML-1 Launch Equipment Enclosure at base of tower (Levels 0-1)
tw.box((0.0, DECK + BAY * 0.95, TZ - 0.05), (TW - 0.18, BAY * 1.82, TW - 0.24), "cladding")
tw.box((0.0, DECK + BAY * 1.88, TZ - 0.05), (TW - 0.12, 0.04, TW - 0.18), "ml_dark")
for s in (-1, 1):
    tw.box((s * (hw - 0.09), DECK + 0.42, TZ - 0.05), (0.03, 0.56, 0.36), "ml_dark")

# Tier framing, gussets, X-bracing, grated decks, landing doors & open switchback stairs
for i in range(nb + 1):
    y = DECK + i * BAY
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        tw.ibeam((a[0], y, a[1]), (b[0], y, b[1]), 0.065, 0.072, "tower")
    for cx, cz in corners:
        add_gusset_plate(tw, (cx, y, cz), 0.17, 0.028, key="tower_dark")

    if 0 < i < nb:
        tw.box((0.0, y + 0.016, TZ - 0.26), (TW - 0.12, 0.020, 0.64), "grating", uv_scale=2.2)
        land_x = 0.36 if (i % 2 == 1) else -0.36
        tw.box((land_x, y + 0.016, TZ + 0.32), (0.44, 0.020, 0.50), "grating", uv_scale=2.2)
        add_railing(tw, (land_x - (0.22 if i % 2 == 1 else -0.22), y + 0.026, TZ + 0.08),
                    (land_x - (0.22 if i % 2 == 1 else -0.22), y + 0.026, TZ + 0.56), height=0.09)
        for p0, p1 in (
            ((-hw + 0.05, y + 0.026, TZ + hw - 0.04), (hw - 0.05, y + 0.026, TZ + hw - 0.04)),
            ((-hw + 0.05, y + 0.026, TZ - hw + 0.04), (hw - 0.05, y + 0.026, TZ - hw + 0.04)),
            ((-hw + 0.05, y + 0.026, TZ - hw + 0.04), (-hw + 0.05, y + 0.026, TZ + hw - 0.04)),
            ((hw - 0.05, y + 0.026, TZ - hw + 0.04), (hw - 0.05, y + 0.026, TZ + hw - 0.04)),
        ):
            add_railing(tw, p0, p1, height=0.095)
        for sx_c in shaft_xs:
            tw.box((sx_c, y + 0.14, sz1 + 0.01), (0.18, 0.24, 0.025), "cladding")
            tw.box((sx_c, y + 0.14, sz1 + 0.022), (0.012, 0.20, 0.010), "ml_dark")

    if i < nb:
        y1 = y + BAY
        for k in range(4):
            a, b = corners[k], corners[(k + 1) % 4]
            tw.beam((a[0], y, a[1]), (b[0], y1, b[1]), 0.032, "tower")
            tw.beam((b[0], y, b[1]), (a[0], y1, a[1]), 0.028, "tower")
        for sx_c in shaft_xs:
            sx0, sx1 = sx_c - 0.15, sx_c + 0.15
            tw.beam((sx0, y, sz0), (sx1, y1, sz0), 0.012, "ml_dark")
            tw.beam((sx1, y, sz0), (sx0, y1, sz0), 0.012, "ml_dark")
        if i >= 2:
            x_start, x_end = (-0.32, 0.32) if (i % 2 == 0) else (0.32, -0.32)
            add_stair_flight(tw, (x_start, y + 0.02, TZ + 0.28), (x_end, y1 + 0.02, TZ + 0.28), width=0.22, steps=6)

# Mid-tower ECS / instrumentation rooms at Levels 9 & 16
for lvl in (9, 16):
    sy0 = DECK + lvl * BAY
    tw.box((0.0, sy0 + BAY * 0.48, TZ + 0.02), (0.64, BAY - 0.06, 0.56), "cladding")
    tw.box((0.0, sy0 + BAY - 0.02, TZ + 0.02), (0.68, 0.03, 0.60), "ml_dark")

# External cryo & firex standpipes + cable trays along the north (-Z) face
for px, col_key, rad in ((-0.44, "pipe", 0.032), (-0.26, "pipe", 0.028), (0.26, "pipe", 0.026), (0.44, "pipe_orange", 0.024)):
    tw.cyl((px, DECK + 0.05, TZ - hw - 0.06), (px, DECK + TH - 0.15, TZ - hw - 0.06), rad, col_key, seg=10)
for x_tr in (-0.07, 0.07):
    tw.box((x_tr, DECK + TH * 0.5, TZ - hw - 0.045), (0.085, TH - 0.2, 0.04), "hose")
for i in range(1, nb, 2):
    tw.box((0.0, DECK + i * BAY, TZ - hw - 0.05), (0.98, 0.03, 0.09), "ml_dark")

# Fixed umbilical swing-arm hinge brackets on south (+Z) face (z = TZ + hw)
HINGE_Z = TZ + hw
ARM_META = [
    (0.10, 0.24),
    (2.00, 0.18),
    (3.40, 0.12),
    (4.20, 0.12),
    (4.70, 0.10),
]
for wy, xo in ARM_META:
    ay = wy + 6.65
    hx_lug = xo + 0.09
    tw.box((hx_lug, ay + 0.10, HINGE_Z - 0.005), (0.22, 0.26, 0.04), "ml_dark")
    for dy_e in (-0.015, 0.24):
        tw.box((hx_lug, ay + dy_e, HINGE_Z + 0.02), (0.14, 0.026, 0.06), "ml_dark")

# Tower floodlights aimed at SLS
for lvl in (5, 11, 16, 20):
    fy = DECK + lvl * BAY + 0.05
    for sx in (-0.48, 0.48):
        add_floodlight_pod(tw, (sx, fy, TZ + hw + 0.05), (0.0, fy + 0.4, 0.0), scale=0.95)

# Roof platform, machinery deck & true 3D lattice ML-1 Pedestal Crane
top = DECK + TH
tw.box((0.0, top + 0.045, TZ), (TW + 0.16, 0.09, TW + 0.16), "tower")
tw.box((0.0, top + 0.096, TZ), (TW + 0.10, 0.018, TW + 0.10), "grating", uv_scale=2.2)
for p0, p1 in (
    ((-hw - 0.05, top + 0.105, TZ - hw - 0.05), (hw + 0.05, top + 0.105, TZ - hw - 0.05)),
    ((-hw - 0.05, top + 0.105, TZ + hw + 0.05), (hw + 0.05, top + 0.105, TZ + hw + 0.05)),
    ((-hw - 0.05, top + 0.105, TZ - hw - 0.05), (-hw - 0.05, top + 0.105, TZ + hw + 0.05)),
    ((hw + 0.05, top + 0.105, TZ - hw - 0.05), (hw + 0.05, top + 0.105, TZ + hw + 0.05)),
):
    add_railing(tw, p0, p1, height=0.10)

tw.box((-0.24, top + 0.26, TZ), (0.52, 0.32, 0.62), "cladding")
tw.box((-0.24, top + 0.43, TZ), (0.56, 0.04, 0.66), "ml_dark")
tw.cyl((0.0, top + 0.09, TZ), (0.0, top + 0.48, TZ), 0.22, "tower", seg=16)
tw.cyl((0.0, top + 0.46, TZ), (0.0, top + 0.54, TZ), 0.24, "ml_dark", seg=16)
tw.box((0.0, top + 0.66, TZ), (0.40, 0.24, 0.40), "tower")

jib_y = top + 0.86
add_crane_lattice(tw, (-0.75, jib_y, TZ), (1.78, jib_y, TZ), 0.22, 0.20, "rail", "tower_dark", bays=11)
apex = (0.0, jib_y + 0.48, TZ)
for s in (-1, 1):
    tw.beam((-0.14, jib_y + 0.10, TZ + s * 0.11), apex, 0.032, "tower")
    tw.beam((0.14, jib_y + 0.10, TZ + s * 0.11), apex, 0.032, "tower")
    tw.cyl(apex, (1.72, jib_y + 0.10, TZ + s * 0.07), 0.008, "ml_dark", seg=6)
    tw.cyl(apex, (-0.70, jib_y + 0.10, TZ + s * 0.07), 0.008, "ml_dark", seg=6)
tw.box((-0.64, jib_y - 0.10, TZ), (0.38, 0.28, 0.34), "ml_dark")
tw.box((-0.64, jib_y - 0.10, TZ), (0.39, 0.11, 0.35), "hazard", uv_scale=1.6)
tw.box((0.32, jib_y - 0.18, TZ + 0.26), (0.28, 0.22, 0.20), "tower")
tw.box((0.42, jib_y - 0.17, TZ + 0.26), (0.11, 0.14, 0.16), "glass")
tw.box((1.56, jib_y - 0.13, TZ), (0.18, 0.07, 0.20), "ml_dark")
for hz in (-0.032, 0.032):
    tw.cyl((1.56, jib_y - 0.16, TZ + hz), (1.56, jib_y - 0.72, TZ + hz), 0.005, "ml_dark", seg=6)
tw.box((1.56, jib_y - 0.76, TZ), (0.10, 0.09, 0.10), "hazard", uv_scale=2.2)

# Rooftop comms & lightning mast + red aviation beacon
tw.cyl((-0.18, top + 0.44, TZ - 0.22), (-0.18, top + 1.85, TZ - 0.22), 0.026, "white_plain", r1=0.010, seg=8)
add_aviation_beacon(tw, (-0.18, top + 1.85, TZ - 0.22), scale=1.0)

TOWER = tw.finish(smooth_angle=20)

# ==========================================================================
# ARM_0..4: SLS Umbilical Arms + Artemis Enclosed Crew Access Arm & White Room
# ==========================================================================
ARMS = [  # (world y, hull radius there, lateral offset x, white room?)
    (0.10, R_CORE, 0.24, False),   # core stage inter-tank umbilical
    (2.00, R_CORE, 0.18, False),   # core stage forward skirt umbilical
    (3.40, 0.275, 0.12, False),    # ICPS umbilical
    (4.20, 0.29, 0.12, False),     # Orion service module umbilical
    (4.70, 0.24, 0.10, True),      # Artemis Crew Access Arm + White Room
]
for k, (wy, hull_r, xo, white_room) in enumerate(ARMS):
    y = wy + 6.65
    end_z = -math.sqrt(max(0.01, hull_r ** 2 - xo ** 2)) - 0.03
    hinge_x = xo + 0.09
    hinge_z = HINGE_Z + 0.02
    z_truss0 = hinge_z + 0.06
    a = Builder(f"ARM_{k}", MATS)
    depth = 0.26 if white_room else 0.22

    # Hinge clevis yoke, pivot pin & hydraulic retraction actuator
    for dy_l in (0.02, depth - 0.02):
        a.box((hinge_x, y + dy_l, hinge_z + 0.03), (0.12, 0.038, 0.08), "ml_dark")
    a.cyl((hinge_x, y - 0.04, hinge_z), (hinge_x, y + depth + 0.03, hinge_z), 0.022, "pipe", seg=8)
    a.cyl((hinge_x, y - 0.06, hinge_z + 0.02), (xo, y + 0.01, z_truss0 + 0.24), 0.020, "pipe", seg=8)

    # Twin Warren truss side girders + cross struts
    for s in (-1, 1):
        x = xo + s * 0.092
        a.beam((hinge_x + s * 0.04, y, hinge_z + 0.02), (x, y, z_truss0), 0.026, "tower")
        a.beam((hinge_x + s * 0.04, y + depth, hinge_z + 0.02), (x, y + depth, z_truss0), 0.026, "tower")
        a.beam((x, y, z_truss0), (x, y, end_z), 0.034, "tower")
        a.beam((x, y + depth, z_truss0), (x, y + depth, end_z), 0.034, "tower")
        n = max(2, int((end_z - z_truss0) / 0.22))
        for i in range(n + 1):
            z = z_truss0 + (end_z - z_truss0) * i / n
            a.beam((x, y, z), (x, y + depth, z), 0.018, "tower")
            if i < n:
                z1 = z_truss0 + (end_z - z_truss0) * (i + 1) / n
                if i % 2 == 0:
                    a.beam((x, y, z), (x, y + depth, z1), 0.015, "tower")
                else:
                    a.beam((x, y, z1), (x, y + depth, z), 0.015, "tower")

    span = end_z - z_truss0
    n_cross = max(2, int(span / 0.24))
    for i in range(n_cross + 1):
        z = z_truss0 + span * i / n_cross
        a.beam((xo - 0.092, y, z), (xo + 0.092, y, z), 0.016, "tower_dark")
        a.beam((xo - 0.092, y + depth, z), (xo + 0.092, y + depth, z), 0.016, "tower_dark")
    a.box((xo, y + 0.012, (z_truss0 + end_z) * 0.5), (0.175, 0.016, span), "grating", uv_scale=2.5)
    if not white_room:
        for s in (-1, 1):
            add_railing(a, (xo + s * 0.09, y + depth + 0.01, z_truss0 + 0.04), (xo + s * 0.09, y + depth + 0.01, end_z - 0.03), height=0.08, post_step=0.28)

    # Slung cryogenic & purge umbilical flex lines + QD head
    mid_z = (z_truss0 + end_z) * 0.5
    for dx, rad, h_key in ((-0.048, 0.018, "pipe"), (0.0, 0.022, "hose"), (0.048, 0.016, "pipe")):
        a.pipe_elbow([
            (xo + dx, y - 0.03, hinge_z + 0.04),
            (xo + dx, y - 0.08, mid_z),
            (xo + dx, y - 0.02, end_z + 0.02),
        ], rad, h_key, seg=8)
    a.box((xo, y + depth * 0.5, end_z + 0.02), (0.24, depth + 0.05, 0.055), "ml_dark")
    a.box((xo, y + depth * 0.5, end_z + 0.05), (0.17, depth * 0.72, 0.014), "hose")

    if white_room:
        # Enclosed Aerospace White Corridor + observation glass windows + Artemis White Room + seal boot
        a.box((xo, y + depth + 0.11, (z_truss0 + end_z) * 0.5 - 0.03), (0.23, 0.22, span - 0.06), "white", tile_uv=False)
        for wz_w in (z_truss0 + 0.36, z_truss0 + 0.78, z_truss0 + 1.20):
            if wz_w < end_z - 0.18:
                a.box((xo + 0.116, y + depth + 0.12, wz_w), (0.010, 0.065, 0.10), "glass")
                a.box((xo - 0.116, y + depth + 0.12, wz_w), (0.010, 0.065, 0.10), "glass")
        a.box((xo, y + 0.21, end_z - 0.08), (0.34, 0.32, 0.24), "white", tile_uv=False)
        a.box((xo, y + 0.38, end_z - 0.08), (0.36, 0.03, 0.26), "ml_dark")
        a.box((xo, y + 0.21, end_z + 0.042), (0.28, 0.26, 0.030), "hose")

    a.finish(smooth_angle=20, origin3=(hinge_x, y, hinge_z))

# ==========================================================================
# LIGHTNING: Three 600 ft (183 m) Lightning Protection Towers + Catenary Grid
# ==========================================================================
GROUND = BASE_Y
L_H = 20.0
L_POS = [(19.0 * math.cos(a), 19.0 * math.sin(a)) for a in (math.radians(100), math.radians(220), math.radians(340))]
lt = Builder("LIGHTNING", MATS)
tops = []

for lx, lz in L_POS:
    b0, b1 = 0.56, 0.18
    lattice_top = GROUND + L_H - 1.8

    def l_corner(k_idx, t):
        hwk = b0 + (b1 - b0) * t
        sx = 1 if k_idx in (1, 2) else -1
        sz = 1 if k_idx in (2, 3) else -1
        return (lx + sx * hwk, GROUND + (lattice_top - GROUND) * t, lz + sz * hwk)

    for k_idx in range(4):
        lt.beam(l_corner(k_idx, 0.0), l_corner(k_idx, 1.0), 0.072, "lightning")
    nl = 16
    for i in range(nl):
        t0, t1 = i / nl, (i + 1) / nl
        for k_idx in range(4):
            lt.beam(l_corner(k_idx, t0), l_corner((k_idx + 1) % 4, t0), 0.036, "lightning")
            lt.beam(l_corner(k_idx, t0), l_corner((k_idx + 1) % 4, t1), 0.025, "lightning")
            lt.beam(l_corner((k_idx + 1) % 4, t0), l_corner(k_idx, t1), 0.022, "lightning")

    # Stepped concrete footing + top maintenance basket + dual red obstruction beacons + fiberglass mast
    lt.box((lx, GROUND + 0.10, lz), (1.55, 0.20, 1.55), "concrete")
    lt.box((lx, GROUND + 0.23, lz), (1.25, 0.08, 1.25), "ml_dark")
    lt.box((lx, lattice_top + 0.02, lz), (0.48, 0.03, 0.48), "grating", uv_scale=2.2)
    add_railing(lt, (lx - 0.22, lattice_top + 0.04, lz - 0.22), (lx + 0.22, lattice_top + 0.04, lz - 0.22), height=0.095)
    add_railing(lt, (lx - 0.22, lattice_top + 0.04, lz + 0.22), (lx + 0.22, lattice_top + 0.04, lz + 0.22), height=0.095)
    add_railing(lt, (lx - 0.22, lattice_top + 0.04, lz - 0.22), (lx - 0.22, lattice_top + 0.04, lz + 0.22), height=0.095)
    add_railing(lt, (lx + 0.22, lattice_top + 0.04, lz - 0.22), (lx + 0.22, lattice_top + 0.04, lz + 0.22), height=0.095)
    add_aviation_beacon(lt, (lx + 0.20, lattice_top + 0.12, lz), scale=0.95)
    lt.cyl((lx, lattice_top, lz), (lx, GROUND + L_H, lz), 0.12, "fiberglass", r1=0.052, seg=12)
    lt.cyl((lx, lattice_top + 0.02, lz), (lx, lattice_top + 0.12, lz), 0.15, "ml_dark", seg=12)
    lt.cyl((lx, GROUND + L_H, lz), (lx, GROUND + L_H + 0.55, lz), 0.022, "wire", seg=6)
    tops.append((lx, GROUND + L_H, lz))


def catenary(a, b, sag, segs=24):
    pts = []
    for i in range(segs + 1):
        t = i / segs
        x = a[0] + (b[0] - a[0]) * t
        y = a[1] + (b[1] - a[1]) * t - sag * 4.0 * t * (1.0 - t)
        z = a[2] + (b[2] - a[2]) * t
        pts.append((x, y, z))
    for p, q in zip(pts, pts[1:]):
        lt.beam(p, q, 0.020, "wire")


for i in range(3):
    catenary(tops[i], tops[(i + 1) % 3], sag=4.5, segs=24)
    lx, ty, lz = tops[i]
    d = Vector((lx, 0.0, lz)).normalized()
    anchor = (lx + d.x * 9.0, GROUND + 0.18, lz + d.z * 9.0)
    catenary(tops[i], anchor, sag=1.2, segs=16)
    # Concrete guy-wire anchor block
    lt.box((anchor[0], GROUND + 0.12, anchor[2]), (0.55, 0.24, 0.55), "concrete")
    lt.box((anchor[0], GROUND + 0.25, anchor[2]), (0.28, 0.08, 0.28), "ml_dark")

LIGHTNING = lt.finish(smooth_angle=20)

# ==========================================================================
# WATER: Elevated Sound-Suppression Water Tower (~88 m) north-east of pad
# ==========================================================================
wt = Builder("WATER", MATS)
wx, wz = 24.0, -14.0
leg_r, top_r, tank_y = 1.15, 0.78, GROUND + 8.4

# Stepped concrete foundation & pipe valve pit
wt.box((wx, GROUND + 0.10, wz), (3.3, 0.20, 3.3), "concrete")
wt.box((wx, GROUND + 0.23, wz), (2.7, 0.08, 2.7), "ml_dark")

for k_idx in range(6):
    ang = k_idx * math.tau / 6
    nxt = ((k_idx + 1) % 6) * math.tau / 6
    x0, z0 = wx + math.cos(ang) * leg_r, wz + math.sin(ang) * leg_r
    x1, z1 = wx + math.cos(ang) * top_r, wz + math.sin(ang) * top_r
    wt.cyl((x0, GROUND + 0.20, z0), (x1, tank_y, z1), 0.068, "lightning", seg=10)
    for t in (0.28, 0.56, 0.82):
        rt = leg_r + (top_r - leg_r) * t
        yt = GROUND + 0.20 + (tank_y - GROUND - 0.20) * t
        wt.beam((wx + math.cos(ang) * rt, yt, wz + math.sin(ang) * rt),
                (wx + math.cos(nxt) * rt, yt, wz + math.sin(nxt) * rt), 0.042, "lightning")
    # Diagonal X-bracing between tiers
    for ta, tb in ((0.0, 0.28), (0.28, 0.56), (0.56, 0.82)):
        ra, rb = leg_r + (top_r - leg_r) * ta, leg_r + (top_r - leg_r) * tb
        ya, yb = GROUND + 0.20 + (tank_y - GROUND - 0.20) * ta, GROUND + 0.20 + (tank_y - GROUND - 0.20) * tb
        wt.beam((wx + math.cos(ang) * ra, ya, wz + math.sin(ang) * ra),
                (wx + math.cos(nxt) * rb, yb, wz + math.sin(nxt) * rb), 0.018, "ml_dark")
        wt.beam((wx + math.cos(nxt) * ra, ya, wz + math.sin(nxt) * ra),
                (wx + math.cos(ang) * rb, yb, wz + math.sin(ang) * rb), 0.018, "ml_dark")

# Central insulated water riser + caged access ladder
wt.cyl((wx, GROUND + 0.20, wz), (wx, tank_y, wz), 0.20, "lightning", seg=12)
wt.box((wx, GROUND + 0.34, wz), (0.72, 0.28, 0.72), "cladding")
add_caged_ladder(wt, wx + 0.24, GROUND + 0.24, tank_y + 0.90, wz, 1.0, 0.0)

# Spheroidal elevated tank + equatorial maintenance catwalk & handrail + top beacon
wt.sphere((wx, tank_y + 0.90, wz), 1.16, "water", seg=36, rings=18)
ring_segs = 18
bal_r = 1.30
for i in range(ring_segs):
    a0, a1 = i * math.tau / ring_segs, (i + 1) * math.tau / ring_segs
    p0 = (wx + math.cos(a0) * bal_r, tank_y + 0.88, wz + math.sin(a0) * bal_r)
    p1 = (wx + math.cos(a1) * bal_r, tank_y + 0.88, wz + math.sin(a1) * bal_r)
    wt.beam(p0, p1, 0.14, "grating", h=0.025)
    add_railing(wt, (p0[0], p0[1] + 0.015, p0[2]), (p1[0], p1[1] + 0.015, p1[2]), height=0.095, post_step=0.60)

wt.cyl((wx, tank_y + 1.95, wz), (wx, tank_y + 2.55, wz), 0.048, "wire", seg=8)
add_aviation_beacon(wt, (wx, tank_y + 2.55, wz), scale=0.95)

# Stanchion-supported sound suppression deluge water main heading toward pad
w_start = (wx, GROUND + 0.34, wz)
w_end = (6.5, GROUND + 0.34, -4.0)
wt.cyl(w_start, w_end, 0.12, "pipe", seg=12)
for t in (0.12, 0.32, 0.52, 0.72, 0.92):
    px = w_start[0] + (w_end[0] - w_start[0]) * t
    pz = w_start[2] + (w_end[2] - w_start[2]) * t
    wt.box((px, GROUND + 0.14, pz), (0.34, 0.28, 0.34), "concrete")
    wt.box((px, GROUND + 0.29, pz), (0.28, 0.06, 0.28), "ml_dark")

WATER = wt.finish(smooth_angle=25)

# --------------------------------------------------------------------------
# Export with packed PBR textures & UVs
# --------------------------------------------------------------------------
for ob in bpy.context.scene.objects:
    ob.select_set(ob.type == "MESH")
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_texcoords=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)
print("EXPORTED", OUT, sorted(o.name for o in bpy.context.scene.objects if o.type == "MESH"))
