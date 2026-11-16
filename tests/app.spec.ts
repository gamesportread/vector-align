import { test, expect } from '@playwright/test';

test('entry home screen displays title, 6 options, switches mission details and enters docking simulation', async ({ page, isMobile }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');

  // 1. Verify Top-Left Title and Brand
  await expect(page.locator('.home-title')).toContainText('VECTOR');
  await expect(page.locator('.home-title')).toContainText('ALIGN');

  // 2. Verify all 6 options in Bottom-Left
  await expect(page.getByRole('button', { name: /^Liftoff/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Station Docking/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Departure/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Landing/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Options/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Credits & Acknowledgements/ })).toBeVisible();

  // 3. Verify Right-Side scenario card on default Mission 1 (Liftoff)
  await expect(page.locator('.scenario-card')).toBeVisible();
  await expect(page.getByText('Saturn V Apollo Launch')).toBeVisible();
  await expect(page.getByText('SLS · Artemis I Moon Rocket Launch')).toBeVisible();

  // 4. Enter Liftoff Level 1 and open the briefing from the scene toolbar.
  await page.getByRole('button', { name: /Saturn V Apollo Launch/ }).click();
  await expect(page.locator('aside.sidebar')).toHaveCount(0);
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await expect(page.locator('.topbar .brand')).not.toContainText('VECTORALIGN');
  await expect(page.locator('.home-return-btn')).toHaveCount(0);
  await expect(page.locator('.topbar [role="separator"]')).toBeVisible();
  await expect(page.locator('.liftoff-main .liftoff-stage-header')).toHaveCount(0);
  await expect(page.locator('.liftoff-main .scene-container canvas')).toBeVisible();
  await expect(page.locator('.mission-goal-banner')).toHaveCount(0);

  await expect(page.getByRole('button', { name: 'Flight log', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Field guide', exact: true })).toHaveCount(0);
  const liftoffToolbar = page.locator('.liftoff-scene-toolbar');
  const viewToggle = liftoffToolbar.locator('.liftoff-view-toggle');
  await expect(viewToggle).toHaveAccessibleName('Orbit Map');
  if (isMobile) {
    await expect(liftoffToolbar.getByRole('combobox', { name: 'Physics Time Warp' })).toBeVisible();
    await expect(viewToggle.locator('.liftoff-toolbar-label')).toBeHidden();
  } else {
    const timeline = liftoffToolbar.locator('.liftoff-sequence-bar');
    await expect.poll(() => timeline.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  const originalToggleWidth = (await viewToggle.boundingBox())?.width;
  await viewToggle.click();
  await expect(viewToggle).toHaveAccessibleName('Live Scene');
  expect((await viewToggle.boundingBox())?.width).toBe(originalToggleWidth);
  await viewToggle.click();
  const missionBriefing = page.locator('.topbar nav').getByRole('button', { name: 'Briefing', exact: true });
  await missionBriefing.click();
  const liftoffBriefing = page.getByRole('dialog', { name: 'Ascent Mission Briefing' });
  await expect(liftoffBriefing.getByText('PASS CRITERIA')).toBeVisible();
  await expect(liftoffBriefing.getByText('CONTROLS & HOW-TO')).toBeVisible();
  await liftoffBriefing.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: 'Return to Main Menu' }).click();

  // 5. Test clicking Mission 3 (Departure) -> ISS Undock enters Departure Level 1 directly & Topbar switches to Level 0
  await page.getByRole('button', { name: /^Departure/ }).click();
  await expect(page.getByText('ISS Radial Departure Corridor')).toBeVisible();
  await page.getByRole('button', { name: /ISS Radial Departure Corridor/ }).click();
  await expect(page.locator('.lesson-rail, .sidebar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Latch Release/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /00 Mission briefing/ }).click();
  await expect(page.getByText('Stage Briefing · Station Departure')).toBeVisible();
  await page.getByRole('button', { name: /Start Level 1.*Spring Push-off/ }).click();
  await expect(page.getByRole('heading', { name: /Latch Release/ }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Return to Main Menu' }).click();

  // 6. Test clicking Mission 4 (Landing) -> Apollo 11 enters Landing Level 1 directly & Topbar switches levels/Level 0
  await page.getByRole('button', { name: /^Landing/ }).click();
  await expect(page.getByText('Apollo 11 Pacific Splashdown Recovery')).toBeVisible();
  await page.getByRole('button', { name: /Apollo 11 Pacific Splashdown Recovery/ }).click();
  await expect(page.locator('.lesson-rail, .sidebar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Plasma Blackout/ }).first()).toBeVisible();
  await expect(page.locator('.landing-sequence-bar')).toBeVisible();
  await page.getByRole('button', { name: /03 Retro Cushion/ }).click();
  await expect(page.getByRole('heading', { name: /Retro Cushion/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /00 Mission briefing/ }).click();
  await expect(page.getByText('Stage Briefing · Capsule Landing')).toBeVisible();
  await page.getByRole('button', { name: /Start Level 1.*Survive 2000°C Plasma Blackout/ }).click();
  await expect(page.getByRole('heading', { name: /Plasma Blackout/ }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Return to Main Menu' }).click();

  // 7. Test Option 5 (Options) modal
  await page.getByRole('button', { name: /^Options/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Settings · Options')).toBeVisible();
  await page.getByRole('button', { name: /Close/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // 8. Test Option 6 (Credits) modal
  await page.getByRole('button', { name: /^Credits & Acknowledgements/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Credits & Acknowledgements' })).toBeVisible();
  await page.getByRole('button', { name: /Close/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // 9. Test clicking Option 2 (Station Docking) -> Enters Level 1 directly without sidebar, Topbar switches to Level 0
  await page.getByRole('button', { name: /^Station Docking/ }).click();
  await expect(page.getByText('ISS Standard Autonomous & Manual Docking')).toBeVisible();
  await page.getByRole('button', { name: /ISS Standard Autonomous & Manual Docking/ }).click();

  // Lands on Level 1 flight cockpit with Topbar secondary selector bar
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Learn to stop/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: '3D Scene' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Objective & Controls' })).toBeVisible();

  // Topbar '00 Mission briefing' switches to Level 0
  await page.getByRole('button', { name: /00 Mission briefing/ }).click();
  await expect(page.getByText('Stage Briefing · Station Docking')).toBeVisible();
  await expect(page.getByText('6-DOF & Inertial Counter-Thrust')).toBeVisible();

  // Click Start Level 1 flight training
  await page.getByRole('button', { name: /Launch Mission 01: Learn to Stop/ }).click();

  // Enters Level 1 flight cockpit
  await expect(page.getByRole('heading', { name: /Learn to stop/ })).toBeVisible();

  // Topbar has icon-only return to menu link
  const returnBtn = page.getByRole('link', { name: 'Return to Main Menu' });
  await expect(returnBtn).toBeVisible();
  await returnBtn.click();

  // Returned to Home screen!
  await expect(page.locator('.home-title')).toBeVisible();

  expect(errors).toEqual([]);
});

test('loads the flight surface and operates keyboard / touch', async ({ page, isMobile }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?screen=simulator');
  await expect(page.getByRole('heading', { name: /Learn to stop/ })).toBeVisible();
  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  if (isMobile) {
    await expect(page.locator('.scene-container')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Forward +', exact: true })).toBeInViewport();
  }
  await page.locator('.scene-container').click({ position: { x: 5, y: 60 } });
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyF');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset mission' }).click();
  await expect(page.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /03 Align the port/ }).click();
  await expect(page.getByRole('heading', { name: /Align the port/, level: 1 })).toBeVisible();
  await page.locator('.flight-actions').getByRole('button', { name: /Briefing/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /Close/ }).click({ force: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('demo completes, produces a debrief and persists the record without awarding progress', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?screen=simulator');
  await page.getByRole('button', { name: 'Watch demo', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 50000 });
  await expect(page.getByText('Mission accomplished.')).toBeVisible();
  await page.getByRole('button', { name: /Close/ }).click({ force: true });
  await page.reload();
  await page.getByRole('button', { name: 'Flight log', exact: true }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Your flight log' })).toBeVisible();
  await expect(page.getByText('Mission accomplished.')).toBeVisible();
});

test('guide and installation help remain accessible', async ({ page }) => {
  await page.goto('/?screen=simulator');
  await page.getByRole('button', { name: 'Field guide', exact: true }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Model & scientific boundaries' })).toBeVisible();
  await page.getByRole('button', { name: 'Install app' }).click();
  await expect(page.getByRole('dialog')).toContainText('Add to Home Screen');
});

test('cached lessons work offline and the scene fits the viewport', async ({ page, context, isMobile }) => {
  test.setTimeout(90000);
  await page.goto('/?screen=simulator');
  await expect(page.getByText('OFFLINE LESSONS READY', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: isMobile ? '/tmp/vector-align-mobile.png' : '/tmp/vector-align-desktop.png', fullPage: true });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Learn to stop/ })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('pointer thrust, cancellation and rotation preserve a usable flight surface', async ({ page, isMobile }) => {
  await page.goto('/?screen=simulator');
  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  const reverse = page.getByRole('button', { name: 'Forward +', exact: true });
  await reverse.scrollIntoViewIfNeeded();
  const rect = await reverse.boundingBox();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
  const speed = () => page.locator('.metric').nth(1).locator('strong').textContent();
  expect(parseFloat((await speed())!)).toBeLessThanOrEqual(0.65);
  await page.waitForTimeout(150);
  const coast = parseFloat((await speed())!);
  await page.waitForTimeout(350);
  expect(parseFloat((await speed())!)).toBeCloseTo(coast, 2);
  if (isMobile) {
    await page.screenshot({ path: '/tmp/vector-align-mobile-flight.png' });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.scene-container')).toBeInViewport();
    await expect(reverse).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '/tmp/vector-align-mobile-landscape.png' });
  }
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
});

test('handles collision failure, debrief modal and keyboard R retry cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?screen=simulator');
  await page.getByRole('button', { name: 'Take control', exact: true }).click();

  // Accelerate forward using test driver to cause spacecraft collision with the station
  await page.evaluate(() => {
    const r = (window as any).__runtime;
    if (r) {
      r.state.position = [0.95, 0, 0.45];
      r.state.velocity = [0, 0, -1.0];
      r.command.translation[2] = -1;
    }
  });

  await expect(page.locator('.scene-failure-overlay')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.failure-title')).toContainText('COLLISION TUMBLE');
  await expect(page.locator('.failure-actions').getByRole('button', { name: /Retry/ })).toBeVisible();

  await page.getByRole('button', { name: 'View Debrief' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('The Physics in Space')).toBeVisible();
  await expect(page.getByText('Flight Instructor Tips')).toBeVisible();

  await page.keyboard.press('KeyR');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
