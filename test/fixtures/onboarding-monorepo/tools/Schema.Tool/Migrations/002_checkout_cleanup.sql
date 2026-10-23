ALTER TABLE catalog.products RENAME COLUMN unit_price TO price_minor;
ALTER TABLE sales.order_headers RENAME COLUMN note_to_picker TO delivery_instructions;
ALTER TABLE sales.order_headers DROP COLUMN legacy_discount_code;
