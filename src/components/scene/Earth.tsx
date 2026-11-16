import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import {
  Color,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector4
} from 'three';
import { useSession } from '../../store';
import { EARTH_RADIUS_M, ISS_ALTITUDE_M } from '../../sim/earth';
import { configureMipmappedTexture } from './textureQuality';

const RAD = Math.PI / 180;
// Sub-satellite point: Directly above Kennedy Space Center / Florida (28.5°N, 80.6°W)
// PMA-2 port points in ISS flight direction (+z), looking down at North American continent & Atlantic
export const SUB_LAT = 28.5 * RAD;
export const SUB_LON = -80.6 * RAD;
export const EARTH_ROTATION: [number, number, number] = [
  -(Math.PI / 2 - SUB_LAT),
  Math.PI / 2 - (SUB_LON + Math.PI),
  0
];

// Detail patch UV bounds in equirectangular projection [uMin, vMin, uMax, vMax]
// Covers 4,500 km field of view over North America, Gulf of Mexico, Florida & Atlantic
export const DETAIL_BOUNDS = new Vector4(
  1420 / 8192,
  (4096 - 1923) / 4096,
  3104 / 8192,
  (4096 - 876) / 4096
);

// GPU procedural fractal terrain & micro-texture synthesizer
const NOISE_GLSL = /* glsl */ `
  float earthHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float earthNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(earthHash(i + vec3(0,0,0)), earthHash(i + vec3(1,0,0)), f.x),
          mix(earthHash(i + vec3(0,1,0)), earthHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(earthHash(i + vec3(0,0,1)), earthHash(i + vec3(1,0,1)), f.x),
          mix(earthHash(i + vec3(0,1,1)), earthHash(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }

  // 3-octave multi-scale fractal noise (mountain ridges, valleys, and terrain micro-relief)
  float earthFbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * earthNoise(p);
      p *= 2.4;
      a *= 0.45;
    }
    return v;
  }
`;

/**
 * Scientific 1:1 HD Earth system
 * Integrates NASA HD satellite base map (desktop 8K / mobile 4K), procedural fractal micro-details,
 * 4K dynamic cloud deck (with real soft ground shadow), and Rayleigh atmospheric horizon glow.
 */
export function Earth() {
  const quality = useSession((s) => s.quality);

  const dayTexturePath =
    quality === 'low' ? '/textures/earth_day_4096.jpg' : '/textures/earth_day_8192.jpg';

  const [dayMap, specularMap, cloudsMap, patchMap] = useTexture([
    dayTexturePath,
    '/textures/earth_specular.jpg',
    '/textures/earth_clouds_4096.jpg',
    '/textures/earth_patch_4096.jpg'
  ]);

  useEffect(() => {
    dayMap.colorSpace = SRGBColorSpace;
    patchMap.colorSpace = SRGBColorSpace;
    cloudsMap.colorSpace = SRGBColorSpace;
    configureMipmappedTexture(dayMap, quality);
    configureMipmappedTexture(patchMap, quality);
    configureMipmappedTexture(specularMap, quality);
    configureMipmappedTexture(cloudsMap, quality);
  }, [dayMap, patchMap, specularMap, cloudsMap, quality]);

  const cloudsRef = useRef<Mesh>(null);

  // 1. Surface material: True satellite colors + local 4K upscaled detail + procedural land relief + ocean sun glint + cloud shadows + horizon Rayleigh scattering
  const surfaceMaterial = useMemo(() => {
    const mat = new MeshStandardMaterial({
      map: dayMap,
      roughness: 0.85,
      metalness: 0.04,
      emissive: new Color('#040a12'),
      emissiveIntensity: 0.08
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSpecularMap = { value: specularMap };
      shader.uniforms.uCloudsMap = { value: cloudsMap };
      shader.uniforms.uDetailMap = { value: patchMap };
      shader.uniforms.uDetailBounds = { value: DETAIL_BOUNDS };

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vSpherePos;
        varying vec3 vWorldNormalVec;
        varying vec3 vWorldPosVec;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vSpherePos = normalize(position);
        vWorldNormalVec = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vWorldPosVec = (modelMatrix * vec4(position, 1.0)).xyz;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uSpecularMap;
        uniform sampler2D uCloudsMap;
        uniform sampler2D uDetailMap;
        uniform vec4 uDetailBounds;
        varying vec3 vSpherePos;
        varying vec3 vWorldNormalVec;
        varying vec3 vWorldPosVec;
        ${NOISE_GLSL}
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>

        // Local HD detail patch (4K upscaled ground layer covering 4,500 km field of view)
        vec2 detailUv = (vMapUv - uDetailBounds.xy) / (uDetailBounds.zw - uDetailBounds.xy);
        float inBounds = step(0.0, detailUv.x) * step(detailUv.x, 1.0) * step(0.0, detailUv.y) * step(detailUv.y, 1.0);
        float edgeAlpha = smoothstep(0.0, 0.06, detailUv.x) * smoothstep(1.0, 0.94, detailUv.x)
                        * smoothstep(0.0, 0.06, detailUv.y) * smoothstep(1.0, 0.94, detailUv.y) * inBounds;
        vec3 detailColor = texture2D(uDetailMap, clamp(detailUv, 0.0, 1.0)).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, detailColor, edgeAlpha);
        
        // Sample water mask (white = water 1.0, black = land 0.0)
        float isWater = texture2D(uSpecularMap, vMapUv).r;
        float sphereSpan = length(fwidth(vSpherePos));
        
        // 1. Land micro-relief enhancement with Nyquist screen-space fading near limb/horizon
        float reliefFade = smoothstep(0.55, 0.10, sphereSpan * 3600.0);
        float microFade = smoothstep(0.50, 0.10, sphereSpan * 9800.0);
        float landRelief = mix(0.5, earthFbm(vSpherePos * 3600.0), reliefFade);
        float microDetail = mix(0.5, earthNoise(vSpherePos * 9800.0), microFade);
        float landContrast = 0.88 + 0.20 * landRelief + 0.06 * microDetail;
        vec3 landColor = diffuseColor.rgb * landContrast;

        // 2. Ocean: preserves deep blue and turquoise shallows without horizon Nyquist shimmer
        float oceanFade = smoothstep(0.50, 0.10, sphereSpan * 12000.0);
        float oceanWaves = mix(0.5, earthNoise(vSpherePos * 12000.0), oceanFade) * 0.04;
        vec3 oceanColor = diffuseColor.rgb * (0.96 + oceanWaves);

        // Smoothly blend land and ocean by water mask
        diffuseColor.rgb = mix(landColor, oceanColor, smoothstep(0.25, 0.75, isWater));

        // 3. Realistic soft cloud shadow on ground
        vec2 shadowOffset = vec2(0.0015, -0.0010);
        float cloudShadow = texture2D(uCloudsMap, vMapUv + shadowOffset).r;
        diffuseColor.rgb *= mix(1.0, 0.62, smoothstep(0.18, 0.75, cloudShadow) * 0.72);

        // 4. Atmospheric Rayleigh scattering horizon glow
        vec3 viewDir = normalize(cameraPosition - vWorldPosVec);
        float cosTheta = dot(vWorldNormalVec, viewDir);
        float atmosphereHaze = pow(1.0 - clamp(cosTheta, 0.0, 1.0), 3.6);
        vec3 atmosphereColor = vec3(0.24, 0.56, 0.96);
        diffuseColor.rgb = mix(diffuseColor.rgb, atmosphereColor, atmosphereHaze * 0.55);
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        // Ocean specular sun glint, land maintains matte roughness
        roughnessFactor = mix(0.86, 0.18, smoothstep(0.25, 0.75, isWater));
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <metalnessmap_fragment>',
        /* glsl */ `
        #include <metalnessmap_fragment>
        metalnessFactor = mix(0.02, 0.05, smoothstep(0.25, 0.75, isWater));
        `
      );
    };

    return mat;
  }, [dayMap, specularMap, cloudsMap, patchMap]);

  // 2. Separate cloud layer material: 4K NASA clouds + fractal wisps + feathering + limb glow
  const cloudsMaterial = useMemo(() => {
    const mat = new MeshStandardMaterial({
      map: cloudsMap,
      transparent: true,
      roughness: 0.95,
      metalness: 0.0,
      depthWrite: false
    });

    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vSpherePos;
        varying vec3 vWorldNormalVec;
        varying vec3 vWorldPosVec;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vSpherePos = normalize(position);
        vWorldNormalVec = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vWorldPosVec = (modelMatrix * vec4(position, 1.0)).xyz;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vSpherePos;
        varying vec3 vWorldNormalVec;
        varying vec3 vWorldPosVec;
        ${NOISE_GLSL}
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        float rawCloud = diffuseColor.r;
        
        // Fractal cloud edge disturbance with Nyquist screen-space attenuation
        float cloudSpan = length(fwidth(vSpherePos));
        float wispFade = smoothstep(0.55, 0.10, cloudSpan * 3200.0);
        float microFade = smoothstep(0.50, 0.10, cloudSpan * 8000.0);
        float wisps = mix(0.5, earthFbm(vSpherePos * 3200.0), wispFade);
        float micro = mix(0.5, earthNoise(vSpherePos * 8000.0), microFade);
        
        // Feathered edge: thick clouds stay opaque, thin clouds gently reveal terrain
        float cloudAlpha = smoothstep(0.10, 0.75, rawCloud * (0.86 + 0.28 * wisps));
        
        vec3 viewDir = normalize(cameraPosition - vWorldPosVec);
        float cosTheta = dot(vWorldNormalVec, viewDir);
        float haze = pow(1.0 - clamp(cosTheta, 0.0, 1.0), 3.6);

        vec3 baseCloudColor = vec3(0.96, 0.98, 1.0) * (0.92 + 0.10 * micro);
        diffuseColor.rgb = mix(baseCloudColor, vec3(0.35, 0.68, 1.0), haze * 0.40);
        diffuseColor.a = cloudAlpha * 0.85;
        `
      );
    };

    return mat;
  }, [cloudsMap]);

  useEffect(() => {
    return () => {
      surfaceMaterial.dispose();
    };
  }, [surfaceMaterial]);

  useEffect(() => {
    return () => {
      cloudsMaterial.dispose();
    };
  }, [cloudsMaterial]);

  const widthSegs = quality === 'low' ? 128 : 256;
  const heightSegs = quality === 'low' ? 64 : 128;
  const cloudWidthSegs = quality === 'low' ? 96 : 192;
  const cloudHeightSegs = quality === 'low' ? 48 : 96;

  // Simulate slow high-altitude cloud drift in low Earth orbit
  useFrame((_, delta) => {
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * 0.00016;
    }
  });

  return (
    <group position={[0, -(EARTH_RADIUS_M + ISS_ALTITUDE_M), 0]} rotation={EARTH_ROTATION}>
      {/* 1. Earth land & ocean sphere (mean radius 6,371 km) */}
      <mesh material={surfaceMaterial}>
        <sphereGeometry args={[EARTH_RADIUS_M, widthSegs, heightSegs]} />
      </mesh>

      {/* 2. Tropospheric cloud system (12 km above surface, true scale) */}
      <mesh ref={cloudsRef} material={cloudsMaterial}>
        <sphereGeometry args={[EARTH_RADIUS_M + 12_000, cloudWidthSegs, cloudHeightSegs]} />
      </mesh>
    </group>
  );
}
