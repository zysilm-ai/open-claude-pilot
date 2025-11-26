import { test, expect } from '@playwright/test';

test.describe('JavaScript Error Check', () => {
  const projectId = 'f75e06b1-bb07-430c-b82c-a0871adc67f4';
  const sessionId = '788de109-52ce-42e1-bc38-df28412f9d9f';
  const chatUrl = `http://localhost:5174/projects/${projectId}/chat/${sessionId}`;

  test('Assistant-UI version - Should not have JavaScript errors', async ({ page }) => {
    // Collect console errors (excluding CORS and network errors)
    const jsErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter out CORS and network errors which are expected in test environment
        if (!text.includes('CORS') &&
            !text.includes('Failed to load resource') &&
            !text.includes('WebSocket error') &&
            !text.includes('XMLHttpRequest')) {
          jsErrors.push(text);
          console.error('JavaScript Error:', text);
        }
      }
    });

    // Enable assistant-ui
    await page.goto('http://localhost:5174/');
    await page.evaluate(() => {
      localStorage.setItem('enableAssistantUI', 'true');
    });

    // Navigate to chat and wait
    await page.goto(chatUrl);
    await page.waitForTimeout(2000);

    // Check if the page renders properly
    const chatPageVisible = await page.locator('.chat-session-page').isVisible().catch(() => false);
    const headerVisible = await page.locator('.chat-header').isVisible().catch(() => false);
    const inputVisible = await page.locator('.chat-input').isVisible().catch(() => false);

    console.log('Chat page visible:', chatPageVisible);
    console.log('Header visible:', headerVisible);
    console.log('Input visible:', inputVisible);

    // Report JavaScript errors if any
    if (jsErrors.length > 0) {
      console.error('Found JavaScript errors:', jsErrors);
    }

    // Assertions
    expect(jsErrors).toHaveLength(0);
    expect(chatPageVisible).toBeTruthy();
    expect(headerVisible).toBeTruthy();
    expect(inputVisible).toBeTruthy();
  });
});