"""
Shared procedural Blender geometry builders and Kennedy Space Center Launch Complex
infrastructure (hardstand pad, flame trench, deflector, stairs, ladders, lighting,
catenary rigging, and H-beam/truss tower helpers) for LC-39A and LC-39B.
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.tau

# Shared pad & terrain scale (1 m = 0.11 scene units)
M_PER_UNIT = 1.0 / 0.11
TOP_R = 9.0
BASE_R = 16.5
BASE_Y = -1.6


def P(x, y, z):
    """Map Three.js (x, y_up, z) -> Blender (x, -z, y_up)."""
    return Vector((x, -z, y))


def select_only(obj):
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


class Builder:
    """Accumulates detailed structural primitives into a single UV-mapped bmesh with per-face materials."""

    def __init__(self, name, mats):
        self.name = name
        self.mats = mats
        self.bm = bmesh.new()
        self.uv_layer = self.bm.loops.layers.uv.new("UVMap")
        self.mat_names = []

    def mi(self, key):
        if key not in self.mat_names:
            self.mat_names.append(key)
        return self.mat_names.index(key)

    def _assign_uvs(self, face, coords):
        for loop, uv in zip(face.loops, coords):
            loop[self.uv_layer].uv = uv

    def _box_verts(self, matrix, sx, sy, sz, key, uv_scale=0.85, tile_uv=True):
        hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
        corners = [
            (-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
            (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz),
        ]
        v = [self.bm.verts.new(matrix @ Vector(c)) for c in corners]
        # (vert indices, face u-extent, face v-extent)
        faces = [
            ((0, 3, 2, 1), sx, sy),  # bottom (-Z)
            ((4, 5, 6, 7), sx, sy),  # top (+Z)
            ((0, 1, 5, 4), sx, sz),  # front (-Y)
            ((1, 2, 6, 5), sy, sz),  # right (+X)
            ((2, 3, 7, 6), sx, sz),  # back (+Y)
            ((3, 0, 4, 7), sy, sz),  # left (-X)
        ]
        idx = self.mi(key)
        for idxs, fw, fh in faces:
            f = self.bm.faces.new([v[i] for i in idxs])
            f.material_index = idx
            u1 = fw * uv_scale if tile_uv else 1.0
            v1 = fh * uv_scale if tile_uv else 1.0
            self._assign_uvs(f, ((0.0, 0.0), (u1, 0.0), (u1, v1), (0.0, v1)))

    def box(self, c3, size3, key, yaw=0.0, pitch=0.0, roll=0.0, uv_scale=0.85, tile_uv=True):
        """Box centered at Three.js c3 with Three.js size (sx, sy, sz) and optional yaw/pitch/roll."""
        sx, sy, sz = size3
        rot = Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(-roll, 4, "Y") @ Matrix.Rotation(pitch, 4, "X")
        m = Matrix.Translation(P(*c3)) @ rot
        self._box_verts(m, sx, sz, sy, key, uv_scale=uv_scale, tile_uv=tile_uv)

    def beam(self, a3, b3, w, key, h=None, uv_scale=0.85, tile_uv=True):
        """Rectangular structural beam spanning Three.js points a3 -> b3."""
        a, b = P(*a3), P(*b3)
        d = b - a
        L = d.length
        if L < 1e-6:
            return
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation((a + b) * 0.5) @ rot
        self._box_verts(m, w, h or w, L, key, uv_scale=uv_scale, tile_uv=tile_uv)

    def ibeam(self, a3, b3, w, depth, key, flange_frac=0.22, web_frac=0.26, uv_scale=0.85):
        """Structural H-beam / I-beam (two flanges + central web) spanning a3 -> b3."""
        a, b = P(*a3), P(*b3)
        d = b - a
        L = d.length
        if L < 1e-6:
            return
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        base = Matrix.Translation((a + b) * 0.5) @ rot
        ft = depth * flange_frac
        wt = w * web_frac
        off = (depth - ft) * 0.5
        self._box_verts(base @ Matrix.Translation((0.0, off, 0.0)), w, ft, L, key, uv_scale=uv_scale)
        self._box_verts(base @ Matrix.Translation((0.0, -off, 0.0)), w, ft, L, key, uv_scale=uv_scale)
        self._box_verts(base, wt, depth - 2 * ft, L, key, uv_scale=uv_scale)

    def cyl(self, a3, b3, r0, key, r1=None, seg=12, caps=True, uv_scale=0.85):
        """Cylinder / frustum between Three.js points a3 -> b3 with clean cylindrical UVs."""
        r1 = r0 if r1 is None else r1
        a, b = P(*a3), P(*b3)
        d = b - a
        L = d.length
        if L < 1e-6:
            return
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation(a) @ rot
        idx = self.mi(key)
        bot = [self.bm.verts.new(m @ Vector((r0 * math.cos(i * TAU / seg), r0 * math.sin(i * TAU / seg), 0.0)))
               for i in range(seg)]
        top = [self.bm.verts.new(m @ Vector((r1 * math.cos(i * TAU / seg), r1 * math.sin(i * TAU / seg), L)))
               for i in range(seg)]
        v_top = max(0.05, L * uv_scale)
        for i in range(seg):
            j = (i + 1) % seg
            f = self.bm.faces.new((bot[i], bot[j], top[j], top[i]))
            f.material_index = idx
            u0, u1 = i / seg, (i + 1) / seg
            self._assign_uvs(f, ((u0, 0.0), (u1, 0.0), (u1, v_top), (u0, v_top)))
        if caps:
            if r0 > 1e-5:
                fb = self.bm.faces.new(list(reversed(bot)))
                fb.material_index = idx
                self._assign_uvs(fb, [(0.5 + 0.5 * math.cos(i * TAU / seg), 0.5 + 0.5 * math.sin(i * TAU / seg)) for i in reversed(range(seg))])
            if r1 > 1e-5:
                ft = self.bm.faces.new(top)
                ft.material_index = idx
                self._assign_uvs(ft, [(0.5 + 0.5 * math.cos(i * TAU / seg), 0.5 + 0.5 * math.sin(i * TAU / seg)) for i in range(seg)])

    def pipe_elbow(self, pts3, r, key, seg=10):
        """Continuous pipe / flexible hose along Three.js polyline pts3 with miter joint spheres."""
        for p, q in zip(pts3, pts3[1:]):
            self.cyl(p, q, r, key, seg=seg, caps=True)
        for pt in pts3[1:-1]:
            self.sphere(pt, r * 1.04, key, seg=max(8, seg), rings=6)

    def sphere(self, c3, r, key, seg=32, rings=16):
        """UV sphere at Three.js c3 with equirectangular UVs."""
        idx = self.mi(key)
        center = P(*c3)
        res = bmesh.ops.create_uvsphere(
            self.bm, u_segments=seg, v_segments=rings, radius=r,
            matrix=Matrix.Translation(center),
        )
        for v in res["verts"]:
            for f in v.link_faces:
                f.material_index = idx
                coords = []
                for loop in f.loops:
                    d = (loop.vert.co - center) / max(1e-6, r)
                    u = math.atan2(d.y, d.x) / TAU + 0.5
                    vv = math.asin(max(-1.0, min(1.0, d.z))) / math.pi + 0.5
                    coords.append((u, vv))
                # Unwrap seam crossing u=0/1 cleanly per face
                us = [c[0] for c in coords]
                if max(us) - min(us) > 0.5:
                    coords = [(u + 1.0 if u < 0.5 else u, vv) for u, vv in coords]
                self._assign_uvs(f, coords)

    def prism_xz(self, poly_xz_bot, y0, y1, key, poly_xz_top=None, uv_scale=0.85, tile_uv=True):
        """Extruded / tapered polygon prism between Three.js y0 and y1 (counter-clockwise XZ)."""
        if poly_xz_top is None:
            poly_xz_top = poly_xz_bot
        n = len(poly_xz_bot)
        idx = self.mi(key)
        vb = [self.bm.verts.new(P(x, y0, z)) for (x, z) in poly_xz_bot]
        vt = [self.bm.verts.new(P(x, y1, z)) for (x, z) in poly_xz_top]
        fb = self.bm.faces.new(list(reversed(vb)))
        fb.material_index = idx
        self._assign_uvs(fb, [(x * uv_scale, z * uv_scale) for (x, z) in reversed(poly_xz_bot)])
        ft = self.bm.faces.new(vt)
        ft.material_index = idx
        self._assign_uvs(ft, [(x * uv_scale, z * uv_scale) for (x, z) in poly_xz_top])
        h = abs(y1 - y0)
        for i in range(n):
            j = (i + 1) % n
            f = self.bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
            f.material_index = idx
            w = math.hypot(poly_xz_bot[j][0] - poly_xz_bot[i][0], poly_xz_bot[j][1] - poly_xz_bot[i][1])
            u1 = w * uv_scale if tile_uv else 1.0
            v1 = h * uv_scale if tile_uv else 1.0
            self._assign_uvs(f, ((0.0, 0.0), (u1, 0.0), (u1, v1), (0.0, v1)))

    def finish(self, smooth_angle=30, origin3=None):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for k in self.mat_names:
            me.materials.append(self.mats[k])
        o = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(o)
        if origin3 is not None:
            off = P(*origin3)
            me.transform(Matrix.Translation(-off))
            o.location = off
        select_only(o)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
        return o


# ==========================================================================
# Shared industrial architectural detail helpers
# ==========================================================================

def add_railing(b, a3, b3, key="rail", height=0.11, post_step=0.35, toe_key=None):
    """2-rail industrial safety handrail with posts and optional bottom kickplate."""
    ax, ay, az = a3
    bx, by, bz = b3
    L = math.hypot(bx - ax, bz - az)
    n = max(2, int(round(L / post_step)))
    for i in range(n + 1):
        t = i / n
        x = ax + (bx - ax) * t
        y = ay + (by - ay) * t
        z = az + (bz - az) * t
        b.beam((x, y, z), (x, y + height, z), 0.011, key)
    b.beam((ax, ay + height, az), (bx, by + height, bz), 0.012, key)
    b.beam((ax, ay + height * 0.52, az), (bx, by + height * 0.52, bz), 0.009, key)
    if toe_key:
        b.beam((ax, ay + 0.014, az), (bx, by + 0.014, bz), 0.008, toe_key, h=0.024)


def add_stair_flight(b, p0, p1, width=0.22, steps=7, stringer_key="ml_dark", tread_key="grating", rail_key="rail"):
    """Open industrial steel staircase with side channels, horizontal grating treads, and twin handrails."""
    x0, y0, z0 = p0
    x1, y1, z1 = p1
    dx, dz = x1 - x0, z1 - z0
    horiz = max(1e-5, math.hypot(dx, dz))
    # Horizontal normal perpendicular to flight run
    nx, nz = -dz / horiz * (width * 0.5), dx / horiz * (width * 0.5)
    for s in (-1, 1):
        sa = (x0 + s * nx, y0 + 0.02, z0 + s * nz)
        sb = (x1 + s * nx, y1 + 0.02, z1 + s * nz)
        b.beam(sa, sb, 0.016, stringer_key, h=0.036)
        add_railing(b, (x0 + s * nx, y0 + 0.03, z0 + s * nz), (x1 + s * nx, y1 + 0.03, z1 + s * nz),
                    key=rail_key, height=0.095, post_step=0.25)
    tread_depth = max(0.035, (horiz / max(1, steps)) * 0.92)
    yaw = math.atan2(-dz, dx)
    for k in range(steps):
        t = (k + 0.5) / steps
        tx = x0 + dx * t
        ty = y0 + (y1 - y0) * t
        tz = z0 + dz * t
        b.box((tx, ty, tz), (tread_depth, 0.012, width - 0.02), tread_key, yaw=yaw)


def add_caged_ladder(b, x, y0, y1, z, out_x, out_z, key_metal="ml_dark", key_cage="rail", hoop_step=0.45):
    """Vertical steel access ladder with side rails, rungs, and safety cage hoops."""
    norm = max(1e-5, math.hypot(out_x, out_z))
    ox, oz = out_x / norm, out_z / norm
    # Tangent perpendicular to outward normal
    tx, tz = -oz, ox
    half_w = 0.055
    for s in (-1, 1):
        b.cyl((x + tx * s * half_w, y0, z + tz * s * half_w),
              (x + tx * s * half_w, y1, z + tz * s * half_w), 0.009, key_metal, seg=6)
    n_rungs = max(2, int((y1 - y0) / 0.075))
    for i in range(1, n_rungs):
        ry = y0 + (y1 - y0) * (i / n_rungs)
        b.cyl((x - tx * half_w, ry, z - tz * half_w),
              (x + tx * half_w, ry, z + tz * half_w), 0.006, key_metal, seg=6)
    # Safety cage starting 2.2 m above base
    cage_start = y0 + 0.25
    if y1 > cage_start + 0.2:
        r_cage = 0.095
        cx, cz = x + ox * (r_cage * 0.72), z + oz * (r_cage * 0.72)
        n_hoops = max(2, int((y1 - cage_start) / hoop_step) + 1)
        segs = 8
        for h_i in range(n_hoops):
            hy = cage_start + (y1 - cage_start) * (h_i / max(1, n_hoops - 1))
            pts = []
            ang_base = math.atan2(oz, ox)
            for si in range(segs + 1):
                a = ang_base + (-0.65 + 1.30 * si / segs) * math.pi
                pts.append((cx + math.cos(a) * r_cage, hy, cz + math.sin(a) * r_cage))
            for p0, p1 in zip(pts, pts[1:]):
                b.cyl(p0, p1, 0.006, key_cage, seg=5)
        for strap_frac in (-0.55, 0.0, 0.55):
            a = math.atan2(oz, ox) + strap_frac * math.pi
            sx, sz = cx + math.cos(a) * r_cage, cz + math.sin(a) * r_cage
            b.cyl((sx, cage_start, sz), (sx, y1, sz), 0.005, key_cage, seg=5)


def add_floodlight_pod(b, pos3, aim3, body_key="ml_dark", lens_key="flood_glow", scale=1.0):
    """Multi-lamp stadium floodlight fixture mounted at pos3 aimed toward aim3."""
    px, py, pz = pos3
    ax, ay, az = aim3
    dx, dy, dz = ax - px, ay - py, az - pz
    yaw = math.atan2(-dz, dx)
    horiz = max(1e-4, math.hypot(dx, dz))
    pitch_down = math.atan2(-dy, horiz)
    # Mounting bracket + yoke
    b.box((px, py - 0.03 * scale, pz), (0.04 * scale, 0.06 * scale, 0.10 * scale), body_key, yaw=yaw)
    # Lamp housing tilted slightly downward along aim vector
    hx = px + dx / horiz * 0.03 * scale
    hz = pz + dz / horiz * 0.03 * scale
    b.box((hx, py, hz), (0.06 * scale, 0.065 * scale, 0.16 * scale), body_key, yaw=yaw, roll=-pitch_down)
    # Glowing lamp face on front of housing
    fx = hx + dx / horiz * 0.033 * scale
    fz = hz + dz / horiz * 0.033 * scale
    b.box((fx, py - math.sin(pitch_down) * 0.025 * scale, fz),
          (0.010 * scale, 0.048 * scale, 0.135 * scale), lens_key, yaw=yaw, roll=-pitch_down)


def add_aviation_beacon(b, pos3, body_key="ml_dark", glow_key="beacon_red", scale=1.0):
    """Red aviation obstruction strobe beacon on stalk."""
    x, y, z = pos3
    b.cyl((x, y, z), (x, y + 0.065 * scale, z), 0.012 * scale, body_key, seg=8)
    b.cyl((x, y + 0.060 * scale, z), (x, y + 0.075 * scale, z), 0.024 * scale, body_key, seg=10)
    b.sphere((x, y + 0.095 * scale, z), 0.022 * scale, glow_key, seg=12, rings=8)


def add_gusset_plate(b, center3, size_xz, thickness, key="lut", yaw=0.0):
    """Bolted steel structural splice/gusset collar plate."""
    b.box(center3, (size_xz, thickness, size_xz), key, yaw=yaw)


def add_crane_lattice(b, p0, p1, width, height, key_chord, key_brace, bays=10):
    """3D box-truss lattice crane boom with 4 main chords, cross frames, and diagonal bracing."""
    a, c_end = Vector(p0), Vector(p1)
    d = c_end - a
    L = d.length
    if L < 1e-5:
        return
    fwd = d.normalized()
    up_ref = Vector((0, 1, 0))
    side = fwd.cross(up_ref)
    if side.length < 1e-4:
        side = Vector((0, 0, 1))
    side.normalize()
    up = side.cross(fwd).normalized()

    hw = width * 0.5
    hh = height * 0.5
    offsets = [
        (-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh),
    ]
    for ox, oy in offsets:
        c0 = a + side * ox + up * oy
        c1 = c_end + side * ox + up * oy
        b.beam(tuple(c0), tuple(c1), 0.032, key_chord)

    for i in range(bays + 1):
        t = i / bays
        base = a + d * t
        pts = [tuple(base + side * ox + up * oy) for ox, oy in offsets]
        for k in range(4):
            b.beam(pts[k], pts[(k + 1) % 4], 0.018, key_chord)
        if i < bays:
            base1 = a + d * ((i + 1) / bays)
            pts1 = [tuple(base1 + side * ox + up * oy) for ox, oy in offsets]
            for k in range(4):
                k2 = (k + 1) % 4
                if (i + k) % 2 == 0:
                    b.beam(pts[k], pts1[k2], 0.015, key_brace)
                else:
                    b.beam(pts[k2], pts1[k], 0.015, key_brace)


# ==========================================================================
# Shared LC-39 Pad Builder (Hardstand, Flame Trench, Deflector, Floodlights)
# ==========================================================================

def _octagon_frustum(name, r_top, r_bot, y_top, y_bot, mat):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    ring = lambda r, y: [bm.verts.new(P(r * math.cos(a), y, r * math.sin(a)))
                         for a in [math.pi / 8 + i * math.pi / 4 for i in range(8)]]
    t_ring, b_ring = ring(r_top, y_top), ring(r_bot, y_bot)
    ft = bm.faces.new(t_ring)
    fb = bm.faces.new(list(reversed(b_ring)))
    for f in (ft, fb):
        for loop in f.loops:
            loop[uv_layer].uv = (loop.vert.co.x * 0.25, loop.vert.co.y * 0.25)
    for i in range(8):
        j = (i + 1) % 8
        f = bm.faces.new((b_ring[i], b_ring[j], t_ring[j], t_ring[i]))
        for loop in f.loops:
            loop[uv_layer].uv = (loop.vert.co.x * 0.25, loop.vert.co.z * 0.25)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def _boolean(target, cutter, op):
    select_only(target)
    mod = target.modifiers.new("b", "BOOLEAN")
    mod.operation = op
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier="b")
    bpy.data.objects.remove(cutter)


def build_lc39_pad(mats):
    """Build detailed LC-39 hardstand mound, crawler ramp, brick flame trench, ribbed deflector & pad lights."""
    pad = _octagon_frustum("PAD", TOP_R, BASE_R, 0.0, BASE_Y - 0.4, mats["concrete"])

    # Crawler ramp on -Z rising cleanly from ground to hardstand
    ramp_len = 16.0
    ramp = Builder("RAMP", mats)
    rm = ramp.bm
    pts = [
        (-2.6, 0.0, -TOP_R + 0.6), (2.6, 0.0, -TOP_R + 0.6),
        (2.6, BASE_Y - 0.4, -TOP_R - ramp_len), (-2.6, BASE_Y - 0.4, -TOP_R - ramp_len),
        (-2.6, BASE_Y - 0.4, -TOP_R + 0.6), (2.6, BASE_Y - 0.4, -TOP_R + 0.6),
    ]
    v = [rm.verts.new(P(*p)) for p in pts]
    idx = ramp.mi("concrete")
    for f in [(0, 1, 2, 3), (4, 5, 1, 0), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2)]:
        face = rm.faces.new([v[i] for i in f])
        face.material_index = idx
        for loop in face.loops:
            loop[ramp.uv_layer].uv = (loop.vert.co.x * 0.25, loop.vert.co.y * 0.25)
    ramp_o = ramp.finish()
    _boolean(pad, ramp_o, "UNION")

    def cutter_box(name, c3, s3):
        b = Builder(name, mats)
        b.box(c3, s3, "concrete")
        return b.finish()

    _boolean(pad, cutter_box("TRENCH", (0, -0.85, 0), (40, 2.0, 1.95)), "DIFFERENCE")
    _boolean(pad, cutter_box("PIT", (0, -0.2, 0), (2.4, 0.6, 2.4)), "DIFFERENCE")

    padx = Builder("PADX", mats)
    dm = padx.bm
    # Refractory firebrick trench floor & retaining side walls
    padx.box((0, -1.83, 0), (2 * BASE_R + 6, 0.07, 1.95), "trench", uv_scale=0.65)
    for s in (-1, 1):
        padx.box((0, -0.85, s * 0.985), (2 * TOP_R + 1.4, 1.95, 0.04), "trench", uv_scale=0.65)
        # Heavy concrete trench rim coping + hazard curb
        padx.box((0, 0.05, s * 1.04), (2 * TOP_R - 0.6, 0.10, 0.14), "concrete")
        padx.box((0, 0.11, s * 1.04), (8.0, 0.03, 0.14), "hazard", uv_scale=1.6)
        # Flared sloped concrete retaining wing walls at east & west flame trench exits (matching berm slope)
        for ex_side in (-1, 1):
            x_in, x_out = ex_side * 8.35, ex_side * 14.80
            z_in, z_out = s * 1.12, s * 1.62
            y_bot = -1.82
            y_in_top, y_out_top = 0.08, -1.68
            hw_w = 0.17
            wing_pts = [
                (x_in, y_bot, z_in - hw_w), (x_out, y_bot, z_out - hw_w),
                (x_out, y_bot, z_out + hw_w), (x_in, y_bot, z_in + hw_w),
                (x_in, y_in_top, z_in - hw_w), (x_out, y_out_top, z_out - hw_w),
                (x_out, y_out_top, z_out + hw_w), (x_in, y_in_top, z_in + hw_w),
            ]
            wv = [dm.verts.new(P(*wp)) for wp in wing_pts]
            w_idx = padx.mi("concrete")
            for f_idxs in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)):
                wf = dm.faces.new([wv[i] for i in f_idxs])
                wf.material_index = w_idx
                for loop in wf.loops:
                    loop[padx.uv_layer].uv = (loop.vert.co.x * 0.35, loop.vert.co.z * 0.35)
            # Sloped steel coping rail along wing top
            padx.beam((x_in, y_in_top + 0.02, z_in), (x_out, y_out_top + 0.02, z_out), 0.38, "ml_dark", h=0.06)

    # Double-wedge inverted-V Steel Flame Deflector + structural stiffener ribs + rail tracks
    idx = padx.mi("deflector")
    apex_y, base_y, half_w, half_l = -0.30, -1.80, 1.42, 0.92
    q = [
        (-half_w, base_y, -half_l), (half_w, base_y, -half_l),
        (half_w, base_y, half_l), (-half_w, base_y, half_l),
        (0, apex_y, -half_l), (0, apex_y, half_l),
    ]
    dv = [dm.verts.new(P(*p)) for p in q]
    for f_idxs in [(0, 4, 5, 3), (1, 2, 5, 4), (0, 1, 4), (3, 5, 2), (0, 3, 2, 1)]:
        face = dm.faces.new([dv[i] for i in f_idxs])
        face.material_index = idx
        for loop in face.loops:
            loop[padx.uv_layer].uv = (loop.vert.co.x * 0.6, loop.vert.co.z * 0.6)

    # Flame deflector steel side ribs, apex cap plate & wheeled rail bogies
    padx.box((0, apex_y - 0.02, 0), (0.14, 0.08, 2 * half_l + 0.04), "ml_dark")
    for rz in (-0.72, -0.24, 0.24, 0.72):
        for sx in (-1, 1):
            padx.beam((0, apex_y - 0.03, rz), (sx * half_w, base_y + 0.04, rz), 0.045, "ml_dark")
    for s in (-1, 1):
        # Steel rail tracks along flame trench floor
        padx.box((0, -1.78, s * 0.86), (2 * BASE_R + 2.0, 0.05, 0.06), "ml_dark")
        # Twin sound-suppression water deluge header pipes + spray nozzles along trench rim
        padx.cyl((-TOP_R + 0.3, 0.10, s * 1.24), (TOP_R - 0.3, 0.10, s * 1.24), 0.065, "pipe", seg=12)
        padx.cyl((-TOP_R + 0.3, 0.20, s * 1.38), (TOP_R - 0.3, 0.20, s * 1.38), 0.042, "pipe_orange", seg=10)
        for nx in (-3.2, -2.0, -0.9, 0.9, 2.0, 3.2):
            padx.box((nx, 0.12, s * 1.24), (0.09, 0.18, 0.18), "ml_dark")

    # Crawler-transporter ramp median curb + dual crushed-rock trackways matching exact ramp slope
    ramp_dz = (TOP_R + ramp_len) - (TOP_R - 0.6)  # 16.6 units horizontally from -8.4 to -25.0
    ramp_mid = -(TOP_R - 0.6) - ramp_dz * 0.5
    ramp_y_mid = (BASE_Y - 0.4) * 0.5
    slope_len = math.hypot(abs(BASE_Y - 0.4), ramp_dz)
    slope_ang = math.atan2(abs(BASE_Y - 0.4), ramp_dz)
    padx.box((0, 0.03, -TOP_R + 0.6), (0.45, 0.06, 0.25), "concrete")
    for sx in (-1.35, 1.35):
        padx.box((sx, ramp_y_mid + 0.02, ramp_mid), (1.35, 0.05, slope_len), "ml_dark", pitch=-slope_ang)
    padx.box((0, ramp_y_mid + 0.04, ramp_mid), (0.36, 0.08, slope_len), "concrete", pitch=-slope_ang)

    # Pad octagonal perimeter concrete blast curb & safety bollards
    for i in range(8):
        a0 = math.pi / 8 + i * math.pi / 4
        a1 = a0 + math.pi / 4
        p0 = (TOP_R * math.cos(a0), 0.07, TOP_R * math.sin(a0))
        p1 = (TOP_R * math.cos(a1), 0.07, TOP_R * math.sin(a1))
        if abs(math.sin((a0 + a1) * 0.5)) < 0.2:
            continue
        padx.beam(p0, p1, 0.16, "concrete")

    # 4 High-mast perimeter stadium floodlight towers (well outside rocket topple & ML clearance)
    for lx, lz in ((-6.2, -5.6), (6.2, -5.6), (-6.2, 5.6), (6.2, 5.6)):
        padx.box((lx, 0.16, lz), (0.44, 0.32, 0.44), "concrete")
        padx.cyl((lx, 0.32, lz), (lx, 2.45, lz), 0.065, "ml", r1=0.042, seg=10)
        # Crossbar + 3 floodlight heads aimed at rocket core
        yaw = math.atan2(lz, -lx)
        padx.box((lx, 2.46, lz), (0.06, 0.06, 0.46), "ml_dark", yaw=yaw)
        for off in (-0.16, 0.0, 0.16):
            ox = lx - math.sin(yaw) * off
            oz = lz - math.cos(yaw) * off
            add_floodlight_pod(padx, (ox, 2.50, oz), (0.0, 2.2, 0.0), scale=1.2)
        add_aviation_beacon(padx, (lx, 2.52, lz), scale=0.9)

    # Blast-hardened pad telemetry / camera shelters on NW & SW corners
    for bx, bz in ((-6.8, -2.9), (-6.8, 2.9)):
        padx.box((bx, 0.26, bz), (0.72, 0.52, 0.54), "cladding")
        padx.box((bx, 0.54, bz), (0.78, 0.06, 0.60), "ml_dark")
        padx.box((bx + 0.37, 0.26, bz), (0.03, 0.30, 0.24), "glass")

    padx_o = padx.finish()
    select_only(pad)
    padx_o.select_set(True)
    bpy.context.view_layer.objects.active = pad
    bpy.ops.object.join()
    pad = bpy.context.view_layer.objects.active
    pad.name = "PAD"
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(20))
    return pad
