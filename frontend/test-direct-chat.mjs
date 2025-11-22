import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Collect console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`[CONSOLE]: ${text}`);
  });

  try {
    const projectId = 'db140546-8918-4384-b06d-a363ff2d3345';
    const chatId = '90dad5ee-42c5-4d2e-9adf-5e7418d26919';

    console.log('=== Navigating directly to chat URL ===');
    await page.goto(`http://localhost:5174/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'direct-chat-1.png', fullPage: true });
    console.log('Screenshot: direct-chat-1.png');

    console.log('\n=== Checking for debug panel ===');
    const debugPanel = page.locator('div:has-text("ERROR STATE:")');
    const debugVisible = await debugPanel.isVisible().catch(() => false);
    console.log('Debug panel visible:', debugVisible);

    if (debugVisible) {
      const debugText = await debugPanel.textContent();
      console.log('Debug panel initial state:', debugText);
    }

    console.log('\n=== Looking for test button ===');
    const testBtn = page.locator('button:has-text("Test Error Banner")');
    const testBtnVisible = await testBtn.isVisible().catch(() => false);
    console.log('Test button visible:', testBtnVisible);

    if (testBtnVisible) {
      console.log('Clicking test button...');
      await testBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'direct-chat-2-after-test-btn.png', fullPage: true });
      console.log('Screenshot: direct-chat-2-after-test-btn.png');

      const debugText2 = await debugPanel.textContent().catch(() => 'not found');
      console.log('Debug panel after test button:', debugText2);

      const errorBanner = page.locator('.chat-error-banner');
      const errorVisible = await errorBanner.isVisible().catch(() => false);
      console.log('Error banner visible:', errorVisible);

      if (errorVisible) {
        const bbox = await errorBanner.boundingBox();
        console.log('Error banner position:', bbox);
        const errorText = await errorBanner.textContent();
        console.log('✓ ERROR BANNER FOUND:', errorText);
      } else {
        console.log('✗ Error banner NOT visible');
        const count = await errorBanner.count();
        console.log('Error banner count in DOM:', count);
      }
    }

    console.log('\n=== Checking console logs ===');
    const errorLogs = consoleLogs.filter(log =>
      log.includes('ERROR STATE') ||
      log.includes('[TEST]') ||
      log.includes('Setting error')
    );
    console.log('Relevant console logs:', errorLogs);

  } catch (error) {
    console.error('Test error:', error.message);
    await page.screenshot({ path: 'error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
