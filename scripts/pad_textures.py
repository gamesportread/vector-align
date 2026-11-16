"""
Procedural PBR texture & material library for Kennedy Space Center LC-39A / LC-39B launch complexes.

Builds packed BaseColor, OpenGL Tangent Normal, and ORM (Occlusion/Roughness/Metallic) materials
via rocket_textures.PBRCanvas so launch towers, Mobile Launchers, swing arms, blast shields, and
ground support structures match the PBR fidelity of saturn_v.glb and sls_block1.glb.
"""
import os
import sys
import bpy
import numpy as np

_here = os.path.dirname(os.path.abspath(__file__))
if _here not in sys.path:
    sys.path.insert(0, _here)

from rocket_textures import (  # noqa: E402
    PBRCanvas,
    fbm_periodic,
    hex_srgb,
    srgb_to_linear,
)


def make_solid_mat(name, hex_col, metal=0.0, rough=0.6, emissive_hex=None, emissive_strength=0.0):
    """Create a solid Principled BSDF material (optionally emissive for beacons/floodlights)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*srgb_to_linear(hex_srgb(hex_col)), 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emissive_hex is not None and emissive_strength > 0.0:
        bsdf.inputs["Emission Color"].default_value = (*srgb_to_linear(hex_srgb(emissive_hex)), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    return m


def make_steel_panel_pbr(
    name,
    base_hex,
    size=512,
    n_cols=4,
    n_rows=4,
    rough=0.52,
    metal=0.42,
    wear=0.055,
    seam_depth=-0.38,
    seam_dark=0.76,
    rivets=True,
    soot_bottom=0.0,
    normal_strength=2.2,
    seed=10,
):
    """Painted/galvanized structural steel with bolted plate seams, rivets, and coastal weathering."""
    tex = PBRCanvas(size, size, base_hex=base_hex, rough=rough, metal=metal)
    tex.add_panel_grid(
        0.0,
        1.0,
        n_cols=n_cols,
        n_rows=n_rows,
        color_var=0.032,
        seam_px=2,
        seam_depth=seam_depth,
        seam_dark=seam_dark,
        rivets=rivets,
        seed=seed,
    )
    tex.add_micro_wear(0.0, 1.0, strength=wear, bump=0.14, seed=seed + 31)
    # Subtle vertical rain-streak / salt-air grime modulation
    streaks = fbm_periodic(size, size, 32, 4, octaves=3, seed=seed + 77)
    tex.color *= np.clip(0.92 + 0.16 * streaks, 0.75, 1.08)[..., None]
    tex.rough = np.clip(tex.rough + (0.5 - streaks) * 0.10, 0.24, 0.94)
    if soot_bottom > 0.0:
        tex.add_soot_gradient(0.0, 0.35, strength=soot_bottom, dark_at_bottom=True)
    return tex.build_material(name, normal_strength=normal_strength)


def make_corrugated_pbr(
    name,
    base_hex="#adb3b9",
    size=512,
    n_ribs=20,
    rough=0.52,
    metal=0.45,
    normal_strength=2.6,
    seed=21,
):
    """Ribbed corrugated metal siding for elevator shafts, equipment shelters, and TSMU hoods."""
    tex = PBRCanvas(size, size, base_hex=base_hex, rough=rough, metal=metal)
    tex.add_corrugation(0.0, 1.0, n_ribs=n_ribs, amp=0.65, ao_dark=0.18)
    # Horizontal panel overlap seams at 25%, 50%, 75%
    for v in (0.25, 0.50, 0.75):
        tex.paint_band(v - 0.008, v + 0.008, hex_col=None, rough=rough + 0.12, height_delta=-0.28)
        y0, y1 = tex._vy(v - 0.008, v + 0.008)
        tex.color[y0:y1] *= 0.78
    tex.add_micro_wear(0.0, 1.0, strength=0.04, bump=0.08, seed=seed)
    return tex.build_material(name, normal_strength=normal_strength)


def make_grating_pbr(name, base_hex="#555c64", size=256, cells=16, rough=0.58, metal=0.62):
    """Open industrial steel bar-grating / waffle deck surface with crisp AO and normal relief."""
    tex = PBRCanvas(size, size, base_hex=base_hex, rough=rough, metal=metal)
    u = (np.arange(size, dtype=np.float32)[None, :] * cells / size) % 1.0
    v = (np.arange(size, dtype=np.float32)[:, None] * cells / size) % 1.0
    bar_x = (u < 0.22) | (u > 0.88)
    bar_y = (v < 0.18) | (v > 0.90)
    bar = bar_x | bar_y
    deep_col = np.array(srgb_to_linear(hex_srgb("#181b1f")), dtype=np.float32)
    top_col = np.array(srgb_to_linear(hex_srgb(base_hex)), dtype=np.float32)
    tex.color = np.where(bar[..., None], top_col, deep_col)
    tex.height = np.where(bar, 0.45, -0.55).astype(np.float32)
    tex.rough = np.where(bar, rough, 0.88).astype(np.float32)
    tex.metal = np.where(bar, metal, 0.15).astype(np.float32)
    tex.add_micro_wear(0.0, 1.0, strength=0.03, bump=0.05, seed=91)
    return tex.build_material(name, normal_strength=2.8)


def make_deck_plate_pbr(name, base_hex="#585e65", size=512, rough=0.64, metal=0.45, seed=33):
    """Heavy blast-hardened ML deck armor plating with diamond tread, weld seams, and heat wear."""
    tex = PBRCanvas(size, size, base_hex=base_hex, rough=rough, metal=metal)
    tex.add_panel_grid(0.0, 1.0, n_cols=6, n_rows=6, color_var=0.04, seam_px=2, seam_depth=-0.42, seam_dark=0.72, rivets=True, seed=seed)
    # Subtle treadplate pattern
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    tread = np.sin((xx + yy) * (np.pi * 24 / size)) * np.sin((xx - yy) * (np.pi * 24 / size))
    tex.height += np.maximum(0.0, tread) * 0.18
    tex.add_micro_wear(0.0, 1.0, strength=0.07, bump=0.16, seed=seed + 19)
    return tex.build_material(name, normal_strength=2.2)


def make_deflector_pbr(name, base_hex="#4e3d34", size=512, rough=0.62, metal=0.52, seed=44):
    """Heat-oxidized, exhaust-scorched refractory steel flame deflector."""
    tex = PBRCanvas(size, size, base_hex=base_hex, rough=rough, metal=metal)
    tex.add_panel_grid(0.0, 1.0, n_cols=4, n_rows=8, color_var=0.05, seam_px=2, seam_depth=-0.45, seam_dark=0.70, rivets=False, seed=seed)
    scorch = fbm_periodic(size, size, 6, 6, octaves=4, seed=seed + 5)
    tex.color *= np.clip(0.55 + 0.65 * scorch, 0.35, 1.05)[..., None]
    tex.rough = np.clip(0.52 + 0.36 * (1.0 - scorch), 0.35, 0.92)
    tex.height += (scorch - 0.5) * 0.32
    return tex.build_material(name, normal_strength=2.5)


def make_trench_brick_pbr(name, base_hex="#4b4742", size=512, rough=0.88, metal=0.04, seed=55):
    """Refractory firebrick lining for the LC-39 flame trench walls & floor."""
    tex = PBRCanvas(size, size, base_hex=base_hex, rough=rough, metal=metal)
    rows, cols = 16, 8
    yy = (np.arange(size, dtype=np.float32)[:, None] * rows / size)
    row_idx = np.floor(yy).astype(np.int32)
    row_f = yy - row_idx
    xx = (np.arange(size, dtype=np.float32)[None, :] * cols / size) + (row_idx % 2) * 0.5
    col_idx = np.floor(xx).astype(np.int32) % cols
    col_f = xx - np.floor(xx)
    mortar = (row_f < 0.08) | (row_f > 0.94) | (col_f < 0.05) | (col_f > 0.96)

    rng = np.random.default_rng(seed)
    brick_var = rng.uniform(-0.10, 0.10, size=(rows + 1, cols + 1)).astype(np.float32)
    vmap = brick_var[row_idx % rows, col_idx]
    mortar_col = np.array(srgb_to_linear(hex_srgb("#282522")), dtype=np.float32)

    tex.color = np.clip(tex.color * (1.0 + vmap[..., None]), 0.0, 1.0)
    tex.color = np.where(mortar[..., None], mortar_col, tex.color)
    tex.height = np.where(mortar, -0.45, 0.12 + vmap * 0.6).astype(np.float32)
    tex.rough = np.where(mortar, 0.94, 0.85).astype(np.float32)
    soot = fbm_periodic(size, size, 4, 4, octaves=3, seed=seed + 11)
    tex.color *= np.clip(0.68 + 0.45 * soot, 0.40, 1.05)[..., None]
    return tex.build_material(name, normal_strength=2.4)


def make_hazard_stripe_pbr(name, size=256, stripes=6, seed=66):
    """Safety yellow & charcoal diagonal hazard striping for blast curbs and crane counterweights."""
    tex = PBRCanvas(size, size, base_hex="#dfb028", rough=0.48, metal=0.18)
    u = np.arange(size, dtype=np.float32)[None, :] / size
    v = np.arange(size, dtype=np.float32)[:, None] / size
    phase = ((u + v) * stripes) % 1.0
    is_dark = phase < 0.48
    ca = np.array(srgb_to_linear(hex_srgb("#1d2024")), dtype=np.float32)
    cb = np.array(srgb_to_linear(hex_srgb("#e2af26")), dtype=np.float32)
    tex.color = np.where(is_dark[..., None], ca, cb)
    tex.rough = np.where(is_dark, 0.56, 0.44).astype(np.float32)
    tex.add_micro_wear(0.0, 1.0, strength=0.05, bump=0.08, seed=seed)
    return tex.build_material(name, normal_strength=1.5)


def make_white_room_pbr(name, size=512, seed=77):
    """Aerospace cleanroom white cladding with crisp panel seams, rivets, and blue NASA trim band."""
    tex = PBRCanvas(size, size, base_hex="#f1f1ec", rough=0.38, metal=0.08)
    tex.add_panel_grid(0.0, 1.0, n_cols=6, n_rows=4, color_var=0.016, seam_px=2, seam_depth=-0.30, seam_dark=0.82, rivets=True, seed=seed)
    tex.paint_band(0.14, 0.22, hex_col="#174a8c", rough=0.34, metal=0.05)
    tex.add_micro_wear(0.0, 1.0, strength=0.025, bump=0.05, seed=seed + 9)
    return tex.build_material(name, normal_strength=1.8)


def make_sphere_tank_pbr(name, base_hex="#ebede9", size=512, seed=88):
    """Cryogenic storage sphere / elevated water tank painted aluminum gore panels."""
    tex = PBRCanvas(size, size, base_hex=base_hex, rough=0.38, metal=0.22)
    tex.add_panel_grid(0.05, 0.95, n_cols=16, n_rows=6, color_var=0.018, seam_px=2, seam_depth=-0.28, seam_dark=0.84, rivets=False, seed=seed)
    tex.paint_band(0.485, 0.515, hex_col="#c9cdd1", rough=0.40, metal=0.45, height_delta=0.18)
    tex.add_micro_wear(0.0, 1.0, strength=0.028, bump=0.06, seed=seed + 13)
    return tex.build_material(name, normal_strength=1.9)


def create_pad_materials():
    """Build the shared PBR material palette used by LC-39A and LC-39B."""
    return {
        # PAD_Concrete name is preserved so LiftoffScene3D applies world-planar weathered concrete at runtime
        "concrete": make_solid_mat("PAD_Concrete", "#a9a59a", metal=0.0, rough=0.92),
        "trench": make_trench_brick_pbr("PAD_TrenchRefractory"),
        "deflector": make_deflector_pbr("PAD_Deflector"),
        "ml": make_steel_panel_pbr("ML_Grey", "#82888e", n_cols=4, n_rows=3, rough=0.54, metal=0.42, seed=11),
        "ml_dark": make_steel_panel_pbr("ML_DarkSteel", "#373c42", n_cols=4, n_rows=4, rough=0.52, metal=0.58, seed=12),
        "deck": make_deck_plate_pbr("ML_Deck", "#585e65"),
        "grating": make_grating_pbr("TOWER_Grating", "#4c525a"),
        "cladding": make_corrugated_pbr("TOWER_EquipCladding", "#aeb4ba", n_ribs=22, rough=0.50, metal=0.46),
        "cladding_dark": make_corrugated_pbr("TOWER_DarkCladding", "#464c54", n_ribs=18, rough=0.54, metal=0.52, seed=29),
        "hazard": make_hazard_stripe_pbr("PAD_HazardStripe"),
        "lut": make_steel_panel_pbr("LUT_Red", "#bc4228", n_cols=3, n_rows=4, rough=0.50, metal=0.34, soot_bottom=0.16, seed=14),
        "lut_dark": make_steel_panel_pbr("LUT_Shadow", "#7b2c1d", n_cols=3, n_rows=4, rough=0.58, metal=0.38, seed=15),
        "white": make_white_room_pbr("SV_WhiteRoom"),
        "white_plain": make_solid_mat("SV_WhiteSeal", "#e8e8e2", metal=0.0, rough=0.52),
        "hose": make_solid_mat("PAD_UmbilicalHose", "#23262b", metal=0.12, rough=0.72),
        "pipe": make_solid_mat("PAD_Pipe", "#cfd4d8", metal=0.74, rough=0.30),
        "pipe_orange": make_solid_mat("PAD_FirePipe", "#c94624", metal=0.35, rough=0.45),
        "sphere": make_sphere_tank_pbr("PAD_Sphere", "#eaede9"),
        "rail": make_solid_mat("ML_Rail", "#dfb32c", metal=0.28, rough=0.46),
        "glass": make_solid_mat("LUT_Cab", "#14222c", metal=0.35, rough=0.22),
        "flood_glow": make_solid_mat("PAD_FloodGlow", "#fff2d6", metal=0.0, rough=0.25, emissive_hex="#ffe8b8", emissive_strength=2.2),
        "beacon_red": make_solid_mat("PAD_BeaconRed", "#ff2a1f", metal=0.0, rough=0.25, emissive_hex="#ff261b", emissive_strength=3.0),
    }
