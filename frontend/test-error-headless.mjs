import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(text);
    if (text.includes('[WS]') || text.includes('error') || text.includes('Error')) {
      console.log(`[CONSOLE ${msg.type()}]:`, text);
    }
  });

  // Collect page errors
  page.on('pageerror', error => {
    console.log('[PAGE ERROR]:', error.message);
  });

  try {
    console.log('Step 1: Navigate to app');
    await page.goto('http://localhost:5174');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('Step 2: Find and click on first project');
    const firstProject = page.locator('.project-item, [class*="project"]').first();
    await firstProject.waitFor({ state: 'visible', timeout: 5000 });
    await firstProject.click();
    await page.waitForTimeout(2000);

    console.log('Step 3: Look for chat list or chat view');
    // Try to find the chat list or existing chat
    const chatList = page.locator('.chat-item, [class*="chat-item"], [class*="session"]').first();
    const hasChatList = await chatList.isVisible().catch(() => false);

    if (hasChatList) {
      console.log('Found existing chat, clicking...');
      await chatList.click();
      await page.waitForTimeout(2000);
    } else {
      // Try to create new chat
      console.log('No existing chat found, looking for New Chat button');
      const newChatBtn = page.locator('button:has-text("New Chat"), button:has-text("New Session")');
      const hasBtn = await newChatBtn.isVisible().catch(() => false);

      if (hasBtn) {
        console.log('Creating new chat...');
        await newChatBtn.click();
        await page.waitForTimeout(3000);
      }
    }

    console.log('Step 4: Wait for message input to be visible');
    const messageInput = page.locator('textarea, input[type="text"]').first();

    try {
      await messageInput.waitFor({ state: 'visible', timeout: 10000 });
      console.log('Message input is visible');
    } catch (e) {
      console.log('Message input not visible after waiting. Taking screenshot...');
      await page.screenshot({ path: 'error-no-input.png' });

      // Print page structure for debugging
      const body = await page.locator('body').innerHTML();
      console.log('\n=== PAGE HTML (first 2000 chars) ===');
      console.log(body.substring(0, 2000));

      await browser.close();
      return;
    }

    console.log('Step 5: Send test message');
    await messageInput.fill('test message for error');
    await messageInput.press('Enter');
    console.log('Message sent, waiting for response...');

    console.log('Step 6: Wait 20 seconds for response and error');
    await page.waitForTimeout(20000);

    console.log('\n=== CHECKING WEBSOCKET LOGS ===');
    const wsLogs = consoleMessages.filter(m => m.includes('[WS]'));
    console.log(`Found ${wsLogs.length} WebSocket messages:`);
    wsLogs.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg}`);
    });

    console.log('\n=== CHECKING ERROR LOGS ===');
    const errorLogs = consoleMessages.filter(m =>
      m.toLowerCase().includes('error') && !m.includes('devtools')
    );
    console.log(`Found ${errorLogs.length} error-related messages:`);
    errorLogs.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg}`);
    });

    console.log('\n=== CHECKING ERROR BANNER ===');
    const errorBanner = page.locator('.chat-error-banner');
    const errorVisible = await errorBanner.isVisible().catch(() => false);
    console.log('Error banner visible:', errorVisible);

    if (errorVisible) {
      const errorText = await errorBanner.textContent();
      console.log('Error banner text:', errorText);
    } else {
      console.log('ERROR BANNER NOT VISIBLE!');

      // Check if error banner exists in DOM at all
      const errorCount = await errorBanner.count();
      console.log('Error banner count in DOM:', errorCount);

      if (errorCount > 0) {
        const display = await errorBanner.evaluate(el => window.getComputedStyle(el).display);
        const visibility = await errorBanner.evaluate(el => window.getComputedStyle(el).visibility);
        console.log('Error banner CSS display:', display);
        console.log('Error banner CSS visibility:', visibility);
      }
    }

    console.log('\n=== CHECKING SEND BUTTON STATE ===');
    const sendBtn = page.locator('button[type="submit"]').first();
    const btnExists = await sendBtn.count();

    if (btnExists > 0) {
      const isDisabled = await sendBtn.isDisabled();
      console.log('Send button disabled:', isDisabled);
    } else {
      console.log('Send button not found');
    }

    const inputDisabled = await messageInput.isDisabled();
    console.log('Message input disabled:', inputDisabled);

    await page.screenshot({ path: 'test-error-final.png', fullPage: true });
    console.log('\nScreenshot saved to test-error-final.png');

    console.log('\n=== TEST COMPLETE ===');

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: 'test-error-exception.png' });
  } finally {
    await browser.close();
  }
})();
