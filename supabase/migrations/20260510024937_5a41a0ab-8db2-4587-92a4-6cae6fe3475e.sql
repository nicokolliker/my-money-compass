ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS binance_api_key text,
  ADD COLUMN IF NOT EXISTS binance_api_secret text,
  ADD COLUMN IF NOT EXISTS binance_last_sync timestamptz,
  ADD COLUMN IF NOT EXISTS binance_balances jsonb;