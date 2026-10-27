import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { fetchProducts, money, unitCents } from '../api/checkout';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';

export default function Cart() {
  const { items, pending, storageError, change, reset } = useCart();
  const { darkMode } = useTheme();
  const products = useQuery('products', fetchProducts);
  const lines = items.map((item) => ({ ...item, product: products.data?.find((p) => p.productId === item.productId) }));
  const total = lines.reduce((sum, line) => sum + (line.product ? unitCents(line.product) * line.quantity : 0), 0);
  const unavailable = lines.some((line) => !line.product);

  return (
    <section className={`pt-24 pb-16 px-4 min-h-screen ${darkMode ? 'text-light' : 'text-gray-800'}`}>
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Your cart</h1>
        {storageError && <div role="alert">{storageError} {!pending && <button className="underline" onClick={reset}>Reset saved cart</button>}</div>}
        {pending && <p role="status">A checkout is awaiting confirmation. <Link className="underline" to="/checkout">Retry saved checkout</Link> before editing.</p>}
        {products.isLoading && <p role="status">Loading current prices...</p>}
        {products.isError && <p role="alert">Products could not be loaded. <button className="underline" onClick={() => products.refetch()}>Retry</button></p>}
        {!items.length ? (
          <p>Your cart is empty. <Link className="underline" to="/products">Browse products</Link></p>
        ) : (
          <div className="grid md:grid-cols-[1fr_18rem] gap-8">
            <ul className="space-y-4">
              {lines.map((line) => (
                <li key={line.productId} className={`p-5 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} space-y-3`}>
                  <h2 className="font-semibold">{line.product?.name ?? `Unavailable product #${line.productId}`}</h2>
                  {line.product && <p className="tabular-nums">{money(unitCents(line.product))} each</p>}
                  <label className="flex items-center gap-3">
                    Quantity for {line.product?.name ?? line.productId}
                    <input type="number" min="1" max="999" value={line.quantity} disabled={!!pending}
                      className="w-20 p-2 rounded text-gray-900 border border-gray-400 focus:ring-2 focus:ring-primary"
                      onChange={(event) => change(line.productId, Number(event.target.value))} />
                  </label>
                  <button disabled={!!pending} className="underline disabled:opacity-50" onClick={() => change(line.productId, 0)}>
                    Remove {line.product?.name ?? 'product'}
                  </button>
                </li>
              ))}
            </ul>
            <aside className={`p-6 rounded-lg h-fit space-y-4 border-t-4 border-primary ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <h2 className="text-xl font-semibold">Order summary</h2>
              <p className="flex justify-between tabular-nums"><span>Subtotal (USD)</span><strong>{money(total)}</strong></p>
              <p className="text-sm">Demo checkout only. No tax, shipping, or real charge.</p>
              {unavailable && !products.isLoading && <p role="alert">Remove unavailable products before checking out.</p>}
              {pending || (!unavailable && !products.isLoading && !products.isError) ? (
                <Link to="/checkout" className="block rounded bg-primary text-gray-900 text-center font-semibold p-3 focus:ring-2 focus:ring-primary">
                  {pending ? 'Retry saved checkout' : 'Checkout'}
                </Link>
              ) : null}
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
