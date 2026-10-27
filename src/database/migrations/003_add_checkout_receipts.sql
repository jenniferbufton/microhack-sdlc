CREATE TABLE IF NOT EXISTS checkout_receipts (
    request_key TEXT PRIMARY KEY NOT NULL,
    request_fingerprint TEXT NOT NULL,
    order_id INTEGER NOT NULL UNIQUE,
    currency TEXT NOT NULL CHECK (currency = 'USD'),
    total_cents INTEGER NOT NULL CHECK (total_cents > 0),
    response_json TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
