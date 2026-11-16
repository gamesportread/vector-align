import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/liftoff/LiftoffScene3D', () => ({
  LiftoffScene3D: () => createElement('div', { 'data-testid': 'liftoff-scene-3d-mock' })
}));

import { Topbar, type TopbarSecondaryItem } from '../components/layout/Topbar';
import { LiftoffWorkspace } from '../components/liftoff/LiftoffWorkspace';
import { LANGUAGES, makeT, translate } from '../i18n';
import { useSession } from '../store';

function buildLiftoffSecondaryItems(language: typeof LANGUAGES[number]['code']): TopbarSecondaryItem[] {
  const t = makeT(language);
  return [
    { id: 1, label: `01 ${t('Liftoff & Gravity Turn', 'Liftoff & Gravity Turn')}` },
    { id: 2, label: `02 ${t('Staging', 'Staging')}` },
    { id: 3, label: `03 ${t('Orbit Insertion', 'Orbit Insertion')}` },
    { id: 4, label: `★ ${t('Full Launch', 'Full Launch')}` }
  ];
}

describe('Topbar & Liftoff secondary navigation UI interface', () => {
  beforeEach(() => {
    useSession.setState({ language: 'en', muted: true });
  });

  it('renders icon-only brand return link with no VECTORALIGN text and no Menu button', () => {
    const html = renderToStaticMarkup(
      createElement(Topbar, {
        currentTab: 'mission',
        onTabChange: () => {},
        onReturnHome: () => {}
      })
    );

    expect(html).toContain('class="brand"');
    expect(html).toContain('aria-label="Return to Main Menu"');
    expect(html).toContain('src="/favicon.svg"');
    expect(html).not.toContain('VECTOR');
    expect(html).not.toContain('VECTORALIGN');
    expect(html).not.toContain('home-return-btn');
    expect(html).not.toContain('>Menu<');
    expect(html).not.toContain('topbar-nav-divider');
    expect(html).not.toContain('Install app');
  });

  it('renders secondary Liftoff level items after a separator and highlights the active item', () => {
    const secondaryItems = buildLiftoffSecondaryItems('en');
    const html = renderToStaticMarkup(
      createElement(Topbar, {
        currentTab: 'mission',
        onTabChange: () => {},
        onReturnHome: () => {},
        hideReferenceTabs: true,
        onOpenBriefing: () => {},
        secondaryItems,
        activeSecondaryId: 1,
        onSelectSecondary: () => {}
      })
    );

    expect(html).toContain('role="separator"');
    expect(html).toContain('01 Liftoff &amp; Gravity Turn');
    expect(html).toContain('02 Staging');
    expect(html).toContain('03 Orbit Insertion');
    expect(html).toContain('★ Full Launch');
    expect(html).not.toContain('Flight log');
    expect(html).not.toContain('Field guide');
    expect(html.indexOf('>Briefing</button>')).toBeLessThan(html.indexOf('class="topbar-nav-divider"'));
    expect(html).toContain('class="topbar-secondary-btn nav-active"');

    // Only the active secondary item (01 Liftoff & Gravity Turn) plus the active main tab (Missions) carry nav-active
    const activeMatches = html.match(/nav-active/g) ?? [];
    expect(activeMatches).toHaveLength(2);
  });

  it('clears secondary item active highlight when switched to another main tab', () => {
    const html = renderToStaticMarkup(
      createElement(Topbar, {
        currentTab: 'guide',
        onTabChange: () => {},
        secondaryItems: buildLiftoffSecondaryItems('en'),
        activeSecondaryId: 1,
        onSelectSecondary: () => {}
      })
    );

    expect(html).not.toContain('class="topbar-secondary-btn nav-active"');
    expect(html.match(/nav-active/g) ?? []).toHaveLength(1);
    expect(html).toContain('Flight log');
    expect(html).toContain('Field guide');
  });

  it('provides complete 7-language translations for secondary nav and Liftoff UI strings', () => {
    const keys = [
      'Mission briefing',
      'Liftoff & Gravity Turn',
      'Staging',
      'Orbit Insertion',
      'Full Launch',
      'Throttle Control',
      '💥 Crashed on land surface',
      '3D Scene',
      'Objective & Controls',
      'Throttle',
      'Stage',
      'Pause',
      'Resume',
      'Reset',
      'Start',
      'Altitude',
      'Speed',
      'Return to Main Menu'
    ];

    for (const { code } of LANGUAGES) {
      for (const key of keys) {
        const text = translate(code, key);
        expect(text.trim().length, `${code}:${key}`).toBeGreaterThan(0);
      }
    }

    expect(translate('zh', 'Return to Main Menu')).toBe('返回主菜单');
    expect(translate('zh', '3D Scene')).toBe('3D 场景');
    expect(translate('zh', 'Objective & Controls')).toBe('目标与说明');

    const zhHtml = renderToStaticMarkup(
      createElement(Topbar, {
        currentTab: 'mission',
        onTabChange: () => {},
        secondaryItems: buildLiftoffSecondaryItems('zh'),
        activeSecondaryId: 1
      })
    );
    expect(zhHtml).toContain('01 起飞与重力转弯');
    expect(zhHtml).toContain('02 级间分离');
    expect(zhHtml).toContain('03 轨道投入');
    expect(zhHtml).toContain('★ 完整发射');
  });
});

describe('LiftoffWorkspace shared propulsion and entry states', () => {
  it('renders Level 1 on the pad with Launch and the full propulsion panel', () => {
    const html = renderToStaticMarkup(
      createElement(LiftoffWorkspace, {
        initialVehicleId: 'saturn-v',
        initialActiveLevel: 1
      })
    );

    expect(html).toContain('liftoff-no-sidebar');
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('mission-goal-banner');
    expect(html).not.toContain('liftoff-stage-header');
    expect(html).not.toContain('liftoff-view-tabs');
    const toolbar = html.slice(html.indexOf('liftoff-scene-toolbar'), html.indexOf('class="scene-container"'));
    const labels = ['Orbit Map', 'Launch', 'Demo', 'Reset'];
    const positions = labels.map((label) => toolbar.indexOf(`aria-label="${label}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(toolbar).toMatch(/liftoff-toolbar-clock">00:00<\/span>\s*<div class="time-warp-group liftoff-warp-buttons"/);
    expect(toolbar).toContain('liftoff-warp-select');
    expect(toolbar).not.toContain('aria-label="Live Scene"');
    expect(toolbar).toContain('aria-label="Current Velocity Cue"');
    expect(toolbar).not.toContain('aria-label="Briefing"');
    expect(html.slice(html.indexOf('data-testid="ksp-navball-panel"'))).not.toContain('Current Velocity Cue');
    expect(html).toContain('Flight Parameters');
    expect(html).not.toContain('Peak Max-Q');
    expect(html).not.toContain('Isp ');
    expect(html).not.toContain('Dry:');
    expect(html).toContain('Fuel: 2146.0t / 2146t</span><span>130.4t</span>');
    expect(html).toContain('Apoapsis (Ap) is the farthest point');
    expect(html).toContain('Periapsis (Pe) is the closest point');
    expect(html.indexOf('Cut [X]')).toBeLessThan(html.indexOf('100% [Z]'));
    expect(html).toMatch(/<dt>Altitude<\/dt>.*?<dt>Orbital Speed<\/dt>.*?Ap<\/span>Apoapsis<\/dt>.*?Pe<\/span>Periapsis<\/dt>.*?<dt>TWR<\/dt>.*?<dt>G-Load<\/dt>.*?class="ksp-throttle-col"/);
    expect(html).toContain('−6362.5 km');
    expect(html).toContain('text-anchor="middle"');
    expect(html).not.toMatch(/Downrange \d|Mach \d/);
    expect(html).toContain('Multi-Stage Propulsion &amp; Staging');
    expect(html).toContain('Throttle slider');
    expect(html).toContain('liftoff-sequence-bar');
    expect(html).toContain('ksp-stage-stack');
    expect(html).toContain('STAGE · RELEASE CLAMPS [Space]');
    expect(html).toContain('Jettison LES Tower [J]');
    expect(html).not.toContain('liftoff-orbit-ribbon');
    expect(html).not.toContain('liftoff-composite-dock');
  });

  it.each([2, 3, 4])('starts Level %i in flight with Pause and the same propulsion panel', (level) => {
    const html = renderToStaticMarkup(
      createElement(LiftoffWorkspace, {
        initialVehicleId: 'saturn-v',
        initialActiveLevel: level
      })
    );

    expect(html).not.toContain('<aside');
    expect(html).not.toContain('mission-goal-banner');
    expect(html).not.toContain('liftoff-stage-header');
    expect(html).not.toContain('liftoff-view-tabs');
    expect(html).toContain('aria-label="Pause"');
    expect(html).not.toContain('aria-label="Launch"');
    expect(html).toContain('ksp-stage-stack');
    expect(html).toContain('Multi-Stage Propulsion &amp; Staging');
    expect(html).toContain(level === 4 ? 'STAGE · RELEASE CLAMPS [Space]' : 'STAGE · SEPARATION [Space]');
    expect(html).toContain('liftoff-sequence-bar');
    expect(html).toContain('liftoff-ascent-metrics');
    expect(html).toContain('Apoapsis</dt>');
    expect(html).toContain('<dt>Orbital Speed</dt>');
    expect(html).not.toContain('Apoapsis (Ap) is the farthest point');
    expect(html).not.toContain('liftoff-orbit-ribbon');
    expect(html).not.toContain('liftoff-composite-dock');
  });
});
