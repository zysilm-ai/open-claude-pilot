import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]:`, msg.text());
  });

  // Listen to page errors
  page.on('pageerror', error => {
    console.error('[PAGE ERROR]:', error.message);
  });

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\nLooking for existing project...');
    const projectLinks = page.locator('[class*="project"]').first();
    const hasProject = await projectLinks.isVisible().catch(() => false);

    if (hasProject) {
      console.log('Found existing project, clicking...');
      await projectLinks.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('No projects found, you may need to create one first');
      await page.screenshot({ path: 'no-project.png' });
      await browser.close();
      return;
    }

    console.log('\nLooking for existing chat session...');
    const chatTab = page.locator('[class*="chat"]').first();
    const hasChat = await chatTab.isVisible().catch(() => false);

    if (!hasChat) {
      console.log('No chat session found, creating new one...');
      const newChatBtn = page.locator('button:has-text("New Chat")');
      const hasNewChatBtn = await newChatBtn.isVisible().catch(() => false);
      if (hasNewChatBtn) {
        await newChatBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    console.log('\nSending test message...');
    const messageInput = page.locator('textarea').first();
    const isInputVisible = await messageInput.isVisible();
    console.log('Message input visible:', isInputVisible);

    if (isInputVisible) {
      await messageInput.fill('Hello, this is a test message');
      await messageInput.press('Enter');
      console.log('Message sent!');

      console.log('\nWaiting 20 seconds for response...');
      await page.waitForTimeout(20000);

      // Check for error banner
      console.log('\n=== CHECKING FOR ERROR BANNER ===');
      const errorBanner = page.locator('.chat-error-banner');
      const errorVisible = await errorBanner.isVisible().catch(() => false);
      console.log('Error banner visible:', errorVisible);

      if (errorVisible) {
        const errorText = await errorBanner.textContent();
        console.log('Error banner text:', errorText);
      }

      // Check send button state
      console.log('\n=== CHECKING SEND BUTTON STATE ===');
      const sendButton = page.locator('button[type="submit"]').or(page.locator('button:has-text("Send")'));
      const sendBtnExists = await sendButton.count();
      console.log('Send button count:', sendBtnExists);

      if (sendBtnExists > 0) {
        const isDisabled = await sendButton.first().isDisabled();
        console.log('Send button disabled:', isDisabled);
      }

      // Check message input state
      const inputDisabled = await messageInput.isDisabled();
      console.log('Message input disabled:', inputDisabled);

      // Check for streaming indicators
      console.log('\n=== CHECKING STREAMING STATE ===');
      const streamingElements = page.locator('[class*="stream"]');
      const streamingCount = await streamingElements.count();
      console.log('Elements with "stream" in class:', streamingCount);

      // Take screenshot
      await page.screenshot({ path: 'error-state-check.png', fullPage: true });
      console.log('\nScreenshot saved to error-state-check.png');

      // Check what's actually in the chat
      console.log('\n=== CHECKING CHAT MESSAGES ===');
      const messages = page.locator('.message, [class*="message"]');
      const messageCount = await messages.count();
      console.log('Total messages:', messageCount);

      for (let i = 0; i < Math.min(messageCount, 5); i++) {
        const text = await messages.nth(i).textContent();
        console.log(`  Message ${i}:`, text?.substring(0, 100));
      }

      // Print the entire chat view HTML for debugging
      console.log('\n=== CHAT VIEW HTML ===');
      const chatView = page.locator('.chat-view');
      const chatHTML = await chatView.innerHTML().catch(() => 'Not found');
      console.log(chatHTML.substring(0, 1000));

      console.log('\n=== KEEPING BROWSER OPEN FOR 30 SECONDS ===');
      await page.waitForTimeout(30000);
    }

  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: 'error-state-failure.png' });
  } finally {
    await browser.close();
  }
})();
