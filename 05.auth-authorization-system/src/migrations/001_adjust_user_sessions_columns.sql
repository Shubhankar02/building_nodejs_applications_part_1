BEGIN;
ALTER TABLE IF EXISTS user_sessions ALTER COLUMN session_token TYPE text;
ALTER TABLE IF EXISTS user_sessions ALTER COLUMN user_agent TYPE text;
ALTER TABLE IF EXISTS user_sessions ALTER COLUMN device_info TYPE jsonb USING device_info::jsonb;
COMMIT;
