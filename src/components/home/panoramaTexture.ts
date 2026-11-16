import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType
} from 'three';

export const SOFT_PANO_WIDTH = 128;
export const SOFT_PANO_HEIGHT = 64;

export interface PanoramaCapAsset {
  tex: Texture;
  softTex: Texture;
  topPole: Color;
  botPole: Color;
  aspect: number;
}

export interface SoftPanoramaCapResult {
  /** Bottom-up RGBA sRGB bytes suitable for a Three.js DataTexture (flipY = false) */
  bottomUpRgba: Uint8Array;
  /** Linear-space RGB average of the top border band */
  topLinearRgb: [number, number, number];
  /** Linear-space RGB average of the bottom border band */
  botLinearRgb: [number, number, number];
}

export function srgbByteToLinear(byte: number): number {
  const u = Math.max(0, Math.min(255, byte)) / 255;
  return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}

export function linearToSrgbByte(linear: number): number {
  const u = Math.max(0, Math.min(1, linear));
  const s = u <= 0.0031308 ? u * 12.92 : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

/** Reflect out-of-bounds index across [0, len - 1] to match shader mirrorX tiling. */
export function mirrorIndex(index: number, len: number): number {
  if (len <= 1) return 0;
  const period = len * 2;
  let m = ((index % period) + period) % period;
  if (m >= len) m = period - 1 - m;
  return m;
}

function boxBlurHorizontalMirror(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radiusX: number
) {
  const inv = 1 / (radiusX * 2 + 1);
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dx = -radiusX; dx <= radiusX; dx++) {
        const sx = mirrorIndex(x + dx, width);
        const i = (rowOff + sx) * 3;
        r += src[i];
        g += src[i + 1];
        b += src[i + 2];
      }
      const o = (rowOff + x) * 3;
      dst[o] = r * inv;
      dst[o + 1] = g * inv;
      dst[o + 2] = b * inv;
    }
  }
}

function boxBlurVerticalClamp(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radiusY: number
) {
  const inv = 1 / (radiusY * 2 + 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = -radiusY; dy <= radiusY; dy++) {
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        const i = (sy * width + x) * 3;
        r += src[i];
        g += src[i + 1];
        b += src[i + 2];
      }
      const o = (y * width + x) * 3;
      dst[o] = r * inv;
      dst[o + 1] = g * inv;
      dst[o + 2] = b * inv;
    }
  }
}

function averageRowBand(
  buf: Float32Array,
  width: number,
  yStart: number,
  yEnd: number
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      r += buf[i];
      g += buf[i + 1];
      b += buf[i + 2];
      count++;
    }
  }
  const inv = count > 0 ? 1 / count : 1;
  return [r * inv, g * inv, b * inv];
}

/**
 * Generates a mirror-seamless blurred companion buffer (bottom-up for WebGL DataTexture)
 * and yaw-invariant linear pole colors from a top-down RGBA image buffer.
 */
export function buildSoftPanoramaCap(
  topDownRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radiusX = 10,
  radiusY = 4
): SoftPanoramaCapResult {
  const pixelCount = width * height;
  const bufA = new Float32Array(pixelCount * 3);
  const bufB = new Float32Array(pixelCount * 3);

  for (let i = 0; i < pixelCount; i++) {
    bufA[i * 3] = srgbByteToLinear(topDownRgba[i * 4]);
    bufA[i * 3 + 1] = srgbByteToLinear(topDownRgba[i * 4 + 1]);
    bufA[i * 3 + 2] = srgbByteToLinear(topDownRgba[i * 4 + 2]);
  }

  // Three box-blur passes approximate a smooth Gaussian with zero seam across mirror edges
  for (let pass = 0; pass < 3; pass++) {
    boxBlurHorizontalMirror(bufA, bufB, width, height, radiusX);
    boxBlurVerticalClamp(bufB, bufA, width, height, radiusY);
  }

  const bandRows = Math.max(1, Math.min(3, Math.floor(height * 0.05)));
  const topLinearRgb = averageRowBand(bufA, width, 0, bandRows);
  const botLinearRgb = averageRowBand(bufA, width, height - bandRows, height);

  const bottomUpRgba = new Uint8Array(pixelCount * 4);
  for (let y = 0; y < height; y++) {
    const outRow = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      const dstIdx = (outRow * width + x) * 4;
      bottomUpRgba[dstIdx] = linearToSrgbByte(bufA[srcIdx]);
      bottomUpRgba[dstIdx + 1] = linearToSrgbByte(bufA[srcIdx + 1]);
      bottomUpRgba[dstIdx + 2] = linearToSrgbByte(bufA[srcIdx + 2]);
      bottomUpRgba[dstIdx + 3] = 255;
    }
  }

  return { bottomUpRgba, topLinearRgb, botLinearRgb };
}

export function createDataSoftTexture(data: Uint8Array, width: number, height: number): DataTexture {
  const tex = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export function createFallbackCapAsset(): PanoramaCapAsset {
  const blank = new DataTexture(new Uint8Array([10, 14, 34, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  blank.colorSpace = SRGBColorSpace;
  blank.minFilter = LinearFilter;
  blank.magFilter = LinearFilter;
  blank.needsUpdate = true;

  const softBlank = createDataSoftTexture(new Uint8Array([10, 14, 34, 255]), 1, 1);
  const pole = new Color().setRGB(10 / 255, 14 / 255, 34 / 255, SRGBColorSpace);

  return {
    tex: blank,
    softTex: softBlank,
    topPole: pole.clone(),
    botPole: pole.clone(),
    aspect: 16 / 9
  };
}

export function buildPanoramaCapAsset(tex: Texture): PanoramaCapAsset {
  const img = tex.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  const width = img?.width ?? 0;
  const height = img?.height ?? 0;
  const aspect = width > 0 && height > 0 ? width / height : 16 / 9;

  if (!img || width <= 0 || height <= 0 || typeof document === 'undefined') {
    const fallback = createFallbackCapAsset();
    fallback.tex.dispose();
    return { ...fallback, tex, aspect };
  }

  const canvas = document.createElement('canvas');
  canvas.width = SOFT_PANO_WIDTH;
  canvas.height = SOFT_PANO_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = createFallbackCapAsset();
    fallback.tex.dispose();
    return { ...fallback, tex, aspect };
  }

  ctx.drawImage(img, 0, 0, SOFT_PANO_WIDTH, SOFT_PANO_HEIGHT);
  const imageData = ctx.getImageData(0, 0, SOFT_PANO_WIDTH, SOFT_PANO_HEIGHT);
  const { bottomUpRgba, topLinearRgb, botLinearRgb } = buildSoftPanoramaCap(
    imageData.data,
    SOFT_PANO_WIDTH,
    SOFT_PANO_HEIGHT
  );

  const softTex = createDataSoftTexture(bottomUpRgba, SOFT_PANO_WIDTH, SOFT_PANO_HEIGHT);
  const topPole = new Color().setRGB(topLinearRgb[0], topLinearRgb[1], topLinearRgb[2]);
  const botPole = new Color().setRGB(botLinearRgb[0], botLinearRgb[1], botLinearRgb[2]);

  return { tex, softTex, topPole, botPole, aspect };
}
