import { test, expect } from '@playwright/test';

test.describe('Error Display', () => {
  test('should display API key error in UI when sending message without API key', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:5173');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Create a new project
    await page.click('button:has-text("New Project")');
    await page.fill('input[name="name"]', 'Test Project');
    await page.fill('textarea[name="description"]', 'Test project for error display');
    await page.click('button:has-text("Create")');

    // Wait for project to be created and page to navigate
    await page.waitForURL(/.*\/projects\/.*/);
    await page.waitForLoadState('networkidle');

    // Create a new chat session
    await page.click('button:has-text("New Chat")');
    await page.waitForTimeout(1000);

    // Send a message without API key configured
    const messageInput = page.locator('textarea[placeholder*="message"]').or(page.locator('input[placeholder*="message"]'));
    await messageInput.fill('Hello, can you help me?');
    await messageInput.press('Enter');

    // Wait for response
    await page.waitForTimeout(3000);

    // Take screenshot before checking
    await page.screenshot({ path: 'error-state-before.png', fullPage: true });

    // Check if error banner is visible
    const errorBanner = page.locator('.chat-error-banner');
    const isErrorVisible = await errorBanner.isVisible().catch(() => false);

    console.log('Error banner visible:', isErrorVisible);

    if (isErrorVisible) {
      const errorText = await errorBanner.textContent();
      console.log('Error text:', errorText);
    }

    // Check what's actually displayed in the chat
    const messages = page.locator('.message, .chat-message, [class*="message"]');
    const messageCount = await messages.count();
    console.log('Message count:', messageCount);

    for (let i = 0; i < messageCount; i++) {
      const text = await messages.nth(i).textContent();
      console.log(`Message ${i}:`, text);
    }

    // Take screenshot after checking
    await page.screenshot({ path: 'error-state-after.png', fullPage: true });

    // Check console logs for errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });

    // The error banner should be visible
    await expect(errorBanner).toBeVisible({ timeout: 5000 });

    // Error should mention API key
    await expect(errorBanner).toContainText(/API.*[Kk]ey|authentication|auth/i);
  });
});
