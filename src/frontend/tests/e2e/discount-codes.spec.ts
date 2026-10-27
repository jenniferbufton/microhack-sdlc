import { test, expect } from './fixtures';

const campaignCode = process.env.E2E_DISCOUNT_CODE;
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3000';
const currency = (cents: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
}).format(cents / 100);

async function openCheckout(page: import('@playwright/test').Page) {
  await page.goto('/products');
  await page.locator('#increase-qty-1').click();
  await page.locator('#add-to-cart-1').click();
  await page.getByRole('link', { name: 'Cart (1 items)', exact: true }).click();
  await page.getByRole('link', { name: 'Checkout', exact: true }).first().click();
  await page.getByLabel('Customer name').fill('Discount Browser Customer');
  await page.getByLabel('Branch', { exact: true }).selectOption('1');
  await expect(page.getByRole('button', { name: 'Place demo order', exact: true })).toBeEnabled();
}

async function applyCode(page: import('@playwright/test').Page, code: string) {
  const quote = page.waitForResponse((response) => {
    if (response.url().endsWith('/api/checkout/quote') && response.request().method() === 'POST') {
      const body = response.request().postDataJSON();
      return body.discountCode?.trim().toUpperCase() === code.trim().toUpperCase();
    }
    return false;
  });
  await page.getByRole('textbox', { name: 'Discount code' }).fill(code);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  const response = await quote;
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
    discountCode: string;
  }>;
}

test.describe('discount codes', () => {
  test('applies a real campaign quote and records it on the order', async ({ page }) => {
    test.skip(!campaignCode, 'Set E2E_DISCOUNT_CODE to a test-only campaign in the isolated API database.');
    await openCheckout(page);
    const quote = await applyCode(page, ` ${campaignCode!.toLowerCase()} `);
    expect(quote.discountCode).toBe(campaignCode!.toUpperCase());
    expect(quote.discountCents).toBeGreaterThan(0);
    const summary = page.locator('aside');
    await expect(summary).toContainText(currency(quote.subtotalCents));
    await expect(summary).toContainText(currency(quote.discountCents));
    await expect(summary).toContainText(currency(quote.totalCents));

    const checkout = page.waitForResponse((response) =>
      response.url().endsWith('/api/checkout') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
    const response = await checkout;
    expect(response.status()).toBe(201);
    const receipt = await response.json();
    expect(receipt.discountCode).toBe(campaignCode!.toUpperCase());
    expect(receipt.discountCents).toBe(quote.discountCents);
    expect(receipt.subtotalCents - receipt.discountCents).toBe(receipt.totalCents);
    await expect(page.getByRole('heading', { name: 'Demo order confirmed' })).toBeVisible();
    await expect(page.locator('main')).toContainText(currency(receipt.totalCents));
  });

  test('cart quantity changes refresh the applied discount quote', async ({ page, context }) => {
    test.skip(!campaignCode, 'Set E2E_DISCOUNT_CODE to a test-only campaign in the isolated API database.');
    await openCheckout(page);
    await applyCode(page, campaignCode!);
    const otherTab = await context.newPage();
    await otherTab.goto('/cart');
    const updatedQuote = page.waitForResponse((response) =>
      response.url().endsWith('/api/checkout/quote') &&
      response.request().method() === 'POST' &&
      response.request().postDataJSON().items[0].quantity === 2 &&
      response.request().postDataJSON().discountCode === campaignCode!.toUpperCase());
    await otherTab.getByRole('spinbutton').fill('2');
    const response = await updatedQuote;
    expect(response.status()).toBe(200);
    const quote = await response.json();
    await expect(page.locator('aside')).toContainText(currency(quote.totalCents));
    await expect(page.getByText(`Applied code ${campaignCode!.toUpperCase()}`)).toBeVisible();
  });

  test('lost response replays the exact discounted attempt after reload', async ({ page, request }) => {
    test.skip(!campaignCode, 'Set E2E_DISCOUNT_CODE to a test-only campaign in the isolated API database.');
    await openCheckout(page);
    const quote = await applyCode(page, campaignCode!);
    let orderId = 0;
    await page.route('**/api/checkout', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      orderId = (await response.json()).order.orderId;
      await route.abort('failed');
    }, { times: 1 });
    await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not be confirmed');
    await page.reload();

    const replay = page.waitForResponse((response) =>
      response.url().endsWith('/api/checkout') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Retry saved checkout', exact: true }).click();
    const response = await replay;
    expect(response.status()).toBe(200);
    const receipt = await response.json();
    expect(receipt.order.orderId).toBe(orderId);
    expect(receipt.discountCode).toBe(campaignCode!.toUpperCase());
    expect(receipt.discountCents).toBe(quote.discountCents);
    const orders = await request.get(`${apiUrl}/api/orders`);
    expect((await orders.json()).filter((order: { orderId: number }) => order.orderId === orderId)).toHaveLength(1);
    await expect(page.getByRole('heading', { name: 'Demo order confirmed' })).toBeVisible();
  });

  test('invalid replacement preserves the last applied quote', async ({ page }) => {
    test.skip(!campaignCode, 'Set E2E_DISCOUNT_CODE to a test-only campaign in the isolated API database.');
    await openCheckout(page);
    const quote = await applyCode(page, campaignCode!);
    const summary = page.locator('aside');
    await expect(summary).toContainText(currency(quote.totalCents));

    const invalidQuote = page.waitForResponse((response) =>
      response.url().endsWith('/api/checkout/quote') &&
      response.request().method() === 'POST' &&
      response.request().postDataJSON().discountCode === 'NOT-A-TEST-CAMPAIGN');
    await page.getByRole('textbox', { name: 'Discount code' }).fill('NOT-A-TEST-CAMPAIGN');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    expect((await invalidQuote).status()).toBe(400);
    await expect(page.getByRole('alert')).toContainText('not valid');
    await expect(page.getByText(`Applied code ${campaignCode!.toUpperCase()}`)).toBeVisible();
    await expect(summary).toContainText(currency(quote.totalCents));
  });

  test('checkout expiry requires explicit removal and review', async ({ page }) => {
    test.skip(!campaignCode, 'Set E2E_DISCOUNT_CODE to a test-only campaign in the isolated API database.');
    await openCheckout(page);
    const quote = await applyCode(page, campaignCode!);
    await page.route('**/api/checkout', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'DISCOUNT_CODE_EXPIRED',
          message: 'This discount code has expired. Remove it or apply another valid code, then review your total.',
        },
      }),
    }), { times: 1 });
    await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('expired');
    await expect(page.getByText(`Applied code ${campaignCode!.toUpperCase()}`)).toBeVisible();
    await expect(page.locator('aside')).toContainText(currency(quote.totalCents));
    await expect(page.getByRole('button', { name: 'Place demo order', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Remove code' }).click();
    await expect(page.getByRole('button', { name: 'Review updated total' })).toBeVisible();
    await page.getByRole('button', { name: 'Review updated total' }).click();
    await expect(page.getByRole('button', { name: 'Place demo order', exact: true })).toBeEnabled();
  });
});
