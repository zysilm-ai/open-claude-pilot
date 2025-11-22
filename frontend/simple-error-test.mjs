import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(text);
    console.log(`[CONSOLE ${msg.type()}]:`, text);
  });

  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
    console.log('[PAGE ERROR]:', error.message);
  });

  try {
    console.log('\n=== STEP 1: Navigate to app ===');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('\n=== STEP 2: Click on first project ===');
    const firstProject = page.locator('[class*="project"]').first();
    const hasProject = await firstProject.isVisible().catch(() => false);

    if (!hasProject) {
      console.log('No projects found. Please create a project first.');
      await browser.close();
      return;
    }

    await firstProject.click();
    await page.waitForTimeout(2000);

    console.log('\n=== STEP 3: Check for chat sessions or create new one ===');
    const chatExists = await page.locator('[class*="chat"]').first().isVisible().catch(() => false);

    if (!chatExists) {
      console.log('Creating new chat...');
      const newChatBtn = page.locator('button:has-text("New Chat")');
      if (await newChatBtn.isVisible().catch(() => false)) {
        await newChatBtn.click();
        await page.waitForTimeout(2000);
      }
    } else {
      console.log('Opening existing chat...');
      await page.locator('[class*="chat"]').first().click();
      await page.waitForTimeout(1000);
    }

    console.log('\n=== STEP 4: Send a test message ===');
    const messageInput = page.locator('textarea').first();
    const inputVisible = await messageInput.isVisible().catch(() => false);

    if (!inputVisible) {
      console.log('Message input not visible!');
      await page.screenshot({ path: 'error-input-not-visible.png' });
      await browser.close();
      return;
    }

    await messageInput.fill('test message');
    await messageInput.press('Enter');
    console.log('Message sent!');

    console.log('\n=== STEP 5: Wait 15 seconds and check for errors ===');
    await page.waitForTimeout(15000);

    console.log('\n=== CHECKING CONSOLE MESSAGES ===');
    const wsMessages = consoleMessages.filter(m => m.includes('[WS]'));
    console.log(`\nFound ${wsMessages.length} WebSocket messages:`);
    wsMessages.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg}`);
    });

    const errorLogs = consoleMessages.filter(m =>
      m.includes('error') || m.includes('Error') || m.includes('ERROR')
    );
    console.log(`\nFound ${errorLogs.length} error-related logs:`);
    errorLogs.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg}`);
    });

    console.log('\n=== CHECKING DOM ===');
    const errorBanner = page.locator('.chat-error-banner');
    const errorVisible = await errorBanner.isVisible().catch(() => false);
    console.log('Error banner visible:', errorVisible);

    if (errorVisible) {
      const errorText = await errorBanner.textContent();
      console.log('Error text:', errorText);
    }

    const sendButton = page.locator('button[type="submit"]').or(page.locator('button:has-text("Send")'));
    const btnCount = await sendButton.count();
    if (btnCount > 0) {
      const isDisabled = await sendButton.first().isDisabled();
      console.log('Send button disabled:', isDisabled);
    } else {
      console.log('Send button not found');
    }

    const inputDisabled = await messageInput.isDisabled().catch(() => 'unknown');
    console.log('Message input disabled:', inputDisabled);

    await page.screenshot({ path: 'simple-error-test.png', fullPage: true });
    console.log('\nScreenshot saved to simple-error-test.png');

    console.log('\n=== Keeping browser open for inspection (30 seconds) ===');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: 'simple-error-test-failure.png' });
  } finally {
    await browser.close();
  }
})();
