"""
Procedural PBR texture synthesizer for aerospace launch vehicle models (Blender).

Generates seamless, high-resolution BaseColor, tangent-space Normal, and ORM
(Occlusion / Roughness / Metallic) maps in pure NumPy + Blender font meshes,
then packs them directly into glTF-ready Principled BSDF materials.
"""
import math
import bpy
import bmesh
import numpy as np


def srgb_to_linear(c):
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def linear_to_srgb_arr(arr):
    a = np.clip(arr, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(np.maximum(a, 0.0031308), 1.0 / 2.4) - 0.055)


def hex_srgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def periodic_noise(h, w, nx, ny, seed=0):
    """Bilinear periodic value noise over (h, w) with nx cycles horizontally and ny vertically."""
    rng = np.random.default_rng(seed)
    grid = rng.random((ny, nx), dtype=np.float32)
    yy = (np.arange(h, dtype=np.float32) + 0.5) * (ny / h)
    xx = (np.arange(w, dtype=np.float32) + 0.5) * (nx / w)
    iy0 = np.floor(yy).astype(np.int32) % ny
    ix0 = np.floor(xx).astype(np.int32) % nx
    iy1 = (iy0 + 1) % ny
    ix1 = (ix0 + 1) % nx
    fy = (yy - np.floor(yy))[:, None]
    fx = (xx - np.floor(xx))[None, :]
    fy = fy * fy * (3.0 - 2.0 * fy)
    fx = fx * fx * (3.0 - 2.0 * fx)
    c00 = grid[iy0[:, None], ix0[None, :]]
    c10 = grid[iy0[:, None], ix1[None, :]]
    c01 = grid[iy1[:, None], ix0[None, :]]
    c11 = grid[iy1[:, None], ix1[None, :]]
    return (c00 * (1.0 - fx) + c10 * fx) * (1.0 - fy) + (c01 * (1.0 - fx) + c11 * fx) * fy


def fbm_periodic(h, w, base_nx, base_ny, octaves=4, seed=1):
    out = np.zeros((h, w), dtype=np.float32)
    amp = 0.5
    norm = 0.0
    for o in range(octaves):
        mul = 2 ** o
        out += amp * periodic_noise(h, w, max(2, base_nx * mul), max(2, base_ny * mul), seed=seed + o * 17)
        norm += amp
        amp *= 0.5
    return out / norm


def rasterize_font_mask(body, font_path, w_px, h_px, rotate_ccw_deg=0.0, letter_spacing=1.0):
    """
    Convert a string into a crisp anti-aliased float32 [0..1] alpha mask of shape (h_px, w_px)
    using Blender's TrueType curve->mesh converter and NumPy triangle coverage.
    """
    cu = bpy.data.curves.new("_txt_tmp", "FONT")
    cu.body = body
    cu.size = 1.0
    cu.space_character = letter_spacing
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    try:
        cu.font = bpy.data.fonts.load(font_path, check_existing=True)
    except Exception:
        pass
    obj = bpy.data.objects.new("_txt_tmp", cu)
    bpy.context.scene.collection.objects.link(obj)
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)

    # Collect 2D triangles rotated if requested
    rad = math.radians(rotate_ccw_deg)
    ca, sa = math.cos(rad), math.sin(rad)
    verts_2d = np.array(
        [[v.co.x * ca - v.co.y * sa, v.co.x * sa + v.co.y * ca] for v in bm.verts],
        dtype=np.float32,
    )
    tris = np.array([[loop.vert.index for loop in f.loops] for f in bm.faces], dtype=np.int32)
    bm.free()
    bpy.data.objects.remove(obj, do_unlink=True)
    if len(tris) == 0:
        return np.zeros((h_px, w_px), dtype=np.float32)

    xmin, ymin = verts_2d.min(axis=0)
    xmax, ymax = verts_2d.max(axis=0)
    bw = max(1e-5, xmax - xmin)
    bh = max(1e-5, ymax - ymin)

    # Fit inside (w_px, h_px) with 8% margin preserving aspect ratio
    pad = 0.08
    scale = min((w_px * (1.0 - 2 * pad)) / bw, (h_px * (1.0 - 2 * pad)) / bh)
    cx = (xmin + xmax) * 0.5
    cy = (ymin + ymax) * 0.5

    pts = np.empty_like(verts_2d)
    pts[:, 0] = (verts_2d[:, 0] - cx) * scale + w_px * 0.5
    pts[:, 1] = (verts_2d[:, 1] - cy) * scale + h_px * 0.5

    # 3x3 supersampled rasterization
    ss = 3
    sw, sh = w_px * ss, h_px * ss
    pts_ss = pts * ss
    canvas = np.zeros((sh, sw), dtype=np.float32)

    for a_i, b_i, c_i in tris:
        ax, ay = pts_ss[a_i]
        bx, by = pts_ss[b_i]
        cx_, cy_ = pts_ss[c_i]
        x0 = max(0, int(math.floor(min(ax, bx, cx_))))
        x1 = min(sw - 1, int(math.ceil(max(ax, bx, cx_))))
        y0 = max(0, int(math.floor(min(ay, by, cy_))))
        y1 = min(sh - 1, int(math.ceil(max(ay, by, cy_))))
        if x1 < x0 or y1 < y0:
            continue
        gx = np.arange(x0, x1 + 1, dtype=np.float32)[None, :] + 0.5
        gy = np.arange(y0, y1 + 1, dtype=np.float32)[:, None] + 0.5
        e0 = (bx - ax) * (gy - ay) - (by - ay) * (gx - ax)
        e1 = (cx_ - bx) * (gy - by) - (cy_ - by) * (gx - bx)
        e2 = (ax - cx_) * (gy - cy_) - (ay - cy_) * (gx - cx_)
        area = (bx - ax) * (cy_ - ay) - (by - ay) * (cx_ - ax)
        if area >= 0:
            inside = (e0 >= 0) & (e1 >= 0) & (e2 >= 0)
        else:
            inside = (e0 <= 0) & (e1 <= 0) & (e2 <= 0)
        canvas[y0:y1 + 1, x0:x1 + 1] = np.maximum(canvas[y0:y1 + 1, x0:x1 + 1], inside)

    return canvas.reshape(h_px, ss, w_px, ss).mean(axis=(1, 3))


class PBRCanvas:
    """
    2D cylindrical/planar texture canvas storing linear BaseColor, Height, Roughness, Metallic.
    Rows run bottom-to-top (row 0 = v=0, row H-1 = v=1) to match Blender image buffer & OpenGL normals.
    """

    def __init__(self, width, height, base_hex="#f1f0ea", rough=0.45, metal=0.0):
        self.w = width
        self.h = height
        bc = srgb_to_linear(hex_srgb(base_hex))
        self.color = np.empty((height, width, 3), dtype=np.float32)
        self.color[..., 0] = bc[0]
        self.color[..., 1] = bc[1]
        self.color[..., 2] = bc[2]
        self.height = np.zeros((height, width), dtype=np.float32)
        self.rough = np.full((height, width), rough, dtype=np.float32)
        self.metal = np.full((height, width), metal, dtype=np.float32)

    def _vy(self, v0, v1):
        y0 = max(0, min(self.h, int(round(v0 * self.h))))
        y1 = max(0, min(self.h, int(round(v1 * self.h))))
        return min(y0, y1), max(y0, y1)

    def _ux(self, u0, u1):
        x0 = int(round(u0 * self.w))
        x1 = int(round(u1 * self.w))
        return min(x0, x1), max(x0, x1)

    def paint_band(self, v0, v1, hex_col=None, rough=None, metal=None, height_delta=0.0):
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        if hex_col is not None:
            self.color[y0:y1, :] = srgb_to_linear(hex_srgb(hex_col))
        if rough is not None:
            self.rough[y0:y1, :] = rough
        if metal is not None:
            self.metal[y0:y1, :] = metal
        if height_delta != 0.0:
            self.height[y0:y1, :] += height_delta

    def paint_rect_uv(self, u0, v0, u1, v1, hex_col=None, rough=None, metal=None, height_delta=0.0, aa=True):
        """Fill UV rectangle with wrap-around in u."""
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        x0, x1 = self._ux(u0, u1)
        if x1 <= x0:
            return
        xs = np.arange(x0, x1) % self.w
        if hex_col is not None:
            self.color[y0:y1, xs] = srgb_to_linear(hex_srgb(hex_col))
        if rough is not None:
            self.rough[y0:y1, xs] = rough
        if metal is not None:
            self.metal[y0:y1, xs] = metal
        if height_delta != 0.0:
            self.height[y0:y1, xs] += height_delta

    def add_panel_grid(self, v0, v1, n_cols, n_rows, color_var=0.022, seam_px=2, seam_depth=-0.35, seam_dark=0.80,
                       rivets=True, seed=42):
        """Subdivide cylindrical band into realistic aerospace welded/fastened sheet panels."""
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        rng = np.random.default_rng(seed)
        bh = y1 - y0
        yy = np.arange(bh)[:, None]
        xx = np.arange(self.w)[None, :]

        row_id = np.floor(yy * n_rows / max(1, bh)).astype(np.int32)
        col_id = np.floor(xx * n_cols / self.w).astype(np.int32)
        panel_jitter = rng.uniform(-color_var, color_var, size=(n_rows + 1, n_cols + 1)).astype(np.float32)
        var = panel_jitter[np.minimum(row_id, n_rows), np.minimum(col_id, n_cols)]

        self.color[y0:y1] = np.clip(self.color[y0:y1] * (1.0 + var[..., None]), 0.0, 1.0)
        self.rough[y0:y1] = np.clip(self.rough[y0:y1] + var * 0.8, 0.08, 0.96)

        # Horizontal and vertical panel seams
        row_pos = (yy * n_rows / max(1, bh)) % 1.0
        col_pos = (xx * n_cols / self.w) % 1.0
        h_seam = (row_pos < (seam_px * n_rows / max(1, bh))) | (row_pos > 1.0 - (seam_px * n_rows / max(1, bh)))
        v_seam = (col_pos < (seam_px * n_cols / self.w)) | (col_pos > 1.0 - (seam_px * n_cols / self.w))
        seam = h_seam | v_seam
        self.height[y0:y1][seam] += seam_depth
        self.color[y0:y1][seam] *= seam_dark
        self.rough[y0:y1][seam] = np.minimum(0.95, self.rough[y0:y1][seam] + 0.18)

        if rivets and bh >= 16:
            # Tiny subtle rivet dots adjacent to seams
            rv_y = np.abs(row_pos - (seam_px * 2.2 * n_rows / max(1, bh))) < (1.1 * n_rows / max(1, bh))
            rv_x = (np.arange(self.w)[None, :] % max(6, self.w // (n_cols * 10))) < 2
            rv = rv_y & rv_x & (~v_seam)
            self.height[y0:y1][rv] += 0.14
            self.color[y0:y1][rv] *= 0.94

    def add_corrugation(self, v0, v1, n_ribs, amp=0.55, ao_dark=0.14):
        """Add realistic corrugated stringer normal & subtle valley AO shading."""
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        u = (np.arange(self.w, dtype=np.float32) + 0.5) / self.w
        wave = 0.5 + 0.5 * np.cos(u * math.tau * n_ribs)
        # Sharper aerospace hat-section stringer profile
        rib = np.power(wave, 1.5)
        self.height[y0:y1, :] += (rib * amp)[None, :]
        shade = 1.0 - ao_dark * (1.0 - rib)
        self.color[y0:y1, :] *= shade[None, :, None]

    def add_sofi_foam(self, v0, v1, seed=7):
        """NASA SLS burnt-orange Spray-On Foam Insulation (SOFI) texture."""
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        bh = y1 - y0
        fine = fbm_periodic(bh, self.w, 48, max(8, bh // 12), octaves=4, seed=seed)
        coarse = fbm_periodic(bh, self.w, 10, max(4, bh // 64), octaves=3, seed=seed + 99)
        # Subtle circumferential spray-pass rings
        yy = np.linspace(0, 1, bh, dtype=np.float32)[:, None]
        passes = 0.5 + 0.5 * np.sin(yy * bh * 0.22 + coarse * 3.0)
        tone = 0.88 + 0.16 * coarse + 0.08 * (fine - 0.5) + 0.04 * (passes - 0.5)
        self.color[y0:y1] = np.clip(self.color[y0:y1] * tone[..., None], 0.0, 1.0)
        self.height[y0:y1] += (fine - 0.5) * 0.35 + (coarse - 0.5) * 0.20
        self.rough[y0:y1] = np.clip(0.84 + (fine - 0.5) * 0.12, 0.65, 0.96)

    def add_micro_wear(self, v0=0.0, v1=1.0, strength=0.025, bump=0.08, seed=11):
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        bh = y1 - y0
        n = fbm_periodic(bh, self.w, 32, max(4, bh // 16), octaves=3, seed=seed)
        self.color[y0:y1] = np.clip(self.color[y0:y1] * (1.0 + (n - 0.5)[..., None] * strength), 0.0, 1.0)
        self.height[y0:y1] += (n - 0.5) * bump
        self.rough[y0:y1] = np.clip(self.rough[y0:y1] + (n - 0.5) * 0.08, 0.08, 0.96)

    def draw_checker_band(self, v0, v1, n_cols, n_rows=2, col_a="#15171b", col_b="#f2f1ec"):
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        bh = y1 - y0
        r = (np.arange(bh)[:, None] * n_rows // max(1, bh)) % 2
        c = (np.arange(self.w)[None, :] * n_cols // self.w) % 2
        m = (r ^ c) == 0
        ca = np.array(srgb_to_linear(hex_srgb(col_a)), dtype=np.float32)
        cb = np.array(srgb_to_linear(hex_srgb(col_b)), dtype=np.float32)
        self.color[y0:y1] = np.where(m[..., None], ca, cb)
        self.rough[y0:y1] = np.where(m, 0.62, 0.42)

    def add_quilted_blanket(self, v0, v1, n_cols, n_rows, seed=31):
        """Quilted thermal blanket / Kapton crinkle texture for engine boots & spacecraft foils."""
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        bh = y1 - y0
        yy = np.linspace(0, n_rows, bh, dtype=np.float32)[:, None]
        xx = np.linspace(0, n_cols, self.w, dtype=np.float32)[None, :]
        puff = np.sin(yy * math.pi) * np.sin(xx * math.pi)
        puff = np.abs(puff)
        crinkle = fbm_periodic(bh, self.w, 40, max(6, bh // 12), octaves=3, seed=seed)
        self.height[y0:y1] += puff * 0.38 + (crinkle - 0.5) * 0.25
        self.color[y0:y1] = np.clip(self.color[y0:y1] * (0.90 + 0.14 * puff[..., None] + 0.06 * (crinkle[..., None] - 0.5)), 0.0, 1.0)

    def paint_quadrants(self, v0, v1, n_quads=4, u_offset=0.125, phase=0,
                        col_a="#15171b", col_b="#f2f1ec", rough_a=0.58, rough_b=0.44):
        """Paint crisp vertical roll-pattern quadrants with anti-aliased boundaries."""
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        u = ((np.arange(self.w, dtype=np.float32) + 0.5) / self.w + u_offset) % 1.0
        q_pos = u * n_quads
        q = np.floor(q_pos).astype(np.int32)
        frac = q_pos - q
        aa = 1.5 * n_quads / self.w
        # Smooth transition across quadrant boundaries
        is_a = ((q + phase) % 2) == 0
        dist_edge = np.minimum(frac, 1.0 - frac)
        edge_blend = np.clip(dist_edge / aa, 0.5, 1.0)
        m = np.where(is_a, edge_blend, 1.0 - edge_blend)
        ca = np.array(srgb_to_linear(hex_srgb(col_a)), dtype=np.float32)
        cb = np.array(srgb_to_linear(hex_srgb(col_b)), dtype=np.float32)
        self.color[y0:y1] = m[None, :, None] * ca + (1.0 - m[None, :, None]) * cb
        self.rough[y0:y1] = (m * rough_a + (1.0 - m) * rough_b)[None, :]
        self.metal[y0:y1] = 0.0

    def draw_crosshair_target(self, u_center, v_center, u_rad, v_rad):
        """NASA black-and-white circular photogrammetry roll-tracking target."""
        rw = max(12, int(round(u_rad * self.w)))
        rh = max(12, int(round(v_rad * self.h)))
        y0 = max(0, int(round(v_center * self.h - rh)))
        y1 = min(self.h, int(round(v_center * self.h + rh)))
        x0 = int(round(u_center * self.w - rw))
        pw = 2 * rw
        ph = y1 - y0
        if pw <= 4 or ph <= 4:
            return
        yy = np.linspace(-1.0, 1.0, ph, dtype=np.float32)[:, None]
        xx = np.linspace(-1.0, 1.0, pw, dtype=np.float32)[None, :]
        r = np.hypot(xx, yy)
        aa = 2.0 / max(10, min(pw, ph))
        circ = np.clip((0.92 - r) / aa, 0.0, 1.0)
        q = (xx * yy) >= 0.0
        ca = np.array(srgb_to_linear(hex_srgb("#14161a")), dtype=np.float32)
        cb = np.array(srgb_to_linear(hex_srgb("#f4f4f0")), dtype=np.float32)
        pat = np.where(q[..., None], ca, cb)
        xs = (np.arange(pw) + x0) % self.w
        self.color[y0:y1, xs] = self.color[y0:y1, xs] * (1.0 - circ[..., None]) + pat * circ[..., None]
        self.rough[y0:y1, xs] = self.rough[y0:y1, xs] * (1.0 - circ) + 0.35 * circ

    def add_soot_gradient(self, v0, v1, strength=0.35, dark_at_bottom=True):
        """Subtle thermal scorch / exhaust grime gradient near skirts or separation rings."""
        y0, y1 = self._vy(v0, v1)
        if y1 <= y0:
            return
        bh = y1 - y0
        t = np.linspace(1.0 if dark_at_bottom else 0.0, 0.0 if dark_at_bottom else 1.0, bh, dtype=np.float32)[:, None]
        t = t * t
        n = fbm_periodic(bh, self.w, 18, max(3, bh // 12), octaves=3, seed=77)
        scorch = 1.0 - strength * t * (0.65 + 0.7 * n)
        self.color[y0:y1] *= np.clip(scorch, 0.25, 1.0)[..., None]
        self.rough[y0:y1] = np.clip(self.rough[y0:y1] + strength * t * 0.35, 0.08, 0.96)

    def draw_vertical_letters(self, body, u_center, v_top, u_width, letter_h, gap_v, hex_col="#14161a",
                              font_path="/System/Library/Fonts/Supplemental/Arial Black.ttf"):
        """Stack letters vertically top-to-bottom along a cylindrical panel."""
        v = v_top - letter_h * 0.5
        for ch in body:
            if ch == " ":
                v -= letter_h * 0.65
                continue
            self.draw_text(ch, u_center, v, u_width, letter_h, hex_col=hex_col, font_path=font_path)
            v -= letter_h + gap_v

    def draw_text(self, body, u_center, v_center, u_width, v_height, hex_col="#14161a",
                  font_path="/System/Library/Fonts/Supplemental/Arial Black.ttf",
                  rotate_ccw_deg=0.0, letter_spacing=1.0, rough=0.38):
        pw = max(24, int(round(u_width * self.w)))
        ph = max(24, int(round(v_height * self.h)))
        mask = rasterize_font_mask(body, font_path, pw, ph, rotate_ccw_deg, letter_spacing)
        y0 = max(0, int(round(v_center * self.h - ph / 2)))
        y1 = min(self.h, y0 + ph)
        mask = mask[:y1 - y0, :]
        x0 = int(round(u_center * self.w - pw / 2))
        xs = (np.arange(pw) + x0) % self.w
        col = np.array(srgb_to_linear(hex_srgb(hex_col)), dtype=np.float32)
        self.color[y0:y1, xs] = self.color[y0:y1, xs] * (1.0 - mask[..., None]) + col * mask[..., None]
        self.rough[y0:y1, xs] = self.rough[y0:y1, xs] * (1.0 - mask) + rough * mask

    def build_material(self, name, normal_strength=2.2):
        """Bake BaseColor, OpenGL Tangent Normal, and glTF ORM images into a Principled BSDF material."""
        # Tangent normal via central finite differences
        dh_du = (np.roll(self.height, -1, axis=1) - np.roll(self.height, 1, axis=1)) * (0.5 * normal_strength)
        dh_dv = (np.roll(self.height, -1, axis=0) - np.roll(self.height, 1, axis=0)) * (0.5 * normal_strength)
        dh_dv[0, :] = 0.0
        dh_dv[-1, :] = 0.0
        nx = -dh_du
        ny = -dh_dv
        nz = np.ones_like(nx)
        inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
        nrm = np.stack([nx * inv_len * 0.5 + 0.5, ny * inv_len * 0.5 + 0.5, nz * inv_len * 0.5 + 0.5], axis=-1)

        orm = np.stack([np.ones_like(self.rough), np.clip(self.rough, 0.04, 1.0), np.clip(self.metal, 0.0, 1.0)], axis=-1)

        def to_img(img_name, arr, is_srgb):
            h, w, _ = arr.shape
            img = bpy.data.images.new(img_name, width=w, height=h, alpha=False, float_buffer=False)
            img.colorspace_settings.name = "sRGB" if is_srgb else "Non-Color"
            rgba = np.ones((h, w, 4), dtype=np.float32)
            rgba[..., :3] = np.clip(linear_to_srgb_arr(arr) if is_srgb else arr, 0.0, 1.0)
            img.pixels.foreach_set(rgba.ravel())
            img.pack()
            return img

        img_col = to_img(f"{name}_Color", self.color, True)
        img_nrm = to_img(f"{name}_Normal", nrm, False)
        img_orm = to_img(f"{name}_ORM", orm, False)

        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")

        tc = nt.nodes.new("ShaderNodeTexImage")
        tc.image = img_col
        nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])

        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img_nrm
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

        to = nt.nodes.new("ShaderNodeTexImage")
        to.image = img_orm
        sc = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(to.outputs["Color"], sc.inputs["Color"])
        nt.links.new(sc.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sc.outputs["Blue"], bsdf.inputs["Metallic"])

        return mat
