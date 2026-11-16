import { test, expect } from '@playwright/test';

test.describe('Spaceship Hatch E2E Tests', () => {
  test.setTimeout(90000);

  test('initial hatch state is closed, pressing "1" opens it, and clicking toggles it back', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // 1. Open simulator surface
    await page.goto('/?screen=simulator');

    const hatchButton = page.locator('.hatch-btn');
    await expect(hatchButton).toBeVisible();

    // 2. Verify initial state is CLOSED
    await expect(hatchButton).toContainText(/Hatch:\s*CLOSED/);
    await expect(hatchButton).toHaveAttribute('aria-label', /Hatch control/);

    // 3. Test keyboard '1' / 'Digit1' triggers hatch opening
    // Click simulator container to ensure focus
    await page.locator('.scene-container').click({ position: { x: 50, y: 50 } });
    await page.keyboard.press('Digit1');

    // Button updates immediately to opening or open state
    await expect(hatchButton).toContainText(/Opening|Hatch:\s*OPEN/);

    // Wait for the ~2.0s servo opening animation to finish
    await expect(hatchButton).toContainText(/Hatch:\s*OPEN/, { timeout: 15000 });
    await expect(hatchButton).toHaveClass(/enabled/);

    // 4. Test clicking the HUD button toggles it back to closed (for mobile / mouse users)
    await hatchButton.click();

    // Button updates to closing or closed state
    await expect(hatchButton).toContainText(/Closing|Hatch:\s*CLOSED/);

    // Wait for the closing animation to finish
    await expect(hatchButton).toContainText(/Hatch:\s*CLOSED/, { timeout: 15000 });

    expect(errors).toEqual([]);
  });

  test('HUD button reflects state accurately during flight and keyboard trigger', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => {
      if (!e.message.includes('/models/orig.glb')) errors.push(e.message);
    });

    await page.goto('/?screen=simulator');

    const hatchButton = page.locator('.hatch-btn');
    await expect(hatchButton).toBeVisible();
    await expect(hatchButton).toContainText('Hatch: CLOSED [1]');

    // Press '1' to open
    await page.keyboard.press('Digit1');
    await expect(hatchButton).toContainText(/Hatch:\s*OPEN/i, { timeout: 15000 });

    expect(errors).toEqual([]);
  });

  test('displays interactive hatch banner during flight with teen explanations and opens on click', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/?screen=simulator');

    // Start flight
    await page.getByRole('button', { name: 'Take control', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    // With hatch closed, the interactive tip banner must be visible
    const banner = page.locator('.hatch-tip-banner');
    await expect(banner).toBeVisible();
    await expect(banner.locator('.hatch-tip-title')).toContainText('💡 Docking Tip: Press [1] (or tap here) to open the nosecone hatch!');
    await expect(banner.locator('.hatch-tip-desc')).toContainText('helmet visor for the spacecraft');
    await expect(banner.locator('.hatch-tip-desc')).toContainText('International Docking Adapter (IDA)');

    // Click banner to open hatch
    await banner.click();

    // Verify hatch button updates to opening/open
    const hatchButton = page.locator('.hatch-btn');
    await expect(hatchButton).toContainText(/Opening|Hatch:\s*OPEN/, { timeout: 15000 });
    await expect(hatchButton).toContainText(/Hatch:\s*OPEN/, { timeout: 15000 });

    // When hatch is open, banner should automatically disappear
    await expect(banner).not.toBeVisible();

    expect(errors).toEqual([]);
  });

  test('briefing modal and tour contain teen-friendly nosecone hatch and IDA explanations', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => {
      if (!e.message.includes('/models/orig.glb')) errors.push(e.message);
    });

    await page.goto('/?screen=simulator');

    // Open Mission Briefing Modal
    await page.getByRole('button', { name: /Briefing/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Nosecone Hatch: Just like a helmet visor for the spacecraft/)).toBeVisible();
    await expect(page.getByText(/International Docking Adapter \(IDA\)/)).toBeVisible();

    // Close modal (ensure modal-close can be clicked cleanly without interception)
    await page.getByRole('button', { name: /Close/ }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Open visual guide
    const guideBtn = page.getByRole('button', { name: /Visual guide/ });
    await guideBtn.scrollIntoViewIfNeeded();
    await guideBtn.click();
    await expect(page.getByRole('navigation', { name: /Guide steps/ })).toBeVisible();

    // Switch to step 2 "Your ship"
    const shipStepBtn = page.getByRole('button', { name: /Your ship/ }).or(page.locator('.intro-steps button').nth(1));
    await shipStepBtn.first().scrollIntoViewIfNeeded();
    await shipStepBtn.first().click();
    await expect(page.locator('.intro-steps button').nth(1)).toHaveClass(/active/);
    await expect(page.getByText(/helmet visor/)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('pressing 1 closes an open hatch cleanly (including key hold) in Docking and Departure', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Docking: open -> close (including key repeat hold) -> flying open -> flying close
    await page.goto('/?screen=simulator');
    const hatchBtn = page.locator('.hatch-btn').first();
    await expect(hatchBtn).toBeVisible();

    await page.keyboard.press('Digit1');
    await expect(hatchBtn).toContainText('Hatch: OPEN [1]', { timeout: 15000 });

    await page.keyboard.down('Digit1');
    await page.waitForTimeout(500);
    await page.keyboard.up('Digit1');
    await expect(hatchBtn).toContainText('Hatch: CLOSED [1]', { timeout: 15000 });

    await page.getByRole('button', { name: 'Take control', exact: true }).click();
    await page.keyboard.press('Digit1');
    await expect(hatchBtn).toContainText('Hatch: OPEN [1]', { timeout: 15000 });
    await page.keyboard.press('Digit1');
    await expect(hatchBtn).toContainText('Hatch: CLOSED [1]', { timeout: 15000 });

    // Departure: starts OPEN -> pressing 1 closes in ready & flying
    await page.goto('/?screen=simulator&program=departure');
    await expect(hatchBtn).toContainText('Hatch: OPEN [1]');
    await page.keyboard.press('Digit1');
    await expect(hatchBtn).toContainText('Hatch: CLOSED [1]', { timeout: 15000 });

    await page.keyboard.press('Numpad1');
    await expect(hatchBtn).toContainText('Hatch: OPEN [1]', { timeout: 15000 });
    await page.getByRole('button', { name: 'Start Departure', exact: true }).click();
    await page.keyboard.down('Digit1');
    await page.waitForTimeout(500);
    await page.keyboard.up('Digit1');
    await expect(hatchBtn).toContainText('Hatch: CLOSED [1]', { timeout: 15000 });

    expect(errors).toEqual([]);
  });
});
