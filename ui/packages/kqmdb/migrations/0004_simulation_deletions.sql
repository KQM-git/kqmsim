ALTER TABLE simulations ADD COLUMN deleted_at INTEGER;
ALTER TABLE simulations ADD COLUMN deleted_by TEXT;
ALTER TABLE simulations ADD COLUMN deletion_reason TEXT;
