import axios from 'axios';
import { api } from './config';

export interface Product {
  productId: number;
  name: string;
  description: string | null;
  price: number;
  discount?: number;
  imgName: string | null;
  sku: string;
  unit: string;
  supplierId: number;
}

export interface CartItem {
  productId: number;
  quantity: number;
  revision: string;
}

export interface CheckoutRequest {
  requestKey: string;
  customerName: string;
  branchId: number;
  items: { productId: number; quantity: number }[];
  expectedTotalCents: number;
  paymentMethod: 'demo-approved' | 'demo-declined';
  discountCode?: string | null;
}

export interface CheckoutQuoteRequest {
  items: { productId: number; quantity: number }[];
  discountCode?: string | null;
}

export interface CheckoutQuote {
  currency: 'USD';
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  discountCode: string | null;
  percentage: number | null;
}

export interface CheckoutReceipt {
  order: { orderId: number; branchId: number; name: string; status: string };
  items: { productId: number; quantity: number; unitPrice: number }[];
  totalCents: number;
  currency: 'USD';
  simulated: true;
  subtotalCents?: number;
  discountCents?: number;
  discountCode?: string | null;
}

export interface PendingCheckout {
  request: CheckoutRequest;
  snapshot: CartItem[];
  pricing?: CheckoutQuote;
}

function decimalRatio(value: number): [bigint, bigint] {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  const digits = BigInt(whole + fraction);
  return scale >= 0 ? [digits, 10n ** BigInt(scale)] : [digits * 10n ** BigInt(-scale), 1n];
}

export function unitCents(product: Product): number {
  const discount = product.discount ?? 0;
  if (!Number.isFinite(product.price) || product.price <= 0 || product.price > 999999.99 ||
      !Number.isFinite(discount) || discount < 0 || discount >= 1) {
    throw new Error('A product has invalid pricing. Contact the store.');
  }
  const [price, priceScale] = decimalRatio(product.price);
  const [off, offScale] = decimalRatio(discount);
  const denominator = priceScale * offScale;
  const numerator = price * (offScale - off) * 100n;
  const cents = Number((numerator * 2n + denominator) / (denominator * 2n));
  if (cents <= 0) {
    throw new Error('A product price must be at least one cent.');
  }
  return cents;
}

export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export async function fetchProducts(): Promise<Product[]> {
  const { data } = await axios.get<Product[]>(`${api.baseURL}${api.endpoints.products}`);
  data.forEach(unitCents);
  return data;
}

export async function fetchBranches(): Promise<{ branchId: number; name: string }[]> {
  const { data } = await axios.get<{ branchId: number; name: string }[]>(`${api.baseURL}${api.endpoints.branches}`);
  return data;
}

export async function submitCheckout(request: CheckoutRequest): Promise<CheckoutReceipt> {
  const { data } = await axios.post<CheckoutReceipt>(`${api.baseURL}${api.endpoints.checkout}`, request);
  return data;
}

export async function quoteCheckout(request: CheckoutQuoteRequest): Promise<CheckoutQuote> {
  const { data } = await axios.post<CheckoutQuote>(`${api.baseURL}${api.endpoints.checkoutQuote}`, request);
  return data;
}

export function checkoutError(error: unknown): string {
  if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    return error.response?.data?.error?.message ??
      (error.response?.status === 422 ? 'Check your name, branch, quantities, and demo payment method.' :
        'Checkout could not be confirmed. Retry the saved attempt; your cart is unchanged.');
  }
  return error instanceof Error ? error.message : 'Checkout could not be confirmed. Your cart is unchanged.';
}
