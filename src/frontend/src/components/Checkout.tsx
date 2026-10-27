import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import axios from 'axios';
import {
  checkoutError,
  fetchBranches,
  fetchProducts,
  money,
  quoteCheckout,
  submitCheckout,
  unitCents,
  type CheckoutQuote,
  type PendingCheckout,
} from '../api/checkout';
import DiscountCodeForm from './DiscountCodeForm';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';

type QuoteKey = readonly ['checkout-quote', { productId: number; quantity: number }[], string | null];
const quoteKey = (items: { productId: number; quantity: number }[], code: string | null): QuoteKey =>
  ['checkout-quote', items, code];

export default function Checkout() {
  const cart = useCart();
  const { darkMode } = useTheme();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [method, setMethod] = useState<'demo-approved' | 'demo-declined'>('demo-approved');
  const [error, setError] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState('');
  const [reviewRequired, setReviewRequired] = useState(false);
  const currentItems = cart.items.map(({ productId, quantity }) => ({ productId, quantity }));
  const currentItemsKey = JSON.stringify(currentItems);
  const latestItemsKey = useRef(currentItemsKey);
  latestItemsKey.current = currentItemsKey;

  const products = useQuery('products', fetchProducts, { enabled: !cart.pending });
  const branches = useQuery('branches', fetchBranches, { enabled: !cart.pending });
  const lines = cart.items.map((item) => ({ ...item, product: products.data?.find((p) => p.productId === item.productId) }));
  const queryKey = quoteKey(currentItems, appliedCode);
  const quote = useQuery(
    queryKey,
    () => quoteCheckout({ items: currentItems, ...(appliedCode ? { discountCode: appliedCode } : {}) }),
    { enabled: !cart.pending && currentItems.length > 0, refetchOnWindowFocus: false },
  );

  const applyMutation = useMutation(async (input: { code: string; itemsKey: string }) => {
    const result = await quoteCheckout({
      items: currentItems,
      discountCode: input.code,
    });
    if (latestItemsKey.current !== input.itemsKey) {
      throw new Error('Your cart changed while checking the code. Review the cart and apply the code again.');
    }
    if (!result.discountCode) {
      throw new Error('The discount code was not applied. Review the code and try again.');
    }
    return { result, items: currentItems };
  }, {
    onSuccess: ({ result, items }) => {
      client.setQueryData(quoteKey(items, result.discountCode), result);
      setAppliedCode(result.discountCode);
      setPromoError('');
      setError('');
      setReviewRequired(false);
    },
    onError: (failure: unknown) => setPromoError(checkoutError(failure)),
  });

  const mutation = useMutation(async (attempt: PendingCheckout) => {
    const receipt = await submitCheckout(attempt.request);
    cart.complete(receipt, attempt);
    return receipt;
  }, {
    onSuccess: () => { setError(''); setPromoError(''); },
    onError: (failure: unknown) => {
      setError(checkoutError(failure));
      setPromoError('');
      if (axios.isAxiosError<{ error?: { code?: string } }>(failure) && failure.response &&
          [400, 402, 404, 409, 422].includes(failure.response.status)) {
        const code = failure.response.data?.error?.code;
        const needsReview = failure.response.status === 409 ||
          code === 'DISCOUNT_CODE_INVALID' || code === 'DISCOUNT_CODE_EXPIRED' ||
          code === 'DISCOUNT_TOTAL_INVALID';
        if (needsReview) {
          setReviewRequired(true);
        }
        try {
          cart.reject();
        } catch (storageFailure) {
          setError(checkoutError(storageFailure));
        }
        if (failure.response.status === 409 || needsReview) {
          void client.invalidateQueries('products');
          void client.invalidateQueries('checkout-quote');
        }
      }
    },
    retry: false,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isLoading || (!cart.pending &&
        (!quote.data || quote.isFetching || reviewRequired))) {
      return;
    }
    try {
      let attempt: PendingCheckout;
      if (cart.pending) {
        attempt = cart.pending;
      } else {
        const currentQuote = quote.data;
        if (!currentQuote) {
          return;
        }
        attempt = cart.begin({
          customerName: name.trim(),
          branchId: Number(branch),
          expectedTotalCents: currentQuote.totalCents,
          paymentMethod: method,
          ...(appliedCode ? { discountCode: appliedCode } : {}),
        }, currentQuote);
      }
      setError('');
      mutation.mutate(attempt);
    } catch (failure) {
      setError(checkoutError(failure));
    }
  };

  const apply = (code: string) => {
    setPromoError('');
    applyMutation.mutate({ code, itemsKey: currentItemsKey });
  };
  const removeCode = () => {
    setPromoError('');
    setAppliedCode(null);
    setReviewRequired(true);
  };
  const reviewUpdatedTotal = async () => {
    if (!quote.data || quote.isFetching || quote.isError) {
      return;
    }
    setReviewRequired(false);
    setPromoError('');
  };

  const panel = `p-6 rounded-lg space-y-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`;
  const input = 'block w-full mt-2 p-3 border border-gray-400 rounded text-gray-900 bg-white focus:ring-2 focus:ring-primary';
  const legacyPendingQuote: CheckoutQuote | undefined = cart.pending &&
    !cart.pending.request.discountCode && !cart.pending.pricing ? {
      currency: 'USD',
      subtotalCents: cart.pending.request.expectedTotalCents,
      discountCents: 0,
      totalCents: cart.pending.request.expectedTotalCents,
      discountCode: null,
      percentage: null,
    } : undefined;
  const currentQuote: CheckoutQuote | undefined = cart.pending?.pricing ?? legacyPendingQuote ?? quote.data;
  const ready = !!cart.pending || (lines.length > 0 && lines.every((line) => line.product) &&
    !products.isFetching && !products.isError && !branches.isLoading && !branches.isError &&
    !!quote.data && !quote.isFetching && !quote.isError && !reviewRequired &&
    quote.data.totalCents > 0 && quote.data.totalCents <= 99999999);

  return (
    <section className={`pt-24 pb-16 px-4 min-h-screen ${darkMode ? 'text-light' : 'text-gray-800'}`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">{cart.receipt && !cart.pending ? 'Demo order confirmed' : 'Checkout'}</h1>
        {cart.storageError && <p role="alert">{cart.storageError}</p>}
        {error && <p role="alert" className="border-l-4 border-red-500 p-4">{error}</p>}
        {cart.receipt && !cart.pending ? (
          <div className={`${panel} border-t-4 border-primary`}>
            <h2 className="text-xl font-bold">OctoCAT receipt - Order #{cart.receipt.order.orderId}</h2>
            <p role="status">Confirmed for {cart.receipt.order.name}. Payment was simulated; no money was charged.</p>
            <ul>{cart.receipt.items.map((item) => (
              <li key={item.productId} className="flex justify-between py-2 gap-4">
                <span>{products.data?.find((p) => p.productId === item.productId)?.name ?? `Product #${item.productId}`} x {item.quantity}</span>
                <span className="tabular-nums">{money(Math.round(item.unitPrice * 100) * item.quantity)}</span>
              </li>
            ))}</ul>
            <div className="space-y-1 tabular-nums">
              <p>Subtotal: {money(cart.receipt.subtotalCents ?? cart.receipt.totalCents)}</p>
              {cart.receipt.discountCode && <p>Discount ({cart.receipt.discountCode}): -{money(cart.receipt.discountCents ?? 0)}</p>}
              <p className="font-bold">Total (USD): {money(cart.receipt.totalCents)}</p>
            </div>
            <Link to="/products" className="underline">Continue shopping</Link>
          </div>
        ) : !cart.items.length && !cart.pending ? (
          <p>Your cart is empty. <Link to="/products" className="underline">Browse products</Link></p>
        ) : (
          <form onSubmit={submit} className="grid md:grid-cols-[1fr_20rem] gap-8">
            <div className={panel}>
              <p className="font-semibold">Demo payment only</p>
              <p>No real payment is taken. Do not enter real card details.</p>
              {cart.pending ? (
                <div role="status">
                  <h2 className="font-semibold">Saved checkout awaiting confirmation</h2>
                  <p>Retry the same attempt for {cart.pending.request.customerName}. Your cart stays locked until its outcome is known.</p>
                </div>
              ) : (
                <fieldset disabled={mutation.isLoading} className="space-y-4">
                  <div>
                    <label htmlFor="checkout-name">Customer name</label>
                    <input id="checkout-name" className={input} required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                  </div>
                  <div>
                    <label htmlFor="checkout-branch">Branch</label>
                    <select id="checkout-branch" className={input} required value={branch} onChange={(event) => setBranch(event.target.value)}>
                      <option value="">Select a branch</option>
                      {branches.data?.map((item) => <option key={item.branchId} value={item.branchId}>{item.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="checkout-method">Demo payment method</label>
                    <select id="checkout-method" className={input} value={method} onChange={(event) => setMethod(event.target.value === 'demo-declined' ? 'demo-declined' : 'demo-approved')}>
                      <option value="demo-approved">Demo payment - approved</option>
                      <option value="demo-declined">Demo payment - declined</option>
                    </select>
                  </div>
                </fieldset>
              )}
              {cart.pending ? (
                cart.pending.request.discountCode &&
                <p>Discount code: <strong>{cart.pending.request.discountCode}</strong></p>
              ) : (
                <DiscountCodeForm
                  appliedCode={appliedCode}
                  pending={mutation.isLoading}
                  applying={applyMutation.isLoading}
                  error={promoError || (quote.isError ? checkoutError(quote.error) : '')}
                  onApply={apply}
                  onRemove={removeCode}
                />
              )}
              {(products.isLoading || branches.isLoading || quote.isLoading || quote.isFetching) &&
                <p role="status">Refreshing prices and checkout details...</p>}
              {(products.isError || branches.isError) && !cart.pending && (
                <p role="alert">Checkout details could not be loaded. <button type="button" className="underline" onClick={() => { void products.refetch(); void branches.refetch(); }}>Retry loading</button></p>
              )}
              {!cart.pending && <Link to="/cart" className="inline-block underline">Back to cart / cancel checkout</Link>}
            </div>
            <aside className={`${panel} border-t-4 border-primary h-fit`}>
              <h2 className="text-xl font-semibold">OctoCAT order summary</h2>
              <ul className="divide-y divide-gray-400">
                {(cart.pending?.snapshot ?? lines).map((line) => {
                  const product = products.data?.find((p) => p.productId === line.productId);
                  return <li key={line.productId} className="py-3">
                    <span>{product?.name ?? `Product #${line.productId}`} x {line.quantity}</span>
                    {product && !cart.pending && <span className="block text-sm tabular-nums">{money(unitCents(product))} each</span>}
                  </li>;
                })}
              </ul>
              <div className="space-y-1 tabular-nums">
                <p className="flex justify-between"><span>Subtotal (USD)</span><strong>{money(currentQuote?.subtotalCents ?? 0)}</strong></p>
                {currentQuote?.discountCode && <p className="flex justify-between"><span>Discount ({currentQuote.discountCode})</span><strong>-{money(currentQuote.discountCents)}</strong></p>}
                <p className="flex justify-between"><strong>Total (USD)</strong><strong>{money(currentQuote?.totalCents ?? 0)}</strong></p>
              </div>
              <p className="text-sm">No tax or shipping. No real charge.</p>
              {reviewRequired && !cart.pending && (
                <div className="space-y-2">
                  <p role="status">Review the updated total before continuing. A discount is never silently removed.</p>
                  {quote.data && !quote.isFetching && !quote.isError &&
                    <button type="button" onClick={() => void reviewUpdatedTotal()} className="underline focus:ring-2 focus:ring-primary">
                      Review updated total
                    </button>}
                </div>
              )}
              {!ready && !cart.pending && !reviewRequired && <p role="status">Review your cart and checkout details before continuing.</p>}
              <button type="submit" disabled={!ready || mutation.isLoading || applyMutation.isLoading}
                className="w-full p-3 rounded bg-primary text-gray-900 font-semibold disabled:opacity-50 focus:ring-2 focus:ring-primary">
                {mutation.isLoading ? 'Confirming demo order...' : cart.pending ? 'Retry saved checkout' : 'Place demo order'}
              </button>
            </aside>
          </form>
        )}
      </div>
    </section>
  );
}
