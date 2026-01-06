-- Discord Integration Schema Updates
-- Run this script to add Discord user integration support

-- Add Discord integration columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS discord_user_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS discord_username VARCHAR(255),
ADD COLUMN IF NOT EXISTS discord_discriminator VARCHAR(10),
ADD COLUMN IF NOT EXISTS discord_avatar VARCHAR(255),
ADD COLUMN IF NOT EXISTS discord_access_token TEXT,
ADD COLUMN IF NOT EXISTS discord_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS discord_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS discord_joined_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS discord_connected BOOLEAN DEFAULT FALSE;

-- Add unique constraint for Discord user ID
ALTER TABLE users ADD CONSTRAINT unique_discord_user_id UNIQUE (discord_user_id);

-- Add indexes for Discord lookups
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_users_discord_connected ON users(discord_connected);

-- Create Discord auth states table for OAuth2 security
CREATE TABLE IF NOT EXISTS discord_auth_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    state_token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

-- Index for auth state lookups
CREATE INDEX IF NOT EXISTS idx_discord_auth_states_token ON discord_auth_states(state_token);
CREATE INDEX IF NOT EXISTS idx_discord_auth_states_expires ON discord_auth_states(expires_at);

-- Clean up expired auth states (run this periodically)
-- DELETE FROM discord_auth_states WHERE expires_at < NOW();

-- Update existing users to set discord_connected = false
UPDATE users SET discord_connected = FALSE WHERE discord_user_id IS NULL;