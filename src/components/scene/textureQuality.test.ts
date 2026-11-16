import { describe, expect, it } from 'vitest';
import {
  CanvasTexture,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat
} from 'three';
import {
  applyAntiMoireToObject,
  applySpecularAntiAliasing,
  configureMipmappedTexture,
  targetAnisotropyForQuality
} from './textureQuality';

describe('textureQuality anti-Moiré helpers', () => {
  it('enforces trilinear mipmaps and anisotropic filtering on 2D textures', () => {
    const tex = new CanvasTexture(null as unknown as HTMLCanvasElement);
    tex.generateMipmaps = false;
    tex.minFilter = LinearFilter;
    tex.anisotropy = 1;

    configureMipmappedTexture(tex, 'high');
    expect(tex.generateMipmaps).toBe(true);
    expect(tex.minFilter).toBe(LinearMipmapLinearFilter);
    expect(tex.magFilter).toBe(LinearFilter);
    expect(tex.anisotropy).toBe(targetAnisotropyForQuality('high'));

    tex.anisotropy = 1;
    configureMipmappedTexture(tex, 'low');
    expect(tex.anisotropy).toBe(targetAnisotropyForQuality('low'));
  });

  it('preserves DataTextures and explicitly marked LUT textures', () => {
    const lut = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
    lut.minFilter = NearestFilter;
    lut.magFilter = NearestFilter;
    lut.generateMipmaps = false;

    configureMipmappedTexture(lut, 'high');
    expect(lut.minFilter).toBe(NearestFilter);
    expect(lut.magFilter).toBe(NearestFilter);
    expect(lut.generateMipmaps).toBe(false);

    const marked = new CanvasTexture(null as unknown as HTMLCanvasElement);
    marked.generateMipmaps = false;
    marked.minFilter = LinearFilter;
    marked.userData.preserveFiltering = true;

    configureMipmappedTexture(marked, 'high');
    expect(marked.minFilter).toBe(LinearFilter);
    expect(marked.generateMipmaps).toBe(false);
  });

  it('attaches specular anti-aliasing once to normal-mapped MeshStandardMaterials', () => {
    const colorMap = new CanvasTexture(null as unknown as HTMLCanvasElement);
    const normalMap = new CanvasTexture(null as unknown as HTMLCanvasElement);
    colorMap.generateMipmaps = false;
    normalMap.generateMipmaps = false;

    const mat = new MeshStandardMaterial({ map: colorMap, normalMap, roughness: 0.25 });
    const group = new Group();
    group.add(new Mesh(new PlaneGeometry(1, 1), mat));

    applyAntiMoireToObject(group, 'high');
    expect(colorMap.minFilter).toBe(LinearMipmapLinearFilter);
    expect(normalMap.minFilter).toBe(LinearMipmapLinearFilter);
    expect(colorMap.anisotropy).toBe(16);
    expect(normalMap.anisotropy).toBe(16);
    expect(mat.userData.__antiMoireSpecAA).toBe(true);
    expect(mat.customProgramCacheKey?.()).toContain('anti-moire-spec-aa-v1');

    const hook = mat.onBeforeCompile;
    applySpecularAntiAliasing(mat);
    expect(mat.onBeforeCompile).toBe(hook);
  });
});
