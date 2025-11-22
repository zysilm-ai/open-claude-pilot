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

  try {
    console.log('Step 1: Navigate to app');
    await page.goto('http://localhost:5174');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('Step 2: Check for existing projects');
    const projectCards = await page.locator('.project-card, .project-item, [data-testid="project"]').count();
    console.log(`Found ${projectCards} projects`);

    let projectUrl = null;

    if (projectCards > 0) {
      console.log('Step 3: Click on first project');
      const firstProject = page.locator('.project-card, .project-item').first();
      await firstProject.click();
      await page.waitForTimeout(2000);
      projectUrl = page.url();
      console.log('Current URL:', projectUrl);
    } else {
      console.log('Step 3: Create new project');
      await page.click('button:has-text("New Project")');
      await page.fill('input[name="name"]', 'Test Project');
      await page.fill('textarea[name="description"]', 'Test Description');
      await page.click('button:has-text("Create")');
      await page.waitForURL(/.*\/projects\/.*/, { timeout: 10000 });
      projectUrl = page.url();
      console.log('Created project, URL:', projectUrl);
    }

    console.log('Step 4: Look for chat list or create new chat');
    await page.waitForTimeout(2000);

    // Try to find New Chat button
    const newChatBtn = page.locator('button:has-text("New Chat")');
    const hasNewChatBtn = await newChatBtn.isVisible().catch(() => false);

    if (hasNewChatBtn) {
      console.log('Creating new chat session...');
      await newChatBtn.click();
      await page.waitForTimeout(3000);
    } else {
      // Try to click on existing chat
      const chatItem = page.locator('[data-testid="chat-item"], .chat-item, .session-item').first();
      const hasChatItem = await chatItem.isVisible().catch(() => false);

      if (hasChatItem) {
        console.log('Clicking on existing chat...');
        await chatItem.click();
        await page.waitForTimeout(2000);
      } else {
        console.log('No New Chat button or existing chats found');
        await page.screenshot({ path: 'no-chat-ui.png' });
        const html = await page.locator('body').innerHTML();
        console.log('Page HTML:', html.substring(0, 1000));
        await browser.close();
        return;
      }
    }

    console.log('Step 5: Wait for chat interface');
    // Wait for either textarea in message input or the chat view
    await page.waitForSelector('.chat-view, [data-testid="chat-view"]', { timeout: 10000 });
    console.log('Chat view loaded');

    // Find the message input specifically in the chat view
    const messageInput = page.locator('.chat-view textarea, .message-input textarea, [placeholder*="message" i]').first();
    await messageInput.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Message input found');

    console.log('Step 6: Send test message');
    await messageInput.fill('test error message');
    await messageInput.press('Enter');
    console.log('Message sent!');

    console.log('Step 7: Wait 20 seconds for response/error');
    await page.waitForTimeout(20000);

    console.log('\n=== WEBSOCKET LOGS ===');
    const wsLogs = consoleMessages.filter(m => m.includes('[WS]'));
    console.log(`Found ${wsLogs.length} WebSocket messages:`);
    wsLogs.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg}`);
    });

    console.log('\n=== ERROR LOGS ===');
    const errorLogs = consoleMessages.filter(m =>
      (m.toLowerCase().includes('error') || m.includes('Setting error state')) &&
      !m.includes('devtools') &&
      !m.includes('Future Flag')
    );
    console.log(`Found ${errorLogs.length} error-related messages:`);
    errorLogs.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg}`);
    });

    console.log('\n=== ERROR BANNER CHECK ===');
    const errorBanner = page.locator('.chat-error-banner');
    const errorVisible = await errorBanner.isVisible().catch(() => false);
    console.log('Error banner visible:', errorVisible);

    if (errorVisible) {
      const errorText = await errorBanner.textContent();
      console.log('✓ Error banner text:', errorText);
    } else {
      console.log('✗ ERROR BANNER NOT VISIBLE');
      const errorCount = await errorBanner.count();
      console.log('Error banner elements in DOM:', errorCount);
    }

    console.log('\n=== UI STATE CHECK ===');
    const inputDisabled = await messageInput.isDisabled();
    console.log('Message input disabled:', inputDisabled);

    await page.screenshot({ path: 'test-error-final.png', fullPage: true });
    console.log('\nScreenshot saved');

  } catch (error) {
    console.error('Test error:', error.message);
    await page.screenshot({ path: 'test-error-exception.png' });
  } finally {
    await browser.close();
  }
})();
