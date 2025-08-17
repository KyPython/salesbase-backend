-- Create user_settings table for storing user preferences
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    deal_updates BOOLEAN DEFAULT true,
    customer_alerts BOOLEAN DEFAULT true,
    weekly_reports BOOLEAN DEFAULT false,
    session_timeout INTEGER DEFAULT 30,
    password_expiry INTEGER DEFAULT 90,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Insert default settings for existing users
INSERT INTO user_settings (user_id, theme, language, timezone, email_notifications, sms_notifications, deal_updates, customer_alerts, weekly_reports, session_timeout, password_expiry)
SELECT 
    u.id,
    'light',
    'en',
    'UTC',
    true,
    false,
    true,
    true,
    false,
    30,
    90
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM user_settings us WHERE us.user_id = u.id
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_settings_updated_at 
    BEFORE UPDATE ON user_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
