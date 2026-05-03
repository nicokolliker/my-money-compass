ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_external_id_idx 
  ON transactions(external_id) WHERE external_id IS NOT NULL;