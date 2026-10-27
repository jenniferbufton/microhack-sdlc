import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3000';
const storageKey = 'octocat-cart-v1';
async function addProduct(page: Page) {
  await page.goto('/products');
  await expect(page.locator('#increase-qty-1')).toBeVisible();
  await page.locator('#increase-qty-1').click();
  await page.locator('#add-to-cart-1').click();
  await page.getByRole('link', { name: 'Cart (1 items)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
}

async function checkoutForm(page: Page) {
  await page.getByRole('link', { name: 'Checkout', exact: true }).first().click();
  await page.getByLabel('Customer name').fill('Browser Test Customer');
  await page.getByLabel('Branch', { exact: true }).selectOption('1');
  await expect(page.getByRole('button', { name: 'Place demo order', exact: true })).toBeEnabled();
}

test('cart quantity, persistence, remove and empty state', async ({ page }) => {
  await addProduct(page);
  const quantity = page.getByRole('spinbutton');
  await quantity.fill('3');
  await page.reload();
  await expect(page.getByRole('spinbutton')).toHaveValue('3');
  await expect(page.getByRole('link', { name: 'Cart (3 items)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Remove / }).click();
  await expect(page.getByText('Your cart is empty.')).toBeVisible();
});

test('real API checkout creates order and clears cart', async ({ page, request }) => {
  await addProduct(page);
  await checkoutForm(page);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/checkout') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  await expect(page.getByRole('heading', { name: 'Demo order confirmed' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Cart (0 items)', exact: true })).toBeVisible();
  const persisted = await request.get(`${apiUrl}/api/orders/${receipt.order.orderId}`);
  expect((await persisted.json()).status).toBe('confirmed');
  const details = await request.get(`${apiUrl}/api/order-details`);
  expect((await details.json()).filter((item: { orderId: number }) => item.orderId === receipt.order.orderId)).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Demo order confirmed' })).toBeVisible();
});

test('decline and cancellation retain cart and allow correction', async ({ page }) => {
  await addProduct(page);
  await checkoutForm(page);
  await page.getByRole('link', { name: 'Back to cart / cancel checkout' }).click();
  await expect(page.getByRole('spinbutton')).toHaveValue('1');
  await checkoutForm(page);
  await page.getByLabel('Demo payment method').selectOption('demo-declined');
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('declined');
  await expect(page.getByRole('link', { name: 'Cart (1 items)', exact: true })).toBeVisible();
  await page.getByLabel('Demo payment method').selectOption('demo-approved');
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Demo order confirmed' })).toBeVisible();
});

test('lost success response recovers the same order after reload', async ({ page, request }) => {
  await addProduct(page);
  await checkoutForm(page);
  let createdOrderId = 0;
  await page.route('**/api/checkout', async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    createdOrderId = (await response.json()).order.orderId;
    await route.abort('failed');
  }, { times: 1 });
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await expect(page.getByRole('link', { name: 'Cart (1 items)', exact: true })).toBeVisible();
  await page.reload();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/checkout'));
  await page.getByRole('button', { name: 'Retry saved checkout', exact: true }).click();
  const replay = await responsePromise;
  expect(replay.status()).toBe(200);
  expect((await replay.json()).order.orderId).toBe(createdOrderId);
  await expect(page.getByRole('heading', { name: 'Demo order confirmed' })).toBeVisible();
  const orders = await request.get(`${apiUrl}/api/orders`);
  expect((await orders.json()).filter((order: { orderId: number }) => order.orderId === createdOrderId)).toHaveLength(1);
});

test('network failure retains a locked attempt and same request key', async ({ page }) => {
  await addProduct(page);
  await checkoutForm(page);
  let key = '';
  await page.route('**/api/checkout', async (route) => {
    const next = route.request().postDataJSON().requestKey;
    if (key) {
      expect(next).toBe(key);
    }
    key = next;
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await page.reload();
  await page.getByRole('button', { name: 'Retry saved checkout', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');
  await page.getByRole('link', { name: 'Cart (1 items)', exact: true }).click();
  await expect(page.getByRole('spinbutton')).toBeDisabled();
});

test('stale prices require review before a new attempt', async ({ page }) => {
  await addProduct(page);
  await checkoutForm(page);
  await page.route('**/api/checkout', (route) => route.fulfill({
    status: 409, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'CONFLICT', message: 'Product prices changed. Review the refreshed cart total before trying again' } }),
  }), { times: 1 });
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('prices changed');
  await expect(page.getByLabel('Customer name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place demo order', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Review updated total' }).click();
  await expect(page.getByRole('button', { name: 'Place demo order', exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Cart (1 items)', exact: true })).toBeVisible();
});

test('items changed in another tab survive a completed attempt', async ({ page, context }) => {
  await addProduct(page);
  await checkoutForm(page);
  const other = await context.newPage();
  await other.goto('/cart');
  await page.route('**/api/checkout', async (route) => {
    await other.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key)!);
      state.items.push({ productId: 2, quantity: 1, revision: 'cross-tab-revision' });
      localStorage.setItem(key, JSON.stringify(state));
    }, storageKey);
    await route.continue();
  });
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Demo order confirmed' })).toBeVisible();
  await page.getByRole('link', { name: 'Cart (1 items)', exact: true }).click();
  await expect(page.getByRole('spinbutton')).toHaveValue('1');
  await expect(page.locator('main')).toContainText('AutoClean Litter Dome');
});

test('mobile dark checkout supports keyboard and fits viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addProduct(page);
  await page.getByRole('button', { name: 'Toggle dark/light mode' }).click();
  await checkoutForm(page);
  await page.getByLabel('Customer name').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Branch', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Demo order confirmed' })).toBeVisible();
});

test('corrupt saved cart is reported and can be reset', async ({ page }) => {
  await page.goto('/cart');
  await page.evaluate((key) => localStorage.setItem(key, '{invalid'), storageKey);
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Reset saved cart' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Your cart is empty.')).toBeVisible();
});

test('cart uses half-up unit cents before multiplying quantities', async ({ page }) => {
  await page.route('**/api/products', async (route) => {
    const response = await route.fetch();
    const products = await response.json();
    products[0].price = 1.005;
    products[0].discount = 0;
    await route.fulfill({ json: products });
  });
  await addProduct(page);
  await expect(page.getByText('$1.01 each', { exact: true })).toBeVisible();
  await page.getByRole('spinbutton').fill('3');
  await expect(page.getByText('$3.03', { exact: true })).toBeVisible();
});

test('storage write failures keep an in-memory cart but block payment', async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) {
        throw new DOMException('Storage is full', 'QuotaExceededError');
      }
      return original.call(this, name, value);
    };
  }, storageKey);
  await addProduct(page);
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await page.getByRole('spinbutton').fill('2');
  await expect(page.getByRole('link', { name: 'Cart (2 items)', exact: true })).toBeVisible();
  await checkoutForm(page);
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  await expect(page.getByRole('alert').last()).toContainText('storage is unavailable');
  await expect(page.getByRole('link', { name: 'Cart (2 items)', exact: true })).toBeVisible();
});
