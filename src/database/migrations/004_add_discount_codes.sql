CREATE TABLE IF NOT EXISTS discount_codes (
    discount_code TEXT PRIMARY KEY NOT NULL,
    percentage INTEGER NOT NULL CHECK (percentage BETWEEN 1 AND 99),
    expires_at TEXT NOT NULL CHECK (
        length(expires_at) >= 20
        AND (substr(expires_at, -6) = '+00:00' OR substr(expires_at, -1) = 'Z')
    ),
    CHECK (
        length(discount_code) BETWEEN 1 AND 32
        AND discount_code = upper(trim(discount_code))
        AND substr(discount_code, 1, 1) GLOB '[A-Z0-9]'
        AND discount_code NOT GLOB '*[^A-Z0-9-]*'
    )
);

CREATE TABLE IF NOT EXISTS order_discount_snapshots (
    order_id INTEGER PRIMARY KEY NOT NULL,
    discount_code TEXT,
    percentage INTEGER NOT NULL CHECK (percentage BETWEEN 0 AND 99),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents > 0),
    discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
    CHECK (discount_cents < subtotal_cents),
    CHECK (
        (discount_code IS NULL AND percentage = 0 AND discount_cents = 0)
        OR
        (
            discount_code IS NOT NULL
            AND length(discount_code) BETWEEN 1 AND 32
            AND discount_code = upper(trim(discount_code))
            AND substr(discount_code, 1, 1) GLOB '[A-Z0-9]'
            AND discount_code NOT GLOB '*[^A-Z0-9-]*'
            AND percentage BETWEEN 1 AND 99
        )
    ),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
