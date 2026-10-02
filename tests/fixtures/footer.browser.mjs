import assert from 'node:assert/strict';

// Run against the settled public HTML with shared footer/capture scripts mounted.
// Capture configuration and feedback submission must be stubbed by the caller.
export async function verifySettledFooter(page, width) {
  await page.setViewportSize({width, height: 844});
  const capture = page.locator('saas-maker-newsletter-capture');
  const launcher = page.getByRole('button', {name: 'Give feedback'});
  await capture.locator('input[name="consent"]').waitFor();
  await launcher.waitFor();
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('saas-maker-newsletter-capture').shadowRoot;
    const button = document.querySelector('[data-saas-maker-feedback-launcher]');
    const rect = element => {
      const {left, top, right, bottom, width, height} = element.getBoundingClientRect();
      return {left, top, right, bottom, width, height};
    };
    const feedback = rect(button);
    const controls = [...root.querySelectorAll('input, select, button, .consent-row, .consent-copy, a')].map(rect);
    return {
      feedback,
      controls,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      overlaps: controls.some(box => box.left < feedback.right && box.right > feedback.left && box.top < feedback.bottom && box.bottom > feedback.top),
    };
  });
  assertFooterGeometry(geometry, width);
  const consent = capture.locator('input[name="consent"]');
  assert.equal(await consent.isChecked(), false, 'Consent must remain opt-in');
  await consent.focus();
  await page.keyboard.press('Space');
  assert.equal(await consent.isChecked(), true, 'Consent remains keyboard accessible');
  await page.keyboard.press('Space');
  await launcher.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.fixtureFeedbackOpened), true, 'Shared Feedback opens from keyboard');
  return geometry;
}

export function assertFooterGeometry(geometry, width) {
  assert.equal(geometry.overflow, false, `${width}px page overflow`);
  assert.equal(geometry.overlaps, false, `${width}px Feedback covers capture controls/consent`);
  assert(geometry.feedback.width >= 44 && geometry.feedback.height >= 44, 'Feedback touch target');
  for (const box of geometry.controls) {
    assert(box.left >= 0 && box.right <= width, `${width}px capture overflow`);
    assert(box.top >= 0 && box.bottom <= 844, `${width}px capture is outside the settled viewport`);
  }
}
