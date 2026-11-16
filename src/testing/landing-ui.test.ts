import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makeT, translate } from '../i18n';
import { landingDriver } from './landing-driver';
import { useSession } from '../store';
import {
  APOLLO_RETRO_NOZZLES,
  computeRetroNozzleImpact,
  createLandingFireVolumeMaterial,
  createLandingSmokeMaterial,
  createPadScorchMaterial,
  createPlasmaSheathMaterial,
  createPlasmaWakeGeometry,
  createSupersonicPlumeGeometry,
  createTurbulentFireballMaterial,
  createVolumetricNoise3DData,
  createVolumetricPlumeMaterial
} from '../components/scene/volumetricFire';

vi.mock('../components/landing/LandingScene3D', () => ({
  LandingScene3D: ({ scenarioId, cameraPreset }: { scenarioId: number; cameraPreset: string }) =>
    createElement('div', {
      className: 'landing-scene-3d-mock',
      'data-scenario': scenarioId,
      'data-camera': cameraPreset
    })
}));

vi.mock('../components/departure/DepartureScene3D', () => ({
  DepartureScene3D: () => createElement('div', { className: 'departure-scene-3d-mock' })
}));

import { DepartureWorkspace } from '../components/departure/DepartureWorkspace';
import { LandingTelemetryChart } from '../components/landing/LandingTelemetryChart';
import { LandingWorkspace } from '../components/landing/LandingWorkspace';
import { Topbar, type TopbarSecondaryItem } from '../components/layout/Topbar';

function buildSecondaryItems(
  program: 'docking' | 'departure' | 'landing',
  lang: 'en' | 'zh',
  completedIds: number[] = []
): TopbarSecondaryItem[] {
  const t = makeT(lang);
  if (program === 'departure') {
    return [
      { id: 1, label: `01 ${t('Latch Release', 'Latch Release')}`, completed: completedIds.includes(1) },
      { id: 2, label: `02 ${t('Corridor Centering', 'Corridor Centering')}`, completed: completedIds.includes(2) },
      { id: 3, label: `03 ${t('Attitude Watch', 'Attitude Watch')}`, completed: completedIds.includes(3) },
      { id: 4, label: `04 ${t('Full Departure', 'Full Departure')}`, completed: completedIds.includes(4) }
    ];
  }
  if (program === 'landing') {
    return [
      { id: 1, label: `01 ${t('Plasma Blackout', 'Plasma Blackout')}`, completed: completedIds.includes(1) },
      { id: 2, label: `02 ${t('Sky Blossom', 'Sky Blossom')}`, completed: completedIds.includes(2) },
      { id: 3, label: `03 ${t('Retro Cushion', 'Retro Cushion')}`, completed: completedIds.includes(3) },
      { id: 4, label: `04 ${t('Heroic Return', 'Heroic Return')}`, completed: completedIds.includes(4) }
    ];
  }
  return [
    { id: 1, label: `01 ${t('Learn to stop', 'Learn to stop')}`, completed: completedIds.includes(1) },
    { id: 2, label: `02 ${t('Cancel the drift', 'Cancel the drift')}`, completed: completedIds.includes(2) },
    { id: 3, label: `03 ${t('Align the port', 'Align the port')}`, completed: completedIds.includes(3) },
    { id: 4, label: `04 ${t('The final 50 metres', 'The final 50 metres')}`, completed: completedIds.includes(4) },
    { id: 5, label: `∞ ${t('Free-flight lab', 'Free-flight lab')}` }
  ];
}

describe('Unified Topbar secondary selector bar across Docking, Departure and Landing', () => {
  it('highlights active secondary items and renders completion badges across missions', () => {
    for (const program of ['docking', 'departure', 'landing'] as const) {
      const html = renderToStaticMarkup(
        createElement(Topbar, {
          currentTab: 'mission',
          onTabChange: () => {},
          secondaryItems: buildSecondaryItems(program, 'en', [1]),
          activeSecondaryId: 1
        })
      );

      expect(html).toContain('topbar-nav-divider');
      expect(html).toContain('topbar-secondary-btn');
      expect(html).toContain('topbar-secondary-done');
      expect((html.match(/nav-active/g) ?? []).length).toBe(2);
    }

    const landingZh = renderToStaticMarkup(
      createElement(Topbar, {
        currentTab: 'mission',
        onTabChange: () => {},
        secondaryItems: buildSecondaryItems('landing', 'zh', [1, 2]),
        activeSecondaryId: 3
      })
    );
    expect(landingZh).toContain('01 黑障热流区');
    expect(landingZh).toContain('02 群伞绽放开伞');
    expect(landingZh).toContain('03 反推软着陆');
    expect(landingZh).toContain('04 英雄凯旋归来');
    expect((landingZh.match(/topbar-secondary-done/g) ?? []).length).toBe(2);
  });
});

describe('LandingWorkspace & DepartureWorkspace unified Level 1 layout', () => {
  it('renders Landing Level 1 without sidebar, with stage header tabs, 5-step sequence and telemetry deck', () => {
    useSession.setState({ language: 'en' });
    const html = renderToStaticMarkup(
      createElement(LandingWorkspace, {
        initialActiveLevel: 1
      })
    );

    expect(html).toContain('liftoff-no-sidebar');
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('lesson-rail');
    expect(html).toContain('liftoff-stage-header');
    expect(html).toContain('01');
    expect(html).toContain('Plasma Blackout');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('3D Scene');
    expect(html).toContain('Objective &amp; Controls');
    expect(html).toContain('landing-scene-3d-mock');
    expect(html).toContain('Capsule Chase');
    expect(html).toContain('Canopy Wide');
    expect(html).toContain('Recovery Pad');
    expect(html).toContain('landing-sequence-bar');
    expect(html).toContain('Blackout');
    expect(html).toContain('Drogue');
    expect(html).toContain('Main Chute');
    expect(html).toContain('Shield Drop');
    expect(html).toContain('1.5m Retro');
    expect(html).toContain('landing-telemetry-grid');
    expect(html).toContain('Altitude');
    expect(html).toContain('Descent Speed');
    expect(html).toContain('Shield Temp');
    expect(html).toContain('G-Load');
    expect(html).toContain('Pad Offset');
  });

  it('renders Retro Cushion on Level 3', () => {
    useSession.setState({ language: 'en' });
    const level3Html = renderToStaticMarkup(
      createElement(LandingWorkspace, {
        initialActiveLevel: 3
      })
    );
    expect(level3Html).toContain('03');
    expect(level3Html).toContain('Retro Cushion');
  });

  it('renders Departure Level 1 without lesson-rail sidebar and with stage header tabs', () => {
    useSession.setState({ language: 'en' });
    const html = renderToStaticMarkup(
      createElement(DepartureWorkspace, {
        initialActiveLevel: 1
      })
    );

    expect(html).toContain('liftoff-no-sidebar');
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('lesson-rail');
    expect(html).toContain('liftoff-stage-header');
    expect(html).toContain('01');
    expect(html).toContain('Latch Release');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('3D Scene');
    expect(html).toContain('Objective &amp; Controls');
    expect(html).toContain('departure-scene-3d-mock');
    expect(html).toContain('Hatch: OPEN [1]');
    expect(html).toContain('Close Hatch [1]');
    expect(translate('zh', 'Hatch: OPEN [1]')).toBe('舱门：打开 [1]');
    expect(translate('zh', 'Hatch: CLOSED [1]')).toBe('舱门：关闭 [1]');
    expect(translate('zh', 'Close Hatch [1]')).toBe('关闭舱门 [1]');
    expect(translate('zh', 'Open Hatch [1]')).toBe('打开舱门 [1]');
  });
});

describe('LandingTelemetryChart SVG debrief chart', () => {
  it('renders SVG telemetry curves when at least 2 landing samples exist', () => {
    const emptyHtml = renderToStaticMarkup(
      createElement(LandingTelemetryChart, {
        samples: [],
        language: 'en'
      })
    );
    expect(emptyHtml).toBe('');

    landingDriver.load(1);
    landingDriver.start(true);
    const snap = landingDriver.advance(5);

    const html = renderToStaticMarkup(
      createElement(LandingTelemetryChart, {
        samples: snap.samples,
        language: 'en'
      })
    );
    expect(html).toContain('landing-debrief-chart');
    expect(html).toContain('Reentry Telemetry Trace');
    expect(html).toContain('Altitude &amp; Speed');
    expect(html).toContain('G-Load &amp; Thermal');
    expect(html).toContain('landing-chart-svg');
    expect(html).toContain('<path d="M');
    expect(html).toContain('landing-chart-legend');
  });
});

describe('Apollo CM GLB asset & volumetric fire shaders', () => {
  it('provides public/models/apollo_cm.glb with glTF binary header and sculpted meshes', () => {
    const glbPath = resolve(process.cwd(), 'public/models/apollo_cm.glb');
    expect(existsSync(glbPath)).toBe(true);
    const stat = statSync(glbPath);
    expect(stat.size).toBeGreaterThan(500_000);

    const bytes = readFileSync(glbPath);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
    const jsonChunkLength = bytes.readUInt32LE(12);
    const gltfJson = bytes.subarray(20, 20 + jsonChunkLength).toString('utf8');
    expect(gltfJson).toContain('CM_Hull');
    expect(gltfJson).toContain('CM_HeatShield');
    expect(gltfJson).toContain('CM_ChuteBay');
    expect(gltfJson).toContain('CM_ApexCap');
  });

  it('constructs volumetric plume/wake geometries and blackbody GLSL materials cleanly', () => {
    const plumeGeo = createSupersonicPlumeGeometry(0.18, 0.55, 3.2, 24, 16);
    expect(plumeGeo).toBeInstanceOf(THREE.BufferGeometry);
    const plumePos = plumeGeo.getAttribute('position');
    expect(plumePos.count).toBeGreaterThan(100);
    expect(plumeGeo.getAttribute('uv')).toBeDefined();
    expect(plumeGeo.getAttribute('normal')).toBeDefined();

    const wakeGeo = createPlasmaWakeGeometry(2.1, 2.55, 6.2, 3.4, 24);
    expect(wakeGeo).toBeInstanceOf(THREE.BufferGeometry);
    expect(wakeGeo.getAttribute('position').count).toBeGreaterThan(50);

    const plumeMat = createVolumetricPlumeMaterial({
      coreColor: '#fff8ee',
      midColor: '#ff7b1c',
      outerColor: '#8c1404',
      speed: 7.5,
      dispAmp: 0.14,
      machStrength: 0.9,
      opacity: 0.9
    });
    const sheathMat = createPlasmaSheathMaterial(0);
    const fireballMat = createTurbulentFireballMaterial(1.0);

    for (const mat of [plumeMat, sheathMat, fireballMat]) {
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.uniforms.uTime).toBeDefined();
      expect(mat.vertexShader.length).toBeGreaterThan(50);
      expect(mat.fragmentShader.length).toBeGreaterThan(100);
      expect(mat.transparent).toBe(true);
      mat.dispose();
    }
    plumeGeo.dispose();
    wakeGeo.dispose();
  });

  it('constructs 3D volumetric landing fire, canted retro nozzle raycast, pad scorch, and smoke materials', () => {
    // 4 canted nozzles flaring radially outward & downward from Apollo CM belly
    expect(APOLLO_RETRO_NOZZLES).toHaveLength(4);
    for (const nozzle of APOLLO_RETRO_NOZZLES) {
      expect(nozzle.throat[1]).toBeLessThan(-0.7);
      expect(nozzle.dir[1]).toBeLessThan(-0.8);
      expect(Math.sign(nozzle.dir[0])).toBe(Math.sign(nozzle.throat[0]));
      expect(Math.sign(nozzle.dir[2])).toBe(Math.sign(nozzle.throat[2]));
      const mag = Math.hypot(nozzle.dir[0], nozzle.dir[1], nozzle.dir[2]);
      expect(mag).toBeCloseTo(1, 5);
    }

    // Raycast from capsule nozzle onto concrete recovery pad
    const identityMat = new THREE.Matrix4();
    const nearImpact = computeRetroNozzleImpact(APOLLO_RETRO_NOZZLES[0], identityMat, -1.35);
    expect(nearImpact.impactPos.y).toBeCloseTo(-1.35, 5);
    expect(nearImpact.distToPad).toBeGreaterThan(0);
    expect(nearImpact.impingeStrength).toBeGreaterThan(0.5);
    expect(Math.abs(nearImpact.impactPos.x)).toBeGreaterThan(Math.abs(nearImpact.worldOrigin.x));

    // Periodic 3D turbulence + Worley RGBA texture data
    const noiseData = createVolumetricNoise3DData(16);
    expect(noiseData).toBeInstanceOf(Uint8Array);
    expect(noiseData.length).toBe(16 * 16 * 16 * 4);
    let minVal = 255;
    let maxVal = 0;
    for (let i = 0; i < noiseData.length; i += 17) {
      if (noiseData[i] < minVal) minVal = noiseData[i];
      if (noiseData[i] > maxVal) maxVal = noiseData[i];
    }
    expect(maxVal).toBeGreaterThan(150);
    expect(minVal).toBeLessThan(110);

    // GLSL3 3D volumetric fire raymarch material + ground scorch + fire-lit smoke
    const volumeMat = createLandingFireVolumeMaterial();
    expect(volumeMat.glslVersion).toBe(THREE.GLSL3);
    expect(volumeMat.blending).toBe(THREE.CustomBlending);
    expect(volumeMat.blendSrc).toBe(THREE.OneFactor);
    expect(volumeMat.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(volumeMat.uniforms.uNoiseTex.value).toBeInstanceOf(THREE.Data3DTexture);
    expect(volumeMat.fragmentShader).toContain('layout(location = 0) out vec4 fragColor');
    expect(volumeMat.fragmentShader).toContain('sampler3D uNoiseTex');

    const scorchMat = createPadScorchMaterial();
    expect(scorchMat.glslVersion).toBe(THREE.GLSL3);
    expect(scorchMat.fragmentShader).toContain('layout(location = 0) out vec4 fragColor');
    expect(scorchMat.uniforms.uNoiseTex.value).toBeInstanceOf(THREE.Data3DTexture);
    expect(scorchMat.uniforms.uImpactPos.value).toHaveLength(4);
    expect(scorchMat.uniforms.uBurnIntensity).toBeDefined();

    const smokeMat = createLandingSmokeMaterial();
    expect(smokeMat.glslVersion).toBe(THREE.GLSL3);
    expect(smokeMat.fragmentShader).toContain('layout(location = 0) out vec4 fragColor');
    expect(smokeMat.uniforms.uPadTopY).toBeDefined();

    for (const mat of [volumeMat, scorchMat, smokeMat]) {
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
      mat.dispose();
    }
  });
});
