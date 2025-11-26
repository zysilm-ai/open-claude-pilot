import { test, expect } from '@playwright/test';

test.describe('Console Error Check', () => {
  const projectId = 'f75e06b1-bb07-430c-b82c-a0871adc67f4';
  const sessionId = '788de109-52ce-42e1-bc38-df28412f9d9f';
  const chatUrl = `http://localhost:5174/projects/${projectId}/chat/${sessionId}`;

  test('Assistant-UI version - Should not have console errors', async ({ page }) => {
    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.error('Console Error:', msg.text());
      }
    });

    // Enable assistant-ui
    await page.goto('http://localhost:5174/');
    await page.evaluate(() => {
      localStorage.setItem('enableAssistantUI', 'true');
    });

    // Navigate to chat and wait
    await page.goto(chatUrl);
    await page.waitForTimeout(2000); // Wait to catch any async errors

    // Check page content
    const pageContent = await page.content();
    console.log('Page HTML length:', pageContent.length);

    // Check if the page has visible content
    const chatPageVisible = await page.locator('.chat-session-page').isVisible().catch(() => false);
    const bodyColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    console.log('Chat page visible:', chatPageVisible);
    console.log('Body background color:', bodyColor);

    // Check for black screen (no content)
    const hasContent = await page.evaluate(() => {
      const body = document.body;
      return body.innerHTML.trim().length > 100;
    });

    console.log('Has content:', hasContent);

    // Report errors
    if (consoleErrors.length > 0) {
      console.error('Found console errors:', consoleErrors);
    }

    // Assertions
    expect(consoleErrors).toHaveLength(0);
    expect(hasContent).toBeTruthy();
    expect(chatPageVisible).toBeTruthy();
  });

  test('Check for React errors', async ({ page }) => {
    // Check for React error boundary
    page.on('pageerror', (error) => {
      console.error('Page error:', error.message);
    });

    await page.goto('http://localhost:5174/');
    await page.evaluate(() => {
      localStorage.setItem('enableAssistantUI', 'true');
    });

    await page.goto(chatUrl);

    // Check for React error overlay
    const reactError = await page.locator('iframe[title="React error overlay"]').count();
    console.log('React error overlay present:', reactError > 0);

    // Check if app root is rendered
    const appRoot = await page.locator('#root').count();
    const appContent = await page.locator('#root').innerHTML();
    console.log('App root exists:', appRoot > 0);
    console.log('App content length:', appContent.length);

    expect(reactError).toBe(0);
    expect(appRoot).toBeGreaterThan(0);
  });
});