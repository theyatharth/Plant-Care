-- Add profile photo URL field to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_users_profile_photo ON users(profile_photo_url);