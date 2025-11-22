const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console messages
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text());
  });

  // Listen to page errors
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR]:`, error.message);
  });

  // Listen to WebSocket messages
  page.on('websocket', ws => {
    console.log(`WebSocket created: ${ws.url()}`);
    ws.on('framesent', frame => console.log(`→ WS SENT:`, frame.payload));
    ws.on('framereceived', frame => console.log(`← WS RECV:`, frame.payload));
  });

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    console.log('Creating project...');
    await page.click('button:has-text("New Project")');
    await page.fill('input[name="name"]', 'Test Project');
    await page.fill('textarea[name="description"]', 'Test');
    await page.click('button:has-text("Create")');

    await page.waitForURL(/.*\/projects\/.*/);
    await page.waitForLoadState('networkidle');

    console.log('Creating chat session...');
    await page.click('button:has-text("New Chat")');
    await page.waitForTimeout(2000);

    console.log('Sending message...');
    const messageInput = page.locator('textarea').first();
    await messageInput.fill('Hello, test message');
    await messageInput.press('Enter');

    console.log('Waiting for response...');
    await page.waitForTimeout(5000);

    // Check for error banner
    console.log('Checking for error banner...');
    const errorBanner = page.locator('.chat-error-banner');
    const isVisible = await errorBanner.isVisible().catch(() => false);
    console.log('Error banner visible:', isVisible);

    if (isVisible) {
      const errorText = await errorBanner.textContent();
      console.log('Error text:', errorText);
    } else {
      console.log('ERROR BANNER NOT FOUND!');

      // Check what's in the DOM
      console.log('\nChecking chat view structure...');
      const chatView = page.locator('.chat-view');
      const html = await chatView.innerHTML().catch(() => 'Chat view not found');
      console.log('Chat view HTML snippet:', html.substring(0, 500));

      // Check for any error-related elements
      const anyError = page.locator('[class*="error"]');
      const errorCount = await anyError.count();
      console.log('Elements with "error" in class:', errorCount);

      for (let i = 0; i < errorCount; i++) {
        const el = anyError.nth(i);
        const className = await el.getAttribute('class');
        const isVis = await el.isVisible().catch(() => false);
        console.log(`  - ${className} (visible: ${isVis})`);
      }
    }

    await page.screenshot({ path: 'error-test-screenshot.png', fullPage: true });
    console.log('Screenshot saved to error-test-screenshot.png');

    // Keep browser open for inspection
    console.log('\nBrowser will stay open for 30 seconds...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: 'error-test-failure.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
