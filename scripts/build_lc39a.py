"""
LC-39A (Apollo era) launch complex — high-detail procedural PBR Blender build script.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python scripts/build_lc39a.py -- public/models/lc39a_apollo.glb

Scale: scene units, 1 m = 0.11 units (PX_PER_M in LiftoffScene3D.tsx).
Authoring helper P(x, y, z) takes Three.js coordinates (Y up) of the
LaunchComplex39A group, whose origin sits on the hardstand concrete surface.

Exported nodes (runtime contract preserved for LiftoffScene3D.tsx):
  PAD       hardstand mound, crawler ramp, firebrick flame trench, ribbed deflector, floodlights
  ML        Mobile Launcher platform, mount mechanisms, stairs, deluge manifolds, Apollo TSMs
  LUT       Launch Umbilical Tower (flanged H-beams, open stairwells, grated decks, hammerhead crane)
  ARM_0..8  swing arms + Apollo White Room (origin = hinge pin on tower face, swings +Y)
  HDA_0..3  forged hold-down arms (origin = trunnion hinge above deck, tilts back at liftoff)
  SPHERES   LOX / LH2 gore-paneled storage spheres, dike foundations, ladders, stanchioned cryo lines
Materials named PAD_Concrete get world-planar UVs + weathered concrete texture at runtime.
"""
import math
import os
import sys

import bpy

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "lc39a_apollo.glb"

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
from pad_textures import create_pad_materials  # noqa: E402

MATS = create_pad_materials()

# ==========================================================================
# PAD: hardstand, crawler ramp, brick trench, flame deflector, pad floodlights
# ==========================================================================
PAD = build_lc39_pad(MATS)

# ==========================================================================
# ML: Apollo Mobile Launcher (49 x 41 x 7.6 m) on 6 mount pedestals
# ==========================================================================
ML_X0, ML_X1, ML_Z, ML_Y0, ML_Y1 = -3.8, 1.55, 2.15, 0.96, 1.80
HOLE = 0.70
ML_LEN = ML_X1 - ML_X0
ML_H = ML_Y1 - ML_Y0
ML_YC = (ML_Y0 + ML_Y1) * 0.5

ml = Builder("ML", MATS)

# Primary 2-story blast-hardened steel hull framing the central exhaust opening
ml.box(((ML_X0 - HOLE) * 0.5, ML_YC, 0.0), (-HOLE - ML_X0, ML_H, 2 * ML_Z), "ml")
ml.box(((HOLE + ML_X1) * 0.5, ML_YC, 0.0), (ML_X1 - HOLE, ML_H, 2 * ML_Z), "ml")
for s in (-1, 1):
    ml.box((0.0, ML_YC, s * (HOLE + ML_Z) * 0.5), (2 * HOLE, ML_H, ML_Z - HOLE), "ml")

# Top armor deck plating around the exhaust pit + machinery hatches
ml.box(((ML_X0 + ML_X1) * 0.5, ML_Y1 + 0.008, (ML_Z + HOLE) * 0.5), (ML_LEN - 0.10, 0.016, ML_Z - HOLE - 0.06), "deck", uv_scale=0.65)
ml.box(((ML_X0 + ML_X1) * 0.5, ML_Y1 + 0.008, -(ML_Z + HOLE) * 0.5), (ML_LEN - 0.10, 0.016, ML_Z - HOLE - 0.06), "deck", uv_scale=0.65)
ml.box(((ML_X0 - HOLE) * 0.5, ML_Y1 + 0.008, 0.0), (-HOLE - ML_X0 - 0.08, 0.016, 2 * HOLE + 0.04), "deck", uv_scale=0.65)
ml.box(((HOLE + ML_X1) * 0.5, ML_Y1 + 0.008, 0.0), (ML_X1 - HOLE - 0.08, 0.016, 2 * HOLE + 0.04), "deck", uv_scale=0.65)

# Exhaust aperture steel blast collar, hazard stripe curb & 16 water-deluge nozzles
for s in (-1, 1):
    ml.box((0.0, ML_Y1 + 0.024, s * (HOLE + 0.05)), (2 * HOLE + 0.20, 0.036, 0.10), "ml_dark")
    ml.box((s * (HOLE + 0.05), ML_Y1 + 0.024, 0.0), (0.10, 0.036, 2 * HOLE), "ml_dark")
    ml.box((0.0, ML_Y1 + 0.045, s * (HOLE + 0.05)), (2 * HOLE + 0.20, 0.012, 0.09), "hazard", uv_scale=1.8)
    ml.box((s * (HOLE + 0.05), ML_Y1 + 0.045, 0.0), (0.09, 0.012, 2 * HOLE), "hazard", uv_scale=1.8)
    # Deluge ring header pipe + 4 inward spray nozzles per side
    ml.cyl((-HOLE - 0.12, ML_Y1 + 0.06, s * (HOLE + 0.14)), (HOLE + 0.12, ML_Y1 + 0.06, s * (HOLE + 0.14)), 0.024, "pipe", seg=8)
    ml.cyl((s * (HOLE + 0.14), ML_Y1 + 0.06, -HOLE - 0.12), (s * (HOLE + 0.14), ML_Y1 + 0.06, HOLE + 0.12), 0.024, "pipe", seg=8)
    for d in (-0.48, -0.16, 0.16, 0.48):
        ml.cyl((d, ML_Y1 + 0.06, s * (HOLE + 0.13)), (d, ML_Y1 + 0.02, s * (HOLE - 0.03)), 0.014, "ml_dark", r1=0.022, seg=8)
        ml.cyl((s * (HOLE + 0.13), ML_Y1 + 0.06, d), (s * (HOLE - 0.03), ML_Y1 + 0.02, d), 0.014, "ml_dark", r1=0.022, seg=8)

# Beveled access hatch covers & equipment skids on the ML deck
for hx in (-3.35, -1.65, 1.12):
    for hz in (-1.45, 1.45):
        ml.box((hx, ML_Y1 + 0.022, hz), (0.46, 0.032, 0.34), "ml_dark")
        ml.box((hx, ML_Y1 + 0.042, hz), (0.38, 0.014, 0.26), "cladding")

# Heavy I-beam side stiffener buttresses, upper/lower edge rub-rails & recessed louvers
for s in (-1, 1):
    z_face = s * ML_Z
    ml.box((0.5 * (ML_X0 + ML_X1), ML_Y1 - 0.03, z_face + s * 0.02), (ML_LEN + 0.04, 0.06, 0.04), "ml_dark")
    ml.box((0.5 * (ML_X0 + ML_X1), ML_Y0 + 0.03, z_face + s * 0.02), (ML_LEN + 0.04, 0.06, 0.04), "ml_dark")
    for i in range(10):
        bx = ML_X0 + 0.35 + i * 0.53
        if bx > ML_X1 - 0.2:
            break
        ml.ibeam((bx, ML_Y0 + 0.04, z_face + s * 0.015), (bx, ML_Y1 - 0.04, z_face + s * 0.015), 0.06, 0.07, "ml_dark")
    # Blast-hardened equipment access doors & louver panels
    for dx in (-2.9, -1.4, 0.65):
        ml.box((dx, ML_YC - 0.08, z_face + s * 0.012), (0.34, 0.46, 0.024), "cladding_dark")
        ml.box((dx, ML_YC - 0.08, z_face + s * 0.025), (0.28, 0.38, 0.012), "ml_dark")

for x_end, sx in ((ML_X0, -1), (ML_X1, 1)):
    ml.box((x_end + sx * 0.02, ML_Y1 - 0.03, 0.0), (0.04, 0.06, 2 * ML_Z + 0.04), "ml_dark")
    ml.box((x_end + sx * 0.02, ML_Y0 + 0.03, 0.0), (0.04, 0.06, 2 * ML_Z + 0.04), "ml_dark")
    for z in (-1.68 + i * 0.56 for i in range(7)):
        ml.ibeam((x_end + sx * 0.015, ML_Y0 + 0.04, z), (x_end + sx * 0.015, ML_Y1 - 0.04, z), 0.06, 0.07, "ml_dark")

# Six heavy concrete + forged steel mount mechanism pedestals supporting ML corners & waist
for px in (-3.25, -1.40, 1.15):
    for pz in (-1.65, 1.65):
        ml.box((px, 0.14, pz), (0.68, 0.28, 0.68), "concrete")
        ml.box((px, (ML_Y0 - 0.12) * 0.5 + 0.14, pz), (0.52, ML_Y0 - 0.26, 0.52), "concrete")
        ml.box((px, ML_Y0 - 0.08, pz), (0.60, 0.16, 0.60), "ml_dark")
        ml.cyl((px, ML_Y0 - 0.16, pz), (px, ML_Y0 + 0.02, pz), 0.14, "ml", seg=10)

# External 2-flight industrial stairway climbing from hardstand to ML deck (-Z rear west side, away from topple)
ml.box((-3.30, 0.90, -ML_Z - 0.22), (0.34, 0.05, 0.34), "grating", uv_scale=2.2)
add_railing(ml, (-3.46, 0.92, -ML_Z - 0.38), (-3.14, 0.92, -ML_Z - 0.38), height=0.095)
add_railing(ml, (-3.46, 0.92, -ML_Z - 0.06), (-3.46, 0.92, -ML_Z - 0.38), height=0.095)
add_stair_flight(ml, (-2.30, 0.04, -ML_Z - 0.22), (-3.15, 0.90, -ML_Z - 0.22), width=0.22, steps=8)
add_stair_flight(ml, (-3.30, 0.92, -ML_Z - 0.06), (-2.45, ML_Y1 + 0.01, -ML_Z - 0.06), width=0.22, steps=8)
ml.beam((-3.30, 0.0, -ML_Z - 0.36), (-3.30, 0.92, -ML_Z - 0.36), 0.035, "ml_dark")
ml.beam((-3.30, 0.0, -ML_Z - 0.08), (-3.30, 0.92, -ML_Z - 0.08), 0.035, "ml_dark")

# Deck perimeter 2-rail safety railings + kickplates
add_railing(ml, (ML_X0 + 0.06, ML_Y1 + 0.015, ML_Z - 0.05), (ML_X1 - 0.06, ML_Y1 + 0.015, ML_Z - 0.05), toe_key="ml_dark")
add_railing(ml, (ML_X0 + 0.06, ML_Y1 + 0.015, -ML_Z + 0.05), (-2.62, ML_Y1 + 0.015, -ML_Z + 0.05), toe_key="ml_dark")
add_railing(ml, (-2.28, ML_Y1 + 0.015, -ML_Z + 0.05), (ML_X1 - 0.06, ML_Y1 + 0.015, -ML_Z + 0.05), toe_key="ml_dark")
add_railing(ml, (ML_X1 - 0.05, ML_Y1 + 0.015, -ML_Z + 0.06), (ML_X1 - 0.05, ML_Y1 + 0.015, ML_Z - 0.06), toe_key="ml_dark")
add_railing(ml, (ML_X0 + 0.05, ML_Y1 + 0.015, -ML_Z + 0.06), (ML_X0 + 0.05, ML_Y1 + 0.015, ML_Z - 0.06), toe_key="ml_dark")

# Three sculpted trapezoidal Apollo Tail Service Masts around S-IC base
for ang in (math.radians(150), math.radians(210), 0.0):
    r = 1.06
    cx, cz = r * math.cos(ang), r * math.sin(ang)
    yaw = -ang
    ca, sa = math.cos(ang), math.sin(ang)
    # Local (+x = radially outward, +z = tangential) -> world (x, y, z)
    t_loc = lambda lx, ly, lz: (cx + lx * ca - lz * sa, ML_Y1 + ly, cz + lx * sa + lz * ca)
    # Tapered trapezoid steel hood
    bot_poly = [(-0.14, -0.17), (0.14, -0.17), (0.14, 0.17), (-0.14, 0.17)]
    top_poly = [(-0.08, -0.13), (0.13, -0.13), (0.13, 0.13), (-0.08, 0.13)]
    # Transform polygons manually in XZ around (cx, cz)
    poly_b = [(cx + px * ca - pz * sa, cz + px * sa + pz * ca) for px, pz in bot_poly]
    poly_t = [(cx + px * ca - pz * sa, cz + px * sa + pz * ca) for px, pz in top_poly]
    ml.box(t_loc(0.0, 0.025, 0.0), (0.34, 0.05, 0.40), "ml_dark", yaw=yaw)
    ml.prism_xz(poly_b, ML_Y1 + 0.05, ML_Y1 + 0.62, "ml", poly_xz_top=poly_t)
    # Hinged inward thermal blast door & hydraulic counterweight cap
    ml.box(t_loc(-0.11, 0.34, 0.0), (0.04, 0.50, 0.24), "cladding", yaw=yaw)
    ml.box(t_loc(0.03, 0.65, 0.0), (0.25, 0.06, 0.30), "ml_dark", yaw=yaw)
    # Hydraulic retract damper & twin curved umbilical hoses + QD plate meeting S-IC base
    ml.cyl(t_loc(0.11, 0.22, 0.0), t_loc(-0.10, 0.46, 0.0), 0.024, "pipe", seg=8)
    for hz in (-0.055, 0.055):
        ml.pipe_elbow([t_loc(-0.06, 0.52, hz), t_loc(-0.24, 0.50, hz * 0.9), t_loc(-0.46, 0.36, hz * 0.8)], 0.018, "hose", seg=8)
    ml.box(t_loc(-0.46, 0.36, 0.0), (0.04, 0.09, 0.15), "ml_dark", yaw=yaw)

# Four stationary clevis pedestal housings on ML deck for HDA_0..3 trunnions
for k in range(4):
    ang = math.pi / 4 + k * math.pi / 2
    r = 0.86
    px, pz = r * math.cos(ang), r * math.sin(ang)
    ca, sa = math.cos(ang), math.sin(ang)
    hloc = lambda lx, ly, lz: (px + lx * ca - lz * sa, ML_Y1 + ly, pz + lx * sa + lz * ca)
    ml.box(hloc(0.03, 0.035, 0.0), (0.28, 0.07, 0.24), "ml_dark", yaw=-ang)
    for sz in (-0.085, 0.085):
        ml.box(hloc(0.01, 0.09, sz), (0.16, 0.10, 0.032), "ml_dark", yaw=-ang)
    ml.cyl(hloc(0.0, 0.09, -0.11), hloc(0.0, 0.09, 0.11), 0.022, "pipe", seg=8)

# Propellant manifolds, GN2 storage cylinder bank & ECS valve skids on west ML deck
for dz in (-0.42, -0.26, 0.26, 0.42):
    ml.cyl((-2.08, ML_Y1 + 0.055, dz), (-0.82, ML_Y1 + 0.055, dz), 0.028, "pipe", seg=8)
    ml.cyl((-2.08, ML_Y1 + 0.10, dz * 0.65), (-0.95, ML_Y1 + 0.10, dz * 0.65), 0.018, "hose", seg=8)
for bx in (-1.95, -1.45, -1.05):
    ml.box((bx, ML_Y1 + 0.03, 0.0), (0.04, 0.06, 0.96), "ml_dark")
# GN2 pressure vessel rack (south-west deck behind LUT)
for gy_off in (0.14, 0.28):
    for gz in (-1.45, -1.31, -1.17):
        ml.cyl((-3.55, ML_Y1 + gy_off, gz), (-2.95, ML_Y1 + gy_off, gz), 0.048, "pipe", seg=10)
ml.box((-3.25, ML_Y1 + 0.18, -1.31), (0.48, 0.32, 0.44), "ml_dark")
# Valve manifold shelter on north-west corner
ml.box((-3.30, ML_Y1 + 0.24, 1.35), (0.52, 0.48, 0.56), "cladding")
ml.box((-3.30, ML_Y1 + 0.50, 1.35), (0.56, 0.05, 0.60), "ml_dark")

# Deck corner floodlight stanchions illuminating Saturn V aft stages
for fx, fz in ((1.35, -1.90), (1.35, 1.90), (-1.10, -1.92), (-1.10, 1.92)):
    ml.cyl((fx, ML_Y1 + 0.01, fz), (fx, ML_Y1 + 0.24, fz), 0.022, "ml_dark", seg=8)
    add_floodlight_pod(ml, (fx, ML_Y1 + 0.26, fz), (0.0, ML_Y1 + 1.8, 0.0), scale=0.85)

ML = ml.finish(smooth_angle=25)

# ==========================================================================
# HDA_0..3: Forged Saturn V Hold-Down Arms (hinge pin at y = ML_Y1 + 0.09)
# ==========================================================================
for k in range(4):
    ang = math.pi / 4 + k * math.pi / 2
    r = 0.86
    pv = (r * math.cos(ang), ML_Y1 + 0.09, r * math.sin(ang))
    h = Builder(f"HDA_{k}", MATS)
    ca, sa = math.cos(ang), math.sin(ang)
    loc = lambda lx, ly, lz: (pv[0] + lx * ca - lz * sa, pv[1] + ly, pv[2] + lx * sa + lz * ca)
    # Twin forged cheek plates pivoting around hinge pin -> reaching inward to S-IC hold-down shoe (r = 0.575)
    for sz in (-0.042, 0.042):
        h.beam(loc(0.05, 0.02, sz), loc(-0.24, 0.08, sz), 0.048, "ml", h=0.11)
        h.beam(loc(-0.08, 0.04, sz * 1.15), loc(-0.26, 0.09, sz * 1.15), 0.032, "ml_dark", h=0.07)
    # Cross web, rear counterweight anvil & hydraulic release piston
    h.box(loc(-0.11, 0.06, 0.0), (0.18, 0.07, 0.09), "ml_dark", yaw=-ang)
    h.box(loc(0.06, 0.04, 0.0), (0.09, 0.11, 0.13), "ml_dark", yaw=-ang)
    h.cyl(loc(0.03, -0.02, 0.0), loc(-0.18, 0.05, 0.0), 0.022, "pipe", seg=8)
    # Serrated upper hold-down clamp head engaging Saturn V aft skirt shoe
    h.box(loc(-0.265, 0.075, 0.0), (0.11, 0.09, 0.14), "ml_dark", yaw=-ang)
    h.box(loc(-0.30, 0.08, 0.0), (0.04, 0.07, 0.11), "hazard", yaw=-ang, uv_scale=2.0)
    h.finish(smooth_angle=20, origin3=pv)

# ==========================================================================
# LUT: 12 m square red Launch Umbilical Tower (flanged H-beams, open stairs & cranes)
# ==========================================================================
TX, TW = -2.35, 1.16
T_Y0 = ML_Y1
T_H = 12.2
BAY = 0.555
nb = int(round(T_H / BAY))
hw = TW * 0.5

lut = Builder("LUT", MATS)
corners = [(TX - hw, -hw), (TX + hw, -hw), (TX + hw, hw), (TX - hw, hw)]

# Four main corner H-beam columns + heavy ML base anchor haunches
for cx, cz in corners:
    lut.ibeam((cx, T_Y0, cz), (cx, T_Y0 + T_H, cz), 0.092, 0.092, "lut", uv_scale=0.75)
    lut.box((cx, T_Y0 + 0.08, cz), (0.22, 0.16, 0.22), "ml_dark")
    lut.box((cx, T_Y0 + 0.17, cz), (0.16, 0.03, 0.16), "lut")

# Elevator structural frame posts (two open-framed shafts on the west side of LUT)
shaft_zs = (-0.26, 0.26)
sx0, sx1 = TX - 0.37, TX - 0.11
for sz_c in shaft_zs:
    sz0, sz1 = sz_c - 0.13, sz_c + 0.13
    for px in (sx0, sx1):
        for pz in (sz0, sz1):
            lut.beam((px, T_Y0, pz), (px, T_Y0 + T_H, pz), 0.022, "ml_dark")
    # Corrugated armored elevator core set cleanly inside the steel frame + roof motor housing
    lut.box(((sx0 + sx1) * 0.5, T_Y0 + T_H * 0.5, sz_c), (0.20, T_H - 0.05, 0.20), "cladding_dark", uv_scale=0.9)

# Tier-by-tier structural framing, cross-bracing, grated decks, railings, landing doors & zig-zag stairs
for i in range(nb + 1):
    y = T_Y0 + i * BAY
    # Perimeter spandrel girders + corner splice gussets
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        lut.ibeam((a[0], y, a[1]), (b[0], y, b[1]), 0.056, 0.062, "lut")
    for cx, cz in corners:
        add_gusset_plate(lut, (cx, y, cz), 0.15, 0.026, key="lut_dark")

    if 0 < i < nb:
        # Grating deck covering west elevator-lobby half + alternating stair turnaround landing (leaving stairwell bay open)
        lut.box((TX - 0.26, y + 0.015, 0.0), (0.56, 0.018, TW - 0.10), "grating", uv_scale=2.2)
        land_z = 0.36 if (i % 2 == 1) else -0.36
        lut.box((TX + 0.28, y + 0.015, land_z), (0.48, 0.018, 0.36), "grating", uv_scale=2.2)
        add_railing(lut, (TX + 0.04, y + 0.025, land_z - (0.18 if i % 2 == 1 else -0.18)),
                    (TX + 0.04, y + 0.025, -land_z), height=0.09)
        # Yellow safety handrails along open south/north/east edges
        add_railing(lut, (TX - 0.52, y + 0.025, hw - 0.04), (TX + 0.52, y + 0.025, hw - 0.04), height=0.095)
        add_railing(lut, (TX - 0.52, y + 0.025, -hw + 0.04), (TX + 0.52, y + 0.025, -hw + 0.04), height=0.095)
        add_railing(lut, (TX + 0.52, y + 0.025, -hw + 0.04), (TX + 0.52, y + 0.025, hw - 0.04), height=0.095)
        # Elevator landing doorway headers & steel doors on the +X face of shafts
        for sz_c in shaft_zs:
            lut.box((sx1 + 0.01, y + 0.14, sz_c), (0.025, 0.24, 0.16), "cladding")
            lut.box((sx1 + 0.022, y + 0.14, sz_c), (0.010, 0.20, 0.012), "ml_dark")

    if i < nb:
        y1 = y + BAY
        # Alternating X/Warren cross-bracing on all 4 exterior faces + elevator frame rings
        for k in range(4):
            a, b = corners[k], corners[(k + 1) % 4]
            lut.beam((a[0], y, a[1]), (b[0], y1, b[1]), 0.028, "lut")
            lut.beam((b[0], y, b[1]), (a[0], y1, a[1]), 0.024, "lut")
        for sz_c in shaft_zs:
            sz0, sz1 = sz_c - 0.13, sz_c + 0.13
            lut.beam((sx0, y, sz0), (sx0, y1, sz1), 0.012, "ml_dark")
            lut.beam((sx0, y, sz1), (sx0, y1, sz0), 0.012, "ml_dark")
        # Open zig-zag stairwell climbing floor by floor inside the +X bay
        z_start, z_end = (-0.28, 0.28) if (i % 2 == 0) else (0.28, -0.28)
        add_stair_flight(lut, (TX + 0.26, y + 0.02, z_start), (TX + 0.26, y1 + 0.02, z_end), width=0.20, steps=6)

# Enclosed blast-hardened ECS & telemetry equipment shelters inside Levels 1-2, Level 9, and Level 16
for lvl, h_bays, key_wall in ((1, 2, "cladding"), (9, 1, "cladding"), (16, 1, "cladding")):
    sy0 = T_Y0 + lvl * BAY
    sh = h_bays * BAY - 0.06
    lut.box((TX - 0.02, sy0 + sh * 0.5 + 0.02, 0.0), (0.58, sh, 0.44), key_wall)
    lut.box((TX - 0.02, sy0 + sh + 0.03, 0.0), (0.62, 0.03, 0.48), "ml_dark")
    lut.box((TX + 0.28, sy0 + sh * 0.45, 0.0), (0.02, min(0.32, sh * 0.7), 0.18), "ml_dark")

# External cryogenic LOX/LH2 standpipes, red firex main & cable trays running up the west (-X) face
for pz, col_key, rad in ((-0.38, "pipe", 0.030), (-0.24, "pipe", 0.026), (0.22, "pipe", 0.024), (0.38, "pipe_orange", 0.022)):
    lut.cyl((TX - hw - 0.06, T_Y0 + 0.05, pz), (TX - hw - 0.06, T_Y0 + T_H - 0.15, pz), rad, col_key, seg=10)
for z_tray in (-0.06, 0.06):
    lut.box((TX - hw - 0.045, T_Y0 + T_H * 0.5, z_tray), (0.04, T_H - 0.2, 0.075), "hose")
# Standpipe clamp collars every 2 levels
for i in range(1, nb, 2):
    y = T_Y0 + i * BAY
    lut.box((TX - hw - 0.05, y, 0.0), (0.09, 0.03, 0.88), "ml_dark")

# Station swing-arm hinge clevis lugs on east face (x = TX + hw, z = -0.14)
HINGE_X, HINGE_Z = TX + hw, -0.14
ARM_WORLDS = [-2.25, -0.80, 0.02, 0.95, 2.00, 2.90, 4.06, 5.32, 5.68]
for wy in ARM_WORLDS:
    ay = wy + 6.65
    lut.box((HINGE_X - 0.005, ay + 0.08, HINGE_Z), (0.04, 0.22, 0.20), "ml_dark")
    for dy_e in (-0.015, 0.185):
        lut.box((HINGE_X + 0.02, ay + dy_e, HINGE_Z), (0.06, 0.024, 0.13), "ml_dark")

# Tower-mounted floodlight banks aimed at Saturn V
for lvl in (5, 11, 16, 21):
    fy = T_Y0 + lvl * BAY + 0.05
    for sz in (-0.42, 0.42):
        add_floodlight_pod(lut, (TX + hw + 0.05, fy, sz), (0.0, fy + 0.4, 0.0), scale=0.95)

# Roof deck (Level 22), elevator motor penthouse & iconic Apollo Hammerhead Crane
top = T_Y0 + T_H
lut.box((TX, top + 0.04, 0.0), (TW + 0.14, 0.08, TW + 0.14), "lut")
lut.box((TX, top + 0.088, 0.0), (TW + 0.08, 0.016, TW + 0.08), "grating", uv_scale=2.2)
for p0, p1 in (
    ((TX - hw - 0.04, top + 0.095, -hw - 0.04), (TX + hw + 0.04, top + 0.095, -hw - 0.04)),
    ((TX - hw - 0.04, top + 0.095, hw + 0.04), (TX + hw + 0.04, top + 0.095, hw + 0.04)),
    ((TX - hw - 0.04, top + 0.095, -hw - 0.04), (TX - hw - 0.04, top + 0.095, hw + 0.04)),
    ((TX + hw + 0.04, top + 0.095, -hw - 0.04), (TX + hw + 0.04, top + 0.095, hw + 0.04)),
):
    add_railing(lut, p0, p1, height=0.10)

# Crane machinery penthouse + slewing ring pedestal
lut.box((TX - 0.22, top + 0.26, 0.0), (0.50, 0.34, 0.56), "cladding")
lut.box((TX - 0.22, top + 0.44, 0.0), (0.54, 0.04, 0.60), "ml_dark")
lut.cyl((TX, top + 0.08, 0.0), (TX, top + 0.48, 0.0), 0.24, "lut", seg=16)
lut.cyl((TX, top + 0.46, 0.0), (TX, top + 0.54, 0.0), 0.26, "ml_dark", seg=16)
lut.box((TX, top + 0.66, 0.0), (0.40, 0.24, 0.40), "lut")

# Rotating Hammerhead Crane: true 3D lattice jib + A-frame peak + stays + counterweight + cab + hook block
jib_y = top + 0.86
add_crane_lattice(lut, (TX - 1.25, jib_y, 0.0), (TX + 2.02, jib_y, 0.0), 0.24, 0.22, "lut", "lut_dark", bays=13)
# A-frame top apex mast & diagonal tension stays
apex = (TX, jib_y + 0.56, 0.0)
for s in (-1, 1):
    lut.beam((TX - 0.14, jib_y + 0.10, s * 0.12), apex, 0.036, "lut")
    lut.beam((TX + 0.14, jib_y + 0.10, s * 0.12), apex, 0.036, "lut")
    lut.cyl(apex, (TX + 1.96, jib_y + 0.10, s * 0.08), 0.008, "ml_dark", seg=6)
    lut.cyl(apex, (TX - 1.20, jib_y + 0.10, s * 0.08), 0.008, "ml_dark", seg=6)
# Counterweight box with hazard striping
lut.box((TX - 1.06, jib_y - 0.11, 0.0), (0.42, 0.30, 0.36), "ml_dark")
lut.box((TX - 1.06, jib_y - 0.11, 0.0), (0.43, 0.12, 0.37), "hazard", uv_scale=1.6)
# Glazed operator cab slung beside crane collar
lut.box((TX + 0.34, jib_y - 0.19, 0.28), (0.30, 0.23, 0.22), "lut")
lut.box((TX + 0.45, jib_y - 0.18, 0.28), (0.12, 0.15, 0.18), "glass")
# Traveling trolley, twin hoist wire ropes & hazard-striped hook block
lut.box((TX + 1.82, jib_y - 0.14, 0.0), (0.20, 0.08, 0.22), "ml_dark")
for hz in (-0.035, 0.035):
    lut.cyl((TX + 1.82, jib_y - 0.18, hz), (TX + 1.82, jib_y - 0.86, hz), 0.005, "ml_dark", seg=6)
lut.box((TX + 1.82, jib_y - 0.91, 0.0), (0.11, 0.10, 0.11), "hazard", uv_scale=2.2)
lut.cyl((TX + 1.82, jib_y - 0.96, 0.0), (TX + 1.82, jib_y - 1.04, 0.0), 0.018, "ml_dark", r1=0.008, seg=8)

# Rooftop Lightning Mast + Red Aviation Obstruction Beacon
lut.cyl((TX - 0.02, jib_y + 0.56, 0.0), (TX - 0.02, top + 2.15, 0.0), 0.028, "white_plain", r1=0.011, seg=10)
add_aviation_beacon(lut, (TX - 0.02, top + 2.15, 0.0), scale=1.0)

LUT = lut.finish(smooth_angle=20)

# ==========================================================================
# ARM_0..8: Apollo Umbilical Swing Arms + Enclosed Crew Access Arm & White Room
# ==========================================================================
ARMS = [  # (world y, hull radius at that height, white room?)
    (-2.25, 0.553, False),  # 1 S-IC intertank
    (-0.80, 0.553, False),  # 2 S-IC forward
    (0.02, 0.553, False),   # 3 S-II aft
    (0.95, 0.553, False),   # 4 S-II intermediate
    (2.00, 0.553, False),   # 5 S-II forward
    (2.90, 0.363, False),   # 6 S-IVB aft
    (4.06, 0.363, False),   # 7 S-IVB forward / IU
    (5.32, 0.215, False),   # 8 Service Module
    (5.68, 0.185, True),    # 9 Command Module Crew Access Arm + White Room
]

for k, (wy, hull_r, white_room) in enumerate(ARMS):
    y = wy + 6.65
    end_x = -math.sqrt(max(0.005, hull_r ** 2 - HINGE_Z ** 2)) - 0.015
    hinge_x = HINGE_X + 0.02
    x_truss0 = hinge_x + 0.06
    a = Builder(f"ARM_{k}", MATS)
    depth = 0.16 if not white_room else 0.19

    # Rotary hinge clevis & vertical pivot pin + hydraulic retraction actuator beneath
    for dy_l in (0.02, depth - 0.02):
        a.box((hinge_x + 0.03, y + dy_l, HINGE_Z), (0.08, 0.036, 0.13), "ml_dark")
    a.cyl((hinge_x, y - 0.04, HINGE_Z), (hinge_x, y + depth + 0.03, HINGE_Z), 0.022, "pipe", seg=8)
    a.cyl((hinge_x + 0.02, y - 0.06, HINGE_Z), (x_truss0 + 0.24, y + 0.01, HINGE_Z), 0.018, "pipe", seg=8)

    # Twin Warren truss side frames + diagonal web members + cross-ties
    for s in (-1, 1):
        z = HINGE_Z + s * 0.082
        a.beam((hinge_x + 0.02, y, HINGE_Z + s * 0.04), (x_truss0, y, z), 0.022, "lut")
        a.beam((hinge_x + 0.02, y + depth, HINGE_Z + s * 0.04), (x_truss0, y + depth, z), 0.022, "lut")
        a.beam((x_truss0, y, z), (end_x, y, z), 0.026, "lut")
        a.beam((x_truss0, y + depth, z), (end_x, y + depth, z), 0.026, "lut")
        n = max(2, int((end_x - x_truss0) / 0.19))
        for i in range(n + 1):
            x = x_truss0 + (end_x - x_truss0) * i / n
            a.beam((x, y, z), (x, y + depth, z), 0.015, "lut")
            if i < n:
                x1 = x_truss0 + (end_x - x_truss0) * (i + 1) / n
                if i % 2 == 0:
                    a.beam((x, y, z), (x1, y + depth, z), 0.012, "lut")
                else:
                    a.beam((x1, y, z), (x, y + depth, z), 0.012, "lut")

    # Cross floor beams, perforated grating catwalk & safety handrails
    span = end_x - x_truss0
    n_cross = max(2, int(span / 0.22))
    for i in range(n_cross + 1):
        x = x_truss0 + span * i / n_cross
        a.beam((x, y, HINGE_Z - 0.082), (x, y, HINGE_Z + 0.082), 0.014, "lut_dark")
        a.beam((x, y + depth, HINGE_Z - 0.082), (x, y + depth, HINGE_Z + 0.082), 0.014, "lut_dark")
    a.box(((x_truss0 + end_x) * 0.5, y + 0.010, HINGE_Z), (span, 0.014, 0.155), "grating", uv_scale=2.5)
    if not white_room:
        for s in (-1, 1):
            add_railing(a, (x_truss0 + 0.04, y + depth + 0.01, HINGE_Z + s * 0.08), (end_x - 0.03, y + depth + 0.01, HINGE_Z + s * 0.08), height=0.075, post_step=0.28)

    # Slung cryogenic & pneumatic umbilical hoses in catenary profile + QD bumper head
    mid_x = (x_truss0 + end_x) * 0.5
    for dz, rad, h_key in ((-0.045, 0.015, "pipe"), (0.0, 0.018, "hose"), (0.045, 0.014, "pipe")):
        a.pipe_elbow([
            (hinge_x + 0.04, y - 0.025, HINGE_Z + dz),
            (mid_x, y - 0.068, HINGE_Z + dz),
            (end_x + 0.02, y - 0.015, HINGE_Z + dz),
        ], rad, h_key, seg=8)
    a.box((end_x + 0.02, y + depth * 0.5, HINGE_Z), (0.045, depth + 0.05, 0.19), "ml_dark")
    a.box((end_x + 0.044, y + depth * 0.5, HINGE_Z), (0.012, depth * 0.72, 0.13), "hose")

    if white_room:
        # Enclosed Apollo Cleanroom Access Corridor + blue NASA band & portholes + sculpted White Room
        a.box(((x_truss0 + end_x) * 0.5 - 0.04, y + depth + 0.08, HINGE_Z), (span - 0.06, 0.17, 0.185), "white", tile_uv=False)
        for wx_w in (x_truss0 + 0.32, x_truss0 + 0.72, x_truss0 + 1.12):
            if wx_w < end_x - 0.15:
                a.box((wx_w, y + depth + 0.09, HINGE_Z + 0.094), (0.09, 0.055, 0.010), "glass")
                a.box((wx_w, y + depth + 0.09, HINGE_Z - 0.094), (0.09, 0.055, 0.010), "glass")
        # Stepped environmental White Room cabin + dark neoprene seal collar hugging CM/BPC hatch
        a.box((end_x - 0.10, y + 0.13, HINGE_Z + 0.01), (0.22, 0.25, 0.25), "white", tile_uv=False)
        a.box((end_x - 0.10, y + 0.265, HINGE_Z + 0.01), (0.24, 0.025, 0.27), "ml_dark")
        a.box((end_x + 0.018, y + 0.13, HINGE_Z + 0.01), (0.026, 0.21, 0.21), "hose")

    a.finish(smooth_angle=20, origin3=(hinge_x, y, HINGE_Z))

# ==========================================================================
# SPHERES: LOX (west-north) & LH2 (east-north) cryogenic spheres + stanchioned pipes
# ==========================================================================
sp = Builder("SPHERES", MATS)
for sx, sz, r in ((-40.0, -34.0, 1.05), (42.0, -30.0, 1.15)):
    gy = BASE_Y
    # Concrete containment dike foundation & inner pedestal
    sp.box((sx, gy + 0.06, sz), (r * 3.6, 0.12, r * 3.6), "concrete")
    for s in (-1, 1):
        sp.box((sx, gy + 0.22, sz + s * (r * 1.72)), (r * 3.6, 0.22, 0.16), "concrete")
        sp.box((sx + s * (r * 1.72), gy + 0.22, sz), (0.16, 0.22, r * 3.4), "concrete")

    # Cryogenic gore-paneled aluminum sphere + equatorial ring girder
    c_y = gy + r * 1.55
    sp.sphere((sx, c_y, sz), r, "sphere", seg=36, rings=18)
    legs_pts = []
    for i in range(10):
        ang = i * math.tau / 10
        x, z = sx + math.cos(ang) * r * 0.99, sz + math.sin(ang) * r * 0.99
        sp.cyl((x, gy + 0.12, z), (x, c_y + 0.06, z), 0.055, "ml", seg=8)
        sp.box((x, gy + 0.14, z), (0.16, 0.06, 0.16), "ml_dark")
        legs_pts.append((x, z))
    # X-bracing tie rods between adjacent support legs
    for i in range(10):
        j = (i + 1) % 10
        x0, z0 = legs_pts[i]
        x1, z1 = legs_pts[j]
        sp.beam((x0, gy + 0.20, z0), (x1, c_y - 0.15, z1), 0.018, "ml_dark")
        sp.beam((x1, gy + 0.20, z1), (x0, c_y - 0.15, z0), 0.018, "ml_dark")
        sp.beam((x0, c_y, z0), (x1, c_y, z1), 0.045, "ml")

    # Caged vertical ladder to upper dome valve catwalk + boil-off vent stack + red beacon
    sp.box((sx, gy + r * 2.55 + 0.04, sz), (0.48, 0.04, 0.48), "grating", uv_scale=2.2)
    add_railing(sp, (sx - 0.22, gy + r * 2.58, sz - 0.22), (sx + 0.22, gy + r * 2.58, sz - 0.22), height=0.095)
    add_railing(sp, (sx - 0.22, gy + r * 2.58, sz + 0.22), (sx + 0.22, gy + r * 2.58, sz + 0.22), height=0.095)
    add_caged_ladder(sp, sx, gy + 0.14, gy + r * 2.56, sz + r * 1.04, 0.0, 1.0)
    sp.cyl((sx, gy + r * 1.55, sz), (sx, gy + r * 2.85, sz), 0.032, "pipe", seg=8)
    add_aviation_beacon(sp, (sx, gy + r * 2.85, sz), scale=0.85)

    # Stanchioned cryo transfer pipeline heading toward the pad mound
    p_end = (sx * 0.28, gy + 0.28, sz * 0.28 - 3.5)
    p_start = (sx, gy + 0.28, sz)
    sp.cyl(p_start, p_end, 0.065, "pipe", seg=10)
    for step_t in (0.15, 0.35, 0.55, 0.75, 0.95):
        px = p_start[0] + (p_end[0] - p_start[0]) * step_t
        pz = p_start[2] + (p_end[2] - p_start[2]) * step_t
        sp.box((px, gy + 0.12, pz), (0.28, 0.24, 0.28), "concrete")
        sp.box((px, gy + 0.24, pz), (0.24, 0.05, 0.24), "ml_dark")

SP = sp.finish()

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
