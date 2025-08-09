-- Add full-text search columns and indexes

-- Add search vectors to companies
ALTER TABLE companies ADD COLUMN search_vector tsvector;

-- Add search vectors to contacts  
ALTER TABLE contacts ADD COLUMN search_vector tsvector;

-- Add search vectors to deals
ALTER TABLE deals ADD COLUMN search_vector tsvector;

-- Create function to update company search vector
CREATE OR REPLACE FUNCTION update_company_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.industry, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.website, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.city, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.country, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to update contact search vector
CREATE OR REPLACE FUNCTION update_contact_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.first_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.last_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.job_title, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.department, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to update deal search vector
CREATE OR REPLACE FUNCTION update_deal_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER company_search_update 
  BEFORE INSERT OR UPDATE ON companies 
  FOR EACH ROW EXECUTE FUNCTION update_company_search_vector();

CREATE TRIGGER contact_search_update 
  BEFORE INSERT OR UPDATE ON contacts 
  FOR EACH ROW EXECUTE FUNCTION update_contact_search_vector();

CREATE TRIGGER deal_search_update 
  BEFORE INSERT OR UPDATE ON deals 
  FOR EACH ROW EXECUTE FUNCTION update_deal_search_vector();

-- Create GIN indexes for fast full-text search
CREATE INDEX idx_companies_search ON companies USING GIN(search_vector);
CREATE INDEX idx_contacts_search ON contacts USING GIN(search_vector);
CREATE INDEX idx_deals_search ON deals USING GIN(search_vector);

-- Update existing records
UPDATE companies SET search_vector = 
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(industry, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(website, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(city, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(country, '')), 'D');

UPDATE contacts SET search_vector = 
  setweight(to_tsvector('english', COALESCE(first_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(last_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(email, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(job_title, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(department, '')), 'D');

UPDATE deals SET search_vector = 
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B');