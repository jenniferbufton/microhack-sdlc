import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, run) => {
    if (process.env.E2E_API_URL) {
      await page.route('**/runtime-config.js', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: `window.RUNTIME_CONFIG = ${JSON.stringify({ API_URL: process.env.E2E_API_URL })};`,
      }));
    }
    await run(page);
  },
});

export { expect };
