-- Enterprise CRM Database Schema

-- Users and Authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'sales_rep',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Companies/Organizations
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    industry VARCHAR(100),
    size_category VARCHAR(50), -- 'startup', 'small', 'medium', 'enterprise'
    annual_revenue DECIMAL(15,2),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual Contacts
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    job_title VARCHAR(150),
    department VARCHAR(100),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales Pipeline Stages
CREATE TABLE pipeline_stages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER NOT NULL,
    win_probability DECIMAL(3,2), -- 0.00 to 1.00
    is_active BOOLEAN DEFAULT true
);

-- Sales Deals/Opportunities
CREATE TABLE deals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    pipeline_stage_id INTEGER REFERENCES pipeline_stages(id),
    value DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'USD',
    expected_close_date DATE,
    probability DECIMAL(3,2),
    description TEXT,
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'won', 'lost'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products/Services
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    unit_price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deal Products (Many-to-Many)
CREATE TABLE deal_products (
    id SERIAL PRIMARY KEY,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2),
    total_price DECIMAL(15,2),
    UNIQUE(deal_id, product_id)
);

-- Activities (Calls, Emails, Meetings, Notes)
CREATE TABLE activities (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- 'call', 'email', 'meeting', 'note', 'task'
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log for Enterprise Compliance
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Performance
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_deals_company ON deals(company_id);
CREATE INDEX idx_deals_stage ON deals(pipeline_stage_id);
CREATE INDEX idx_deals_assigned_user ON deals(assigned_user_id);
CREATE INDEX idx_activities_company ON activities(company_id);
CREATE INDEX idx_activities_user ON activities(user_id);
CREATE INDEX idx_activities_due_date ON activities(due_date);

-- Full-text search indexes
CREATE INDEX idx_companies_search ON companies USING GIN(to_tsvector('english', name || ' ' || COALESCE(industry, '')));
CREATE INDEX idx_contacts_search ON contacts USING GIN(to_tsvector('english', first_name || ' ' || last_name || ' ' || COALESCE(email, '')));

-- Create automation tables
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  from_stage_id INTEGER REFERENCES pipeline_stages(id),
  to_stage_id INTEGER REFERENCES pipeline_stages(id),
  changed_by_user_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  from_stage_id INTEGER REFERENCES pipeline_stages(id),
  to_stage_id INTEGER REFERENCES pipeline_stages(id),
  action_type VARCHAR(50) NOT NULL, -- 'create_task', 'send_email', 'update_probability'
  action_data JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automation_log (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES automation_rules(id),
  deal_id INTEGER REFERENCES deals(id),
  executed_by_user_id INTEGER REFERENCES users(id),
  execution_result VARCHAR(20) NOT NULL, -- 'success', 'failed'
  error_message TEXT,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_queue (
  id SERIAL PRIMARY KEY,
  deal_id INTEGER REFERENCES deals(id),
  recipient_user_id INTEGER REFERENCES users(id),
  template_name VARCHAR(100) NOT NULL,
  template_data JSONB,
  scheduled_at TIMESTAMP NOT NULL,
  sent_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending' -- 'pending', 'sent', 'failed'
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id VARCHAR(255),
  new_values JSONB,
  old_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Create indexes for performance
CREATE INDEX idx_deal_stage_history_deal_id ON deal_stage_history(deal_id);
CREATE INDEX idx_automation_rules_stages ON automation_rules(from_stage_id, to_stage_id);
CREATE INDEX idx_automation_log_deal_id ON automation_log(deal_id);
CREATE INDEX idx_email_queue_status ON email_queue(status, scheduled_at);