import {
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';

export type RenderQuality = 'high' | 'low';

export interface MaterialAntiMoireOptions {
  maxNormalScale?: number;
  minRoughness?: number;
  maxMetalness?: number;
}

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'clearcoatMap',
  'clearcoatRoughnessMap',
  'clearcoatNormalMap',
  'specularIntensityMap',
  'specularColorMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'transmissionMap',
  'thicknessMap',
  'anisotropyMap',
] as const;

const DEFAULT_ON_BEFORE_COMPILE = MeshStandardMaterial.prototype.onBeforeCompile;

export function targetAnisotropyForQuality(quality: RenderQuality = 'high'): number {
  return quality === 'low' ? 4 : 16;
}

function isNonMipmappableTexture(tex: Texture): boolean {
  const typed = tex as Texture & {
    isDataTexture?: boolean;
    isData3DTexture?: boolean;
    isDataArrayTexture?: boolean;
    isCompressedTexture?: boolean;
    isDepthTexture?: boolean;
    isRenderTargetTexture?: boolean;
  };
  return Boolean(
    typed.isDataTexture ||
    typed.isData3DTexture ||
    typed.isDataArrayTexture ||
    typed.isCompressedTexture ||
    typed.isDepthTexture ||
    typed.isRenderTargetTexture ||
    tex.userData?.preserveFiltering
  );
}

/**
 * Configure trilinear mipmapping and anisotropic filtering on a 2D texture so
 * repeating fine details (solar arrays, hull corrugations, panel seams, ground)
 * filter smoothly at grazing angles and long distances instead of producing Moiré.
 */
export function configureMipmappedTexture(
  tex: Texture | null | undefined,
  quality: RenderQuality = 'high',
): void {
  if (!tex || isNonMipmappableTexture(tex)) return;
  const aniso = targetAnisotropyForQuality(quality);
  let changed = false;

  if (!tex.generateMipmaps) {
    tex.generateMipmaps = true;
    changed = true;
  }
  if (tex.minFilter !== LinearMipmapLinearFilter) {
    tex.minFilter = LinearMipmapLinearFilter;
    changed = true;
  }
  if (tex.magFilter !== LinearFilter) {
    tex.magFilter = LinearFilter;
    changed = true;
  }
  if (tex.anisotropy < aniso) {
    tex.anisotropy = aniso;
    changed = true;
  }
  if (changed) {
    tex.needsUpdate = true;
  }
}

/**
 * Inject GPU screen-space normal variance + Toksvig roughness broadening into
 * Standard/Physical materials with normal maps so sub-pixel ribs and foil bumps
 * widen their specular lobe cleanly instead of aliasing into wavy Moiré bands.
 */
export function applySpecularAntiAliasing(mat: Material | null | undefined): void {
  if (!mat) return;
  const std = mat as MeshStandardMaterial;
  if (!std.isMeshStandardMaterial || !std.normalMap) return;
  if (std.userData.__antiMoireSpecAA) return;
  if (std.onBeforeCompile !== DEFAULT_ON_BEFORE_COMPILE) return;

  std.userData.__antiMoireSpecAA = true;
  const prevCacheKey = typeof std.customProgramCacheKey === 'function'
    ? std.customProgramCacheKey.bind(std)
    : undefined;
  std.customProgramCacheKey = () => {
    const base = prevCacheKey ? prevCacheKey() : '';
    return base ? `${base}|anti-moire-spec-aa-v1` : 'anti-moire-spec-aa-v1';
  };

  std.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_OBJECTSPACE
          normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          #ifdef FLIP_SIDED
            normal = - normal;
          #endif
          #ifdef DOUBLE_SIDED
            normal = normal * faceDirection;
          #endif
          normal = normalize( normalMatrix * normal );
        #elif defined( USE_NORMALMAP_TANGENTSPACE )
          vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          float antiMoireMapLen = clamp( length( mapN ), 0.15, 1.0 );
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );
        #elif defined( USE_BUMPMAP )
          normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
        #endif`
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        {
          vec3 antiMoireDNorm = max( abs( dFdx( normal ) ), abs( dFdy( normal ) ) );
          float antiMoireNormVar = max( max( antiMoireDNorm.x, antiMoireDNorm.y ), antiMoireDNorm.z );
          float antiMoireExtraRough = max( 0.0, antiMoireNormVar - geometryRoughness ) * 0.85;
          #ifdef USE_NORMALMAP_TANGENTSPACE
            float antiMoireShrink = max( 0.0, 0.96 - antiMoireMapLen );
            float antiMoireToksvig = sqrt( antiMoireShrink / max( antiMoireMapLen, 0.2 ) ) * 0.55;
            antiMoireExtraRough = max( antiMoireExtraRough, antiMoireToksvig );
          #endif
          material.roughness = clamp(
            sqrt( material.roughness * material.roughness + antiMoireExtraRough * antiMoireExtraRough ),
            0.0525,
            1.0
          );
        }`
      );
  };
  std.needsUpdate = true;
}

export function applyAntiMoireToMaterial(
  mat: Material | null | undefined,
  quality: RenderQuality = 'high',
  options?: MaterialAntiMoireOptions,
): void {
  if (!mat) return;
  const record = mat as unknown as Record<string, Texture | null | undefined>;
  for (const key of TEXTURE_SLOTS) {
    const tex = record[key];
    if (tex && typeof tex === 'object' && 'isTexture' in tex) {
      configureMipmappedTexture(tex, quality);
    }
  }

  const std = mat as MeshStandardMaterial;
  if (std.isMeshStandardMaterial) {
    if (options?.maxNormalScale !== undefined && std.normalScale) {
      std.normalScale.x = Math.min(std.normalScale.x, options.maxNormalScale);
      std.normalScale.y = Math.min(std.normalScale.y, options.maxNormalScale);
    }
    if (options?.minRoughness !== undefined && typeof std.roughness === 'number') {
      std.roughness = Math.max(std.roughness, options.minRoughness);
    }
    if (options?.maxMetalness !== undefined && typeof std.metalness === 'number') {
      std.metalness = Math.min(std.metalness, options.maxMetalness);
    }
    applySpecularAntiAliasing(std);
  }
}

export function applyAntiMoireToObject(
  root: Object3D,
  quality: RenderQuality = 'high',
  options?: MaterialAntiMoireOptions,
): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      applyAntiMoireToMaterial(mat, quality, options);
    }
  });
}
