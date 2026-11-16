import { describe, expect, it } from 'vitest';
import { ClampToEdgeWrapping, LinearFilter, SRGBColorSpace } from 'three';
import {
  buildSoftPanoramaCap,
  createDataSoftTexture,
  createFallbackCapAsset,
  linearToSrgbByte,
  mirrorIndex,
  srgbByteToLinear
} from './panoramaTexture';

describe('panoramaTexture', () => {
  it('mirrors out-of-bounds horizontal indices continuously across both seams', () => {
    expect(mirrorIndex(0, 8)).toBe(0);
    expect(mirrorIndex(7, 8)).toBe(7);
    expect(mirrorIndex(-1, 8)).toBe(0);
    expect(mirrorIndex(-2, 8)).toBe(1);
    expect(mirrorIndex(8, 8)).toBe(7);
    expect(mirrorIndex(9, 8)).toBe(6);
    expect(mirrorIndex(16, 8)).toBe(0);
  });

  it('round-trips sRGB byte values through linear conversion', () => {
    for (const byte of [0, 12, 45, 128, 200, 255]) {
      const lin = srgbByteToLinear(byte);
      expect(linearToSrgbByte(lin)).toBe(byte);
    }
  });

  it('produces bottom-up soft buffer, distinct pole averages, and smoothes high-frequency edge stripes', () => {
    const width = 32;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (y < height / 2) {
          // Top sky: deep twilight blue
          rgba[i] = 20;
          rgba[i + 1] = 45;
          rgba[i + 2] = 110;
        } else {
          // Bottom ground: alternating bright/dark high-frequency vertical stripes
          const bright = x % 2 === 0;
          rgba[i] = bright ? 200 : 20;
          rgba[i + 1] = bright ? 190 : 30;
          rgba[i + 2] = bright ? 180 : 25;
        }
        rgba[i + 3] = 255;
      }
    }

    const { bottomUpRgba, topLinearRgb, botLinearRgb } = buildSoftPanoramaCap(
      rgba,
      width,
      height,
      6,
      2
    );

    // Top pole should be blue-dominant; bottom pole should be neutral warm gray
    expect(topLinearRgb[2]).toBeGreaterThan(topLinearRgb[0] * 3);
    expect(botLinearRgb[0]).toBeGreaterThan(topLinearRgb[0]);

    // Bottom-up row 0 (uv.y = 0) corresponds to bottom ground; high-frequency stripes must be smoothed out
    const botRowMinR = Math.min(
      ...Array.from({ length: width }, (_, x) => bottomUpRgba[x * 4])
    );
    const botRowMaxR = Math.max(
      ...Array.from({ length: width }, (_, x) => bottomUpRgba[x * 4])
    );
    expect(botRowMaxR - botRowMinR).toBeLessThan(20);

    // Bottom-up last row (uv.y = 1) corresponds to top twilight sky (blue > red)
    const topRowIdx = ((height - 1) * width) * 4;
    expect(bottomUpRgba[topRowIdx + 2]).toBeGreaterThan(bottomUpRgba[topRowIdx] * 2);
  });

  it('configures soft DataTexture with LinearFilter, ClampToEdgeWrapping, and SRGBColorSpace', () => {
    const tex = createDataSoftTexture(new Uint8Array([10, 20, 30, 255]), 1, 1);
    expect(tex.colorSpace).toBe(SRGBColorSpace);
    expect(tex.minFilter).toBe(LinearFilter);
    expect(tex.magFilter).toBe(LinearFilter);
    expect(tex.wrapS).toBe(ClampToEdgeWrapping);
    expect(tex.wrapT).toBe(ClampToEdgeWrapping);
    expect(tex.flipY).toBe(false);
    expect(tex.generateMipmaps).toBe(false);
    tex.dispose();

    const fb = createFallbackCapAsset();
    expect(fb.aspect).toBeCloseTo(16 / 9);
    fb.tex.dispose();
    fb.softTex.dispose();
  });
});
