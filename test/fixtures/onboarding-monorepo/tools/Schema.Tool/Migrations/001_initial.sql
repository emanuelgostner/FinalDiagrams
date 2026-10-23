CREATE SCHEMA catalog;
CREATE SCHEMA sales;

CREATE TABLE catalog.products (
    product_id uuid PRIMARY KEY,
    sku_code varchar(48) NOT NULL UNIQUE,
    display_name text NOT NULL,
    unit_price bigint NOT NULL CHECK (unit_price >= 0),
    currency_code varchar(3) NOT NULL
);

CREATE TABLE sales.order_headers (
    order_id uuid PRIMARY KEY,
    public_reference text NOT NULL UNIQUE,
    buyer_email text NOT NULL,
    total_minor bigint NOT NULL,
    currency_code varchar(3) NOT NULL,
    note_to_picker text,
    legacy_discount_code text,
    payment_authorization text
);

CREATE TABLE sales.order_items (
    order_id uuid NOT NULL REFERENCES sales.order_headers(order_id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES catalog.products(product_id) ON DELETE RESTRICT,
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price_minor bigint NOT NULL,
    PRIMARY KEY (order_id, product_id)
);

CREATE TABLE platform.idempotency_keys (
    request_key uuid PRIMARY KEY,
    response_payload jsonb NOT NULL,
    expires_at timestamptz NOT NULL
);
