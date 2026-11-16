/**
 * Home 360° Panorama "Cel-Shading / Toon" rendering toolset
 * - toonifyObject: Replace GLB model materials with stepped MeshToonMaterial + sharp rim light
 * - ToonInkPass: Screen-space ink contour post-processing based on depth + normals
 * - createSparkleTexture: Anime-style 4-point star sparkle texture
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CanvasTexture,
  Color,
  DataTexture,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Material,
  Mesh,
  MeshNormalMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderTarget
} from 'three';
import { configureMipmappedTexture } from '../scene/textureQuality';

/** Layer containing meshes participating in ink outline (outline normal pass renders this layer only) */
export const INK_LAYER = 3;

let sharedDefaultToonGradient: DataTexture | null = null;

/** 3-step color gradient: shadows / midtones / highlights (smooth filtering transition to prevent moiré) */
export function createToonGradient(steps?: number[]): DataTexture {
  if (!steps) {
    if (sharedDefaultToonGradient) return sharedDefaultToonGradient;
    const tex = createToonGradient([92, 182, 255]);
    sharedDefaultToonGradient = tex;
    return tex;
  }
  const data = new Uint8Array(steps);
  const tex = new DataTexture(data, steps.length, 1, RedFormat);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export interface ToonifyOptions {
  gradientMap: DataTexture;
  /** Sharp rim lighting color */
  rimColor?: string;
  rimStrength?: number;
  /** Color saturation boost (1 = original color) */
  saturation?: number;
  /** Overall brightness multiplier (for dark realistic textures) */
  brightness?: number;
  /** Override per material name (e.g. changing smoke to milky-white cel cloud) */
  overrides?: Record<string, (mat: MeshToonMaterial) => void>;
}

function toToonMaterial(src: Material, opts: ToonifyOptions): MeshToonMaterial {
  const s = src as MeshStandardMaterial;
  const color = s.color ? s.color.clone() : new Color('#ffffff');
  if (opts.saturation && opts.saturation !== 1) {
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, Math.min(1, hsl.s * opts.saturation), hsl.l);
  }
  if (opts.brightness && opts.brightness !== 1) color.multiplyScalar(opts.brightness);

  // Enable anisotropic filtering and trilinear mipmaps for spacecraft textures to eliminate moiré at oblique angles
  configureMipmappedTexture(s.map, 'high');
  configureMipmappedTexture(s.emissiveMap, 'high');
  configureMipmappedTexture(s.alphaMap, 'high');

  const toon = new MeshToonMaterial({
    name: `${src.name || 'mat'}-toon`,
    color,
    map: s.map ?? null,
    alphaMap: s.alphaMap ?? null,
    emissive: s.emissive ? s.emissive.clone() : new Color('#000000'),
    emissiveMap: s.emissiveMap ?? null,
    emissiveIntensity: s.emissiveIntensity ?? 1,
    gradientMap: opts.gradientMap,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
    side: src.side,
    depthWrite: src.depthWrite,
    vertexColors: src.vertexColors
  });

  const rimColor = new Color(opts.rimColor ?? '#dff4ff');
  const rimStrength = opts.rimStrength ?? 0.4;
  toon.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimStrength = { value: rimStrength };
    shader.fragmentShader =
      'uniform vec3 uRimColor;\nuniform float uRimStrength;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        // Cel smooth rim light: gentle grazing transition to eliminate moiré and high-frequency flicker
        float toonRimDot = 1.0 - saturate(dot(normalize(vViewPosition), normal));
        float toonRim = smoothstep(0.55, 0.85, toonRimDot);
        outgoingLight += uRimColor * toonRim * uRimStrength;
        #include <opaque_fragment>`
      );
  };
  toon.customProgramCacheKey = () => 'home-toon-rim';
  opts.overrides?.[src.name]?.(toon);
  return toon;
}

/**
 * Replace cloned model materials with toon materials (does not affect cached materials shared by other scenes),
 * and add meshes to the ink outline layer.
 */
export function toonifyObject(root: Object3D, opts: ToonifyOptions) {
  const cache = new Map<Material, MeshToonMaterial>();
  const convert = (m: Material) => {
    let t = cache.get(m);
    if (!t) {
      t = toToonMaterial(m, opts);
      cache.set(m, t);
    }
    return t;
  };
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.material = Array.isArray(obj.material) ? obj.material.map(convert) : convert(obj.material);
    obj.layers.enable(INK_LAYER);
  });
  return root;
}

/** Anime-style 4-point star sparkle texture (for starfield Points) */
export function createSparkleTexture(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  // Soft glow
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(0.18, 'rgba(255,255,255,0.45)');
  glow.addColorStop(0.45, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  // 4-point star core (hard edge)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  const arm = c * 0.98;
  const waist = c * 0.12;
  ctx.moveTo(c, c - arm);
  ctx.quadraticCurveTo(c + waist, c - waist, c + arm, c);
  ctx.quadraticCurveTo(c + waist, c + waist, c, c + arm);
  ctx.quadraticCurveTo(c - waist, c + waist, c - arm, c);
  ctx.quadraticCurveTo(c - waist, c - waist, c, c - arm);
  ctx.fill();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const INK_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const INK_FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uThickness;
uniform vec3 uInkColor;
uniform float uInkOpacity;
varying vec2 vUv;

float viewDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, uNear, uFar);
}

vec3 viewNormal(vec2 uv) {
  return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
}

void main() {
  vec4 base = texture2D(tColor, vUv);
  vec2 o = uTexel * uThickness;

  float dc = viewDepth(vUv);
  vec3 nc = viewNormal(vUv);
  float covC = texture2D(tNormal, vUv).a;

  vec2 offs[8];
  offs[0] = vec2( o.x, 0.0); offs[1] = vec2(-o.x, 0.0);
  offs[2] = vec2(0.0,  o.y); offs[3] = vec2(0.0, -o.y);
  offs[4] = vec2( o.x,  o.y); offs[5] = vec2(-o.x,  o.y);
  offs[6] = vec2( o.x, -o.y); offs[7] = vec2(-o.x, -o.y);

  float depthEdge = 0.0;
  float covEdge = 0.0;
  float pairCov[4];
  float pairDepth[4];
  vec2 covGradVec = vec2(0.0);
  vec2 depthGradVec = vec2(0.0);
  vec2 dirs[4];
  dirs[0] = vec2(1.0, 0.0);
  dirs[1] = vec2(0.0, 1.0);
  dirs[2] = vec2(0.7071, 0.7071);
  dirs[3] = vec2(0.7071, -0.7071);
  for (int i = 0; i < 4; i++) {
    vec2 uvA = vUv + offs[i * 2];
    vec2 uvB = vUv + offs[i * 2 + 1];
    float da = viewDepth(uvA);
    float db = viewDepth(uvB);
    float ra = abs(da - dc) / max(min(da, dc), 0.001);
    float rb = abs(db - dc) / max(min(db, dc), 0.001);
    float ca = texture2D(tNormal, uvA).a;
    float cb = texture2D(tNormal, uvB).a;
    depthEdge = max(depthEdge, max(ra, rb));
    covEdge = max(covEdge, max(abs(ca - covC), abs(cb - covC)));
    covGradVec += dirs[i] * (ca - cb);
    depthGradVec += dirs[i] * (ra - rb);
    // Detect sub-2px thin bars or lattice pockets where BOTH opposing sides jump
    pairCov[i] = min(abs(ca - covC), abs(cb - covC));
    pairDepth[i] = min(ra, rb);
  }

  float thinPocket = max(
    max(pairCov[0], pairCov[1]),
    max(pairCov[2], pairCov[3])
  );
  float thinDepthPocket = max(
    max(pairDepth[0], pairDepth[1]),
    max(pairDepth[2], pairDepth[3])
  );
  float coherence = smoothstep(0.40, 1.25, max(length(covGradVec), length(depthGradVec)));
  float damp = coherence
             * (1.0 - 0.90 * smoothstep(0.20, 0.70, thinPocket))
             * (1.0 - 0.85 * smoothstep(0.20, 0.55, thinDepthPocket));

  // Ink outline only at coherent silhouettes & occlusion boundaries, suppressing thin lattice Moiré
  float edge = smoothstep(0.40, 0.88, covEdge);
  edge = max(edge, smoothstep(0.42, 0.78, depthEdge));
  edge *= damp;

  vec3 col = mix(base.rgb, uInkColor, edge * uInkOpacity);
  gl_FragColor = vec4(col, max(base.a, edge * uInkOpacity));
  #include <colorspace_fragment>
}
`;

export interface ToonInkPassProps {
  inkColor?: string;
  thickness?: number;
  opacity?: number;
  samples?: number;
}

/**
 * Screen-space comic ink outline post-pass:
 * 1. Render color scene into MSAA render target
 * 2. Render view-space normals + depth for ink layer only
 * 3. Composite: Sobel comparison of depth/normal discontinuities -> overlay ink lines
 */
export function ToonInkPass({
  inkColor = '#0a0f24',
  thickness = 1.25,
  opacity = 0.92,
  samples = 4
}: ToonInkPassProps) {
  const { gl, scene, camera, size } = useThree();

  const res = useMemo(() => {
    const colorTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples });
    const normalTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
    normalTarget.depthTexture = new DepthTexture(1, 1);
    const normalMaterial = new MeshNormalMaterial();
    const inkMaterial = new ShaderMaterial({
      uniforms: {
        tColor: { value: colorTarget.texture },
        tNormal: { value: normalTarget.texture },
        tDepth: { value: normalTarget.depthTexture },
        uTexel: { value: new Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uThickness: { value: thickness },
        uInkColor: { value: new Color(inkColor) },
        uInkOpacity: { value: opacity }
      },
      vertexShader: INK_VERTEX,
      fragmentShader: INK_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      transparent: true
    });
    const quadScene = new Scene();
    const quad = new Mesh(new PlaneGeometry(2, 2), inkMaterial);
    quad.frustumCulled = false;
    quadScene.add(quad);
    const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { colorTarget, normalTarget, normalMaterial, inkMaterial, quadScene, quadCamera, quad };
  }, [samples]);

  useEffect(() => {
    res.inkMaterial.uniforms.uInkColor.value.set(inkColor);
    res.inkMaterial.uniforms.uThickness.value = thickness;
    res.inkMaterial.uniforms.uInkOpacity.value = opacity;
  }, [inkColor, thickness, opacity, res]);

  useEffect(() => {
    return () => {
      res.colorTarget.dispose();
      res.normalTarget.depthTexture?.dispose();
      res.normalTarget.dispose();
      res.normalMaterial.dispose();
      res.inkMaterial.dispose();
      res.quad.geometry.dispose();
    };
  }, [res]);

  const clearColor = useMemo(() => new Color(), []);

  useFrame(() => {
    const dpr = gl.getPixelRatio();
    const w = Math.max(1, Math.floor(size.width * dpr));
    const h = Math.max(1, Math.floor(size.height * dpr));
    if (res.colorTarget.width !== w || res.colorTarget.height !== h) {
      res.colorTarget.setSize(w, h);
      res.normalTarget.setSize(w, h);
      res.inkMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
    }
    const cam = camera as typeof camera & { near: number; far: number };
    res.inkMaterial.uniforms.uNear.value = cam.near;
    res.inkMaterial.uniforms.uFar.value = cam.far;

    // 1) Color pass
    gl.setRenderTarget(res.colorTarget);
    gl.clear();
    gl.render(scene, camera);

    // 2) Normal + depth pass (outline layer only)
    const prevMask = camera.layers.mask;
    const prevOverride = scene.overrideMaterial;
    const prevAlpha = gl.getClearAlpha();
    gl.getClearColor(clearColor);
    camera.layers.set(INK_LAYER);
    scene.overrideMaterial = res.normalMaterial;
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(res.normalTarget);
    gl.clear();
    gl.render(scene, camera);
    scene.overrideMaterial = prevOverride;
    camera.layers.mask = prevMask;
    gl.setClearColor(clearColor, prevAlpha);

    // 3) Composite ink lines to screen
    gl.setRenderTarget(null);
    gl.clear();
    gl.render(res.quadScene, res.quadCamera);
  }, 1);

  return null;
}
