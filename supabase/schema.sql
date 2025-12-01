-- Sayman Finance App Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE tenant_type AS ENUM ('personal', 'retail', 'service');
CREATE TYPE user_role AS ENUM ('owner', 'manager', 'viewer');
CREATE TYPE account_type AS ENUM ('bank', 'cash', 'credit');
CREATE TYPE category_type AS ENUM ('income', 'expense', 'transfer', 'cogs');
CREATE TYPE contact_type AS ENUM ('vendor', 'customer');
CREATE TYPE bill_status AS ENUM ('unpaid', 'partial', 'paid');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'partial', 'paid');
CREATE TYPE invoice_layout AS ENUM ('service', 'product');
CREATE TYPE transaction_status AS ENUM ('cleared', 'pending');

-- ============================================
-- TABLES
-- ============================================

-- Profiles (synced from auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenants (Organizations/Workspaces)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type tenant_type NOT NULL DEFAULT 'personal',
  currency TEXT NOT NULL DEFAULT 'USD',
  logo_url TEXT,
  address_details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant Users (Many-to-Many with roles)
CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- Accounts (Bank, Cash, Credit)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type account_type NOT NULL DEFAULT 'bank',
  balance NUMERIC(15, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type category_type NOT NULL DEFAULT 'expense',
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts (Vendors & Customers)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type contact_type NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  tax_id TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bills (Accounts Payable)
CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  bill_number TEXT,
  status bill_status NOT NULL DEFAULT 'unpaid',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  total_amount NUMERIC(15, 2) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices (Accounts Receivable)
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  invoice_number TEXT,
  status invoice_status NOT NULL DEFAULT 'draft',
  layout_type invoice_layout NOT NULL DEFAULT 'product',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  total_amount NUMERIC(15, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice Lines
CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) DEFAULT 1,
  unit_price NUMERIC(15, 2) NOT NULL,
  tax_rate NUMERIC(5, 2) DEFAULT 0,
  total NUMERIC(15, 2) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (Cash Flow)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(15, 2) NOT NULL, -- Negative for expense, Positive for income
  description TEXT,
  status transaction_status NOT NULL DEFAULT 'cleared',
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read/update their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Tenants: Users can only see tenants they belong to
CREATE POLICY "Tenant isolation" ON tenants
  FOR ALL USING (
    id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

-- Tenant Users: Users can see their own memberships
CREATE POLICY "View own tenant memberships" ON tenant_users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Owners can manage tenant users" ON tenant_users
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users 
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Helper function to check tenant access
CREATE OR REPLACE FUNCTION user_has_tenant_access(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tenant_users 
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Accounts: Tenant isolation
CREATE POLICY "Tenant isolation" ON accounts
  FOR ALL USING (user_has_tenant_access(tenant_id));

-- Categories: Tenant isolation
CREATE POLICY "Tenant isolation" ON categories
  FOR ALL USING (user_has_tenant_access(tenant_id));

-- Contacts: Tenant isolation
CREATE POLICY "Tenant isolation" ON contacts
  FOR ALL USING (user_has_tenant_access(tenant_id));

-- Bills: Tenant isolation
CREATE POLICY "Tenant isolation" ON bills
  FOR ALL USING (user_has_tenant_access(tenant_id));

-- Invoices: Tenant isolation
CREATE POLICY "Tenant isolation" ON invoices
  FOR ALL USING (user_has_tenant_access(tenant_id));

-- Invoice Lines: Access through invoice
CREATE POLICY "Access through invoice" ON invoice_lines
  FOR ALL USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE user_has_tenant_access(tenant_id)
    )
  );

-- Transactions: Tenant isolation
CREATE POLICY "Tenant isolation" ON transactions
  FOR ALL USING (user_has_tenant_access(tenant_id));

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  -- Create profile
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  
  -- Create default "Personal" tenant
  INSERT INTO tenants (name, type, currency)
  VALUES ('Personal', 'personal', 'USD')
  RETURNING id INTO new_tenant_id;
  
  -- Link user to tenant as owner
  INSERT INTO tenant_users (tenant_id, user_id, role)
  VALUES (new_tenant_id, NEW.id, 'owner');
  
  -- Seed default categories for personal tenant
  INSERT INTO categories (tenant_id, name, type) VALUES
    (new_tenant_id, 'Salary', 'income'),
    (new_tenant_id, 'Freelance', 'income'),
    (new_tenant_id, 'Investments', 'income'),
    (new_tenant_id, 'Other Income', 'income'),
    (new_tenant_id, 'Food & Dining', 'expense'),
    (new_tenant_id, 'Transportation', 'expense'),
    (new_tenant_id, 'Shopping', 'expense'),
    (new_tenant_id, 'Entertainment', 'expense'),
    (new_tenant_id, 'Bills & Utilities', 'expense'),
    (new_tenant_id, 'Healthcare', 'expense'),
    (new_tenant_id, 'Transfer', 'transfer');
  
  -- Create default cash account
  INSERT INTO accounts (tenant_id, name, type)
  VALUES (new_tenant_id, 'Cash', 'cash');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update account balance after transaction
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE accounts SET balance = balance - OLD.amount + NEW.amount WHERE id = NEW.account_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_balance_on_transaction
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- Function to update invoice total from lines
CREATE OR REPLACE FUNCTION update_invoice_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices 
  SET total_amount = (
    SELECT COALESCE(SUM(total), 0) FROM invoice_lines WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
  )
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_invoice_total_on_line_change
  AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION update_invoice_total();

-- Function to seed categories for new tenants based on type
CREATE OR REPLACE FUNCTION seed_tenant_categories(p_tenant_id UUID, p_type tenant_type)
RETURNS VOID AS $$
BEGIN
  -- Common categories for all types
  INSERT INTO categories (tenant_id, name, type) VALUES
    (p_tenant_id, 'Other Income', 'income'),
    (p_tenant_id, 'Other Expenses', 'expense'),
    (p_tenant_id, 'Transfer', 'transfer');
  
  IF p_type = 'retail' THEN
    INSERT INTO categories (tenant_id, name, type) VALUES
      (p_tenant_id, 'Sales', 'income'),
      (p_tenant_id, 'Inventory', 'cogs'),
      (p_tenant_id, 'Supplies', 'expense'),
      (p_tenant_id, 'Rent', 'expense'),
      (p_tenant_id, 'Utilities', 'expense'),
      (p_tenant_id, 'Payroll', 'expense'),
      (p_tenant_id, 'Marketing', 'expense');
  ELSIF p_type = 'service' THEN
    INSERT INTO categories (tenant_id, name, type) VALUES
      (p_tenant_id, 'Service Revenue', 'income'),
      (p_tenant_id, 'Consulting', 'income'),
      (p_tenant_id, 'Software & Tools', 'expense'),
      (p_tenant_id, 'Office Supplies', 'expense'),
      (p_tenant_id, 'Travel', 'expense'),
      (p_tenant_id, 'Professional Development', 'expense'),
      (p_tenant_id, 'Subcontractors', 'expense');
  ELSE -- personal
    INSERT INTO categories (tenant_id, name, type) VALUES
      (p_tenant_id, 'Salary', 'income'),
      (p_tenant_id, 'Freelance', 'income'),
      (p_tenant_id, 'Investments', 'income'),
      (p_tenant_id, 'Food & Dining', 'expense'),
      (p_tenant_id, 'Transportation', 'expense'),
      (p_tenant_id, 'Shopping', 'expense'),
      (p_tenant_id, 'Entertainment', 'expense'),
      (p_tenant_id, 'Bills & Utilities', 'expense'),
      (p_tenant_id, 'Healthcare', 'expense');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER set_updated_at ON profiles BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at ON tenants BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at ON accounts BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at ON contacts BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at ON bills BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at ON invoices BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at ON transactions BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_accounts_tenant ON accounts(tenant_id);
CREATE INDEX idx_categories_tenant ON categories(tenant_id);
CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_bills_tenant ON bills(tenant_id);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_transactions_tenant ON transactions(tenant_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account ON transactions(account_id);

