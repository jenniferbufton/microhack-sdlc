import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CartItem, CheckoutQuote, CheckoutReceipt, CheckoutRequest, PendingCheckout } from '../api/checkout';

const STORAGE_KEY = 'octocat-cart-v1';
interface CartState {
  items: CartItem[];
  pending: PendingCheckout | null;
  receipt: CheckoutReceipt | null;
}
const empty: CartState = { items: [], pending: null, receipt: null };
const positiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function createRequestId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isItems(value: unknown): value is CartItem[] {
  return Array.isArray(value) && value.length <= 100 && value.every((item: unknown) =>
    record(item) && positiveInt(item.productId) && positiveInt(item.quantity) &&
    item.quantity <= 999 && typeof item.revision === 'string') &&
    new Set(value.map((item: CartItem) => item.productId)).size === value.length;
}

function isPending(value: unknown): value is PendingCheckout {
  if (!record(value) || !record(value.request) || !isItems(value.snapshot) || !value.snapshot.length) {
    return false;
  }
  const request = value.request;
  const snapshot = value.snapshot;
  const pricing = value.pricing;
  if (!(pricing === undefined || isQuote(pricing))) {
    return false;
  }
  return typeof request.requestKey === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.requestKey) &&
    typeof request.customerName === 'string' && request.customerName.trim().length > 0 &&
    request.customerName.length <= 100 && positiveInt(request.branchId) &&
    positiveInt(request.expectedTotalCents) && request.expectedTotalCents <= 99999999 &&
    ['demo-approved', 'demo-declined'].includes(String(request.paymentMethod)) &&
    (request.discountCode === undefined || request.discountCode === null ||
      (typeof request.discountCode === 'string' && /^[A-Z0-9][A-Z0-9-]{0,31}$/.test(request.discountCode))) &&
    (typeof request.discountCode !== 'string' || pricing !== undefined) &&
    (pricing === undefined || (pricing.totalCents === request.expectedTotalCents &&
      pricing.discountCode === (typeof request.discountCode === 'string' ? request.discountCode : null))) &&
    Array.isArray(request.items) && request.items.length === snapshot.length &&
    request.items.every((item: unknown, index: number) =>
      record(item) && item.productId === snapshot[index].productId &&
      item.quantity === snapshot[index].quantity);
}

function isQuote(value: unknown): value is CheckoutQuote {
  return record(value) && value.currency === 'USD' &&
    positiveInt(value.subtotalCents) && value.subtotalCents <= 99999999 &&
    typeof value.discountCents === 'number' && Number.isSafeInteger(value.discountCents) && value.discountCents >= 0 &&
    positiveInt(value.totalCents) && value.totalCents <= 99999999 &&
    value.subtotalCents - value.discountCents === value.totalCents &&
    (value.discountCode === null || (typeof value.discountCode === 'string' &&
      /^[A-Z0-9][A-Z0-9-]{0,31}$/.test(value.discountCode))) &&
    (value.discountCode !== null || (value.discountCents === 0 && value.percentage === null)) &&
    (value.percentage === null || (typeof value.percentage === 'number' &&
      Number.isInteger(value.percentage) && value.percentage >= 1 && value.percentage <= 99));
}

function isReceipt(value: unknown): value is CheckoutReceipt {
  return record(value) && record(value.order) && positiveInt(value.order.orderId) &&
    positiveInt(value.order.branchId) && typeof value.order.name === 'string' &&
    value.order.status === 'confirmed' && value.currency === 'USD' && value.simulated === true &&
    positiveInt(value.totalCents) && Array.isArray(value.items) && value.items.length > 0 &&
    (value.subtotalCents === undefined || (positiveInt(value.subtotalCents) && value.subtotalCents <= 99999999)) &&
    (value.discountCents === undefined || (typeof value.discountCents === 'number' &&
      Number.isSafeInteger(value.discountCents) && value.discountCents >= 0)) &&
    (value.discountCode === undefined || value.discountCode === null ||
      (typeof value.discountCode === 'string' && /^[A-Z0-9][A-Z0-9-]{0,31}$/.test(value.discountCode))) &&
    (value.subtotalCents === undefined ||
      value.subtotalCents - (typeof value.discountCents === 'number' ? value.discountCents : 0) === value.totalCents) &&
    value.items.every((item: unknown) => record(item) && positiveInt(item.productId) &&
      positiveInt(item.quantity) && typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) && item.unitPrice > 0);
}

function readStorage(): CartState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return empty;
  }
  const value: unknown = JSON.parse(raw);
  if (!record(value) || !isItems(value.items) ||
      !(value.pending === null || isPending(value.pending)) ||
      !(value.receipt === null || isReceipt(value.receipt))) {
    throw new Error('Saved cart data is invalid. Reset it before checking out.');
  }
  return { items: value.items, pending: value.pending, receipt: value.receipt };
}

interface CartContextValue extends CartState {
  storageError: string;
  change: (productId: number, quantity: number, add?: boolean) => boolean;
  begin: (details: Omit<CheckoutRequest, 'requestKey' | 'items'>, pricing?: CheckoutQuote) => PendingCheckout;
  complete: (receipt: CheckoutReceipt, attempt: PendingCheckout) => void;
  reject: () => void;
  reset: () => void;
}
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [storageError, setStorageError] = useState('');
  const [state, setState] = useState<CartState>(empty);
  const writeFailed = useRef(false);
  const load = useCallback(() => {
    try {
      setState(readStorage());
      setStorageError('');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Saved cart could not be read.');
    }
  }, []);
  useEffect(() => {
    load();
    const listener = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        load();
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [load]);

  const latest = () => {
    if (writeFailed.current) {
      return state;
    }
    try {
      return readStorage();
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Saved cart could not be read.');
      return state;
    }
  };
  const save = (next: CartState, required = false) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      writeFailed.current = false;
      setStorageError('');
    } catch {
      writeFailed.current = true;
      const message = 'Cart could not be saved in this browser. You can edit it, but checkout requires working storage.';
      setStorageError(message);
      if (required) {
        throw new Error(message);
      }
    }
    setState(next);
  };

  const change = (productId: number, quantity: number, add = false) => {
    const current = latest();
    if (current.pending) {
      setStorageError('Resolve the saved checkout attempt before editing the cart.');
      return false;
    }
    const old = current.items.find((item) => item.productId === productId);
    const nextQuantity = add ? (old?.quantity ?? 0) + quantity : quantity;
    if (!Number.isInteger(nextQuantity) || nextQuantity < 0 || nextQuantity > 999 ||
        (!old && nextQuantity > 0 && current.items.length >= 100)) {
      setStorageError('Use quantities from 1 to 999 and no more than 100 different products.');
      return false;
    }
    const items = current.items.filter((item) => item.productId !== productId);
    if (nextQuantity) {
      items.push({ productId, quantity: nextQuantity, revision: createRequestId() });
    }
    save({ ...current, items, receipt: null });
    return true;
  };
  const begin = (details: Omit<CheckoutRequest, 'requestKey' | 'items'>, pricing?: CheckoutQuote) => {
    if (writeFailed.current) {
      throw new Error('Cart storage is unavailable. Save your cart successfully before checking out.');
    }
    const current = readStorage();
    if (current.pending) {
      return current.pending;
    }
    if (!current.items.length || JSON.stringify(current.items) !== JSON.stringify(state.items)) {
      setState(current);
      throw new Error('Your cart changed. Review it before placing the order.');
    }
    const pending: PendingCheckout = {
      request: { ...details, requestKey: createRequestId(), items: current.items.map(({ productId, quantity }) => ({ productId, quantity })) },
      snapshot: current.items,
      ...(pricing ? { pricing } : {}),
    };
    save({ ...current, pending, receipt: null }, true);
    return pending;
  };
  const complete = (receipt: CheckoutReceipt, attempt: PendingCheckout) => {
    const current = readStorage();
    const items = current.items.filter((item) => !attempt.snapshot.some(
      (purchased) => purchased.productId === item.productId && purchased.revision === item.revision));
    save({ items, pending: null, receipt }, true);
  };
  const reject = () => {
    save({ ...readStorage(), pending: null }, true);
  };
  const reset = () => {
    if (state.pending) {
      setStorageError('Retry the saved checkout before resetting the cart.');
      return;
    }
    save(empty);
  };

  return (
    <CartContext.Provider value={{ ...state, storageError, change, begin, complete, reject, reset }}>
      {children}
    </CartContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
