-- Complete SalesBase CRM Database Schema

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'sales_rep' CHECK (role IN ('admin', 'manager', 'sales_rep')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create companies table
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    website VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    annual_revenue DECIMAL(15,2),
    employee_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    job_title VARCHAR(100),
    department VARCHAR(100),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create pipeline_stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create deals table
CREATE TABLE IF NOT EXISTS deals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    pipeline_stage_id INTEGER REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    value DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'USD',
    probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
    expected_close_date DATE,
    status VARCHAR(50) DEFAULT 'open',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user_settings table
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

-- Insert default pipeline stages
INSERT INTO pipeline_stages (name, description, display_order, probability, is_active) VALUES
('Lead', 'Initial contact or lead', 1, 10, true),
('Qualified', 'Lead has been qualified', 2, 25, true),
('Proposal', 'Proposal sent to prospect', 3, 50, true),
('Negotiation', 'In negotiation phase', 4, 75, true),
('Closed Won', 'Deal successfully closed', 5, 100, true),
('Closed Lost', 'Deal lost', 6, 0, true)
ON CONFLICT DO NOTHING;

-- Insert sample company
INSERT INTO companies (name, industry, website, phone, city, state, country) VALUES
('Acme Corporation', 'Technology', 'https://acme.com', '+1-555-0123', 'San Francisco', 'CA', 'USA')
ON CONFLICT DO NOTHING;

-- Insert sample user (password: password123)
INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES
('admin@salesbase.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin', 'User', 'admin')
ON CONFLICT DO NOTHING;

-- Insert sample contact
INSERT INTO contacts (company_id, first_name, last_name, email, job_title, is_primary) VALUES
(1, 'John', 'Doe', 'john.doe@acme.com', 'CEO', true)
ON CONFLICT DO NOTHING;

-- Insert sample deal
INSERT INTO deals (title, company_id, contact_id, pipeline_stage_id, value, probability, expected_close_date) VALUES
('Enterprise Software License', 1, 1, 3, 50000.00, 50, '2024-12-31')
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_company_id ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_stage_id ON deals(pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_companies_updated_at 
    BEFORE UPDATE ON companies 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at 
    BEFORE UPDATE ON contacts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at 
    BEFORE UPDATE ON deals 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at 
    BEFORE UPDATE ON user_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
