import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    console.log('=== Step 1: Navigate to app ===');
    await page.goto('http://localhost:5174');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step1-homepage.png' });
    console.log('Screenshot: step1-homepage.png');

    console.log('\n=== Step 2: Navigate to project ===');
    // Get list of projects
    const projects = await page.locator('.project-card, .project-item, [data-testid="project-card"]').all();
    console.log(`Found ${projects.length} projects`);

    if (projects.length > 0) {
      await projects[0].click();
      await page.waitForTimeout(2000);
    } else {
      console.log('No existing projects, stopping test');
      await browser.close();
      return;
    }

    await page.screenshot({ path: 'step2-project-view.png' });
    console.log('Screenshot: step2-project-view.png');

    console.log('\n=== Step 3: Navigate to chat ===');
    // Look for existing chats
    const chats = await page.locator('[data-testid="chat-item"], .chat-item, .session-item').all();
    console.log(`Found ${chats.length} chat sessions`);

    if (chats.length > 0) {
      await chats[0].click();
      await page.waitForTimeout(2000);
    } else {
      // Try to create new chat
      const newChatBtn = page.locator('button:has-text("New Chat")');
      if (await newChatBtn.isVisible().catch(() => false)) {
        await newChatBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: 'step3-chat-view.png', fullPage: true });
    console.log('Screenshot: step3-chat-view.png');

    console.log('\n=== Step 4: Check for debug panel ===');
    const debugPanel = page.locator('div:has-text("ERROR STATE:")');
    const debugVisible = await debugPanel.isVisible().catch(() => false);
    console.log('Debug panel visible:', debugVisible);

    if (debugVisible) {
      const debugText = await debugPanel.textContent();
      console.log('Debug panel text:', debugText);
    }

    console.log('\n=== Step 5: Click test error button ===');
    const testBtn = page.locator('button:has-text("Test Error Banner")');
    const testBtnVisible = await testBtn.isVisible().catch(() => false);
    console.log('Test button visible:', testBtnVisible);

    if (testBtnVisible) {
      await testBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'step5-after-test-button.png', fullPage: true });
      console.log('Screenshot: step5-after-test-button.png');

      // Check debug panel again
      const debugText2 = await debugPanel.textContent().catch(() => 'not found');
      console.log('Debug panel after test button:', debugText2);

      // Check for error banner
      const errorBanner = page.locator('.chat-error-banner');
      const errorVisible = await errorBanner.isVisible().catch(() => false);
      console.log('Error banner visible:', errorVisible);

      if (errorVisible) {
        const errorText = await errorBanner.textContent();
        console.log('✓ ERROR BANNER TEXT:', errorText);
      } else {
        console.log('✗ Error banner NOT visible despite test button click');

        // Check if it exists in DOM
        const errorCount = await errorBanner.count();
        console.log('Error banner elements in DOM:', errorCount);
      }
    }

    console.log('\n=== Step 6: Send real message ===');
    const messageInput = page.locator('.chat-view textarea, [placeholder*="message" i]').first();
    const inputVisible = await messageInput.isVisible().catch(() => false);
    console.log('Message input visible:', inputVisible);

    if (inputVisible) {
      await messageInput.fill('trigger error');
      await messageInput.press('Enter');
      console.log('Message sent, waiting 15 seconds...');
      await page.waitForTimeout(15000);

      await page.screenshot({ path: 'step6-after-real-message.png', fullPage: true });
      console.log('Screenshot: step6-after-real-message.png');

      // Check debug panel
      const debugText3 = await debugPanel.textContent().catch(() => 'not found');
      console.log('Debug panel after real message:', debugText3);

      // Check error banner
      const errorBanner2 = page.locator('.chat-error-banner');
      const errorVisible2 = await errorBanner2.isVisible().catch(() => false);
      console.log('Error banner visible after real message:', errorVisible2);
    }

    console.log('\n=== Test complete ===');
    console.log('Check screenshots: step1-homepage.png, step2-project-view.png, step3-chat-view.png, step5-after-test-button.png, step6-after-real-message.png');

  } catch (error) {
    console.error('Test error:', error.message);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
