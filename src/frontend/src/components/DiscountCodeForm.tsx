import { useState, type KeyboardEvent } from 'react';

interface DiscountCodeFormProps {
  appliedCode: string | null;
  pending: boolean;
  applying: boolean;
  error: string;
  onApply: (code: string) => void;
  onRemove: () => void;
}

export default function DiscountCodeForm({
  appliedCode, pending, applying, error, onApply, onRemove,
}: DiscountCodeFormProps) {
  const [code, setCode] = useState('');
  const apply = () => {
    if (!pending && !applying && code.trim()) {
      onApply(code);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    }
  };

  return (
    <section aria-labelledby="discount-code-heading" className="space-y-3">
      <h3 id="discount-code-heading" className="font-semibold">Discount code</h3>
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="discount-code" className="sr-only">Discount code</label>
        <input
          id="discount-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={pending || applying}
          maxLength={64}
          autoComplete="off"
          className="min-w-0 flex-1 p-3 border border-gray-400 rounded text-gray-900 bg-white focus:ring-2 focus:ring-primary disabled:opacity-60"
          placeholder="Enter code"
        />
        <button type="button" onClick={apply} disabled={pending || applying || !code.trim()}
          className="px-4 py-2 rounded border border-primary text-primary font-semibold disabled:opacity-50 focus:ring-2 focus:ring-primary">
          {applying ? 'Checking...' : 'Apply'}
        </button>
      </div>
      {appliedCode && (
        <p role="status" className="flex flex-wrap items-center gap-2">
          <span>Applied code <strong>{appliedCode}</strong></span>
          <button type="button" onClick={onRemove} disabled={pending || applying}
            className="underline disabled:opacity-50 focus:ring-2 focus:ring-primary">
            Remove code
          </button>
        </p>
      )}
      {error && <p role="alert" className="text-red-600">{error}</p>}
    </section>
  );
}
