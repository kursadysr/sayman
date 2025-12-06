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
  credit_limit NUMERIC(15, 2) DEFAULT NULL, -- Only for credit accounts
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
  balance NUMERIC(15, 2) DEFAULT 0, -- Positive = we owe them (vendor) or they owe us (customer)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unit Categories (system-level measurement categories)
CREATE TABLE unit_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  base_unit_name TEXT NOT NULL,
  base_unit_symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unit Types (tenant-customizable units)
CREATE TABLE unit_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global/shared
  category_id UUID NOT NULL REFERENCES unit_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  to_base_factor NUMERIC(15, 6) NOT NULL DEFAULT 1,  -- Conversion factor to base unit
  is_base BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

-- Items (Products/Services for price tracking per vendor)
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_unit_price NUMERIC(15, 2) DEFAULT 0,
  base_unit_id UUID REFERENCES unit_types(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, vendor_id, name)
);

-- Item Units (custom package definitions per item)
CREATE TABLE item_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  unit_type_id UUID NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
  conversion_factor NUMERIC(15, 6) NOT NULL,  -- How many base units in 1 of this unit
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, unit_type_id)
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
  total_amount NUMERIC(15, 2) DEFAULT 0,
  description TEXT,
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

-- Bill Lines (for itemized bills)
CREATE TABLE bill_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) DEFAULT 1,
  unit_price NUMERIC(15, 2) NOT NULL,
  tax_rate NUMERIC(5, 2) DEFAULT 0,
  total NUMERIC(15, 2) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  unit_type_id UUID REFERENCES unit_types(id) ON DELETE SET NULL,
  base_quantity NUMERIC(15, 6),  -- Quantity converted to base unit
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
ALTER TABLE unit_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read/update their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Tenants: Any authenticated user can create a tenant
CREATE POLICY "Users can create tenants" ON tenants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Tenants: Users can only see/update/delete tenants they belong to
CREATE POLICY "Tenant isolation" ON tenants
  FOR SELECT USING (
    id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Tenant owners can update" ON tenants
  FOR UPDATE USING (is_tenant_owner(id));

CREATE POLICY "Tenant owners can delete" ON tenants
  FOR DELETE USING (is_tenant_owner(id));

-- Helper function to check if user is tenant owner (bypasses RLS)
CREATE OR REPLACE FUNCTION is_tenant_owner(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tenant_users 
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND role = 'owner'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tenant Users: Users can see their own memberships
CREATE POLICY "View own tenant memberships" ON tenant_users
  FOR SELECT USING (user_id = auth.uid());

-- Allow users to create their own membership as owner (for new tenants)
CREATE POLICY "Users can join as owner" ON tenant_users
  FOR INSERT WITH CHECK (user_id = auth.uid() AND role = 'owner');

-- Owners can manage tenant users (update/delete)
CREATE POLICY "Owners can manage tenant users" ON tenant_users
  FOR UPDATE USING (is_tenant_owner(tenant_id));

CREATE POLICY "Owners can delete tenant users" ON tenant_users
  FOR DELETE USING (is_tenant_owner(tenant_id));

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

-- Function to create tenant with owner (bypasses RLS race condition)
CREATE OR REPLACE FUNCTION create_tenant_with_owner(
  p_name TEXT,
  p_type tenant_type,
  p_currency TEXT DEFAULT 'USD'
)
RETURNS tenants AS $$
DECLARE
  new_tenant tenants%ROWTYPE;
BEGIN
  -- Create tenant
  INSERT INTO tenants (name, type, currency)
  VALUES (p_name, p_type, p_currency)
  RETURNING * INTO new_tenant;
  
  -- Link user to tenant as owner
  INSERT INTO tenant_users (tenant_id, user_id, role)
  VALUES (new_tenant.id, auth.uid(), 'owner');
  
  RETURN new_tenant;
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

-- Unit categories: read-only for all authenticated users
CREATE POLICY "Anyone can read unit categories" ON unit_categories
  FOR SELECT USING (true);

-- Unit types: users can see global units and their own tenant's units
CREATE POLICY "View global and tenant units" ON unit_types
  FOR SELECT USING (
    tenant_id IS NULL OR user_has_tenant_access(tenant_id)
  );

CREATE POLICY "Create tenant units" ON unit_types
  FOR INSERT WITH CHECK (
    tenant_id IS NOT NULL AND user_has_tenant_access(tenant_id)
  );

CREATE POLICY "Update tenant units" ON unit_types
  FOR UPDATE USING (
    tenant_id IS NOT NULL AND user_has_tenant_access(tenant_id)
  );

CREATE POLICY "Delete tenant units" ON unit_types
  FOR DELETE USING (
    tenant_id IS NOT NULL AND user_has_tenant_access(tenant_id)
  );

-- Items: Tenant isolation
CREATE POLICY "Tenant isolation" ON items
  FOR ALL USING (user_has_tenant_access(tenant_id));

-- Item units: access through item
CREATE POLICY "Access through item" ON item_units
  FOR ALL USING (
    item_id IN (
      SELECT id FROM items WHERE user_has_tenant_access(tenant_id)
    )
  );

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

-- Bill Lines: Access through bill
CREATE POLICY "Access through bill" ON bill_lines
  FOR ALL USING (
    bill_id IN (
      SELECT id FROM bills WHERE user_has_tenant_access(tenant_id)
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
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- Function to update bill total from lines
CREATE OR REPLACE FUNCTION update_bill_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bills 
  SET total_amount = (
    SELECT COALESCE(SUM(total), 0) FROM bill_lines WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)
  )
  WHERE id = COALESCE(NEW.bill_id, OLD.bill_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_bill_total_on_line_change
  AFTER INSERT OR UPDATE OR DELETE ON bill_lines
  FOR EACH ROW EXECUTE FUNCTION update_bill_total();

-- Function to update vendor balance when bill is created/updated/deleted
CREATE OR REPLACE FUNCTION update_vendor_balance_on_bill()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- New bill increases what we owe the vendor
    IF NEW.vendor_id IS NOT NULL THEN
      UPDATE contacts SET balance = balance + NEW.total_amount WHERE id = NEW.vendor_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle vendor change or amount change
    IF OLD.vendor_id IS NOT NULL AND OLD.vendor_id != COALESCE(NEW.vendor_id, OLD.vendor_id) THEN
      -- Vendor changed, remove from old vendor
      UPDATE contacts SET balance = balance - OLD.total_amount WHERE id = OLD.vendor_id;
    END IF;
    IF NEW.vendor_id IS NOT NULL THEN
      IF OLD.vendor_id = NEW.vendor_id THEN
        -- Same vendor, adjust by difference
        UPDATE contacts SET balance = balance + (NEW.total_amount - OLD.total_amount) WHERE id = NEW.vendor_id;
      ELSE
        -- New vendor, add full amount
        UPDATE contacts SET balance = balance + NEW.total_amount WHERE id = NEW.vendor_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Bill deleted, reduce what we owe
    IF OLD.vendor_id IS NOT NULL THEN
      UPDATE contacts SET balance = balance - OLD.total_amount WHERE id = OLD.vendor_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_vendor_balance_on_bill_change
  AFTER INSERT OR UPDATE OR DELETE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_vendor_balance_on_bill();

-- Function to update vendor balance when payment is made (transaction linked to bill)
CREATE OR REPLACE FUNCTION update_vendor_balance_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.bill_id IS NOT NULL THEN
      SELECT vendor_id INTO v_vendor_id FROM bills WHERE id = NEW.bill_id;
      IF v_vendor_id IS NOT NULL THEN
        -- Payment reduces what we owe (amount is negative for expenses)
        UPDATE contacts SET balance = balance + NEW.amount WHERE id = v_vendor_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle bill_id change
    IF OLD.bill_id IS NOT NULL THEN
      SELECT vendor_id INTO v_vendor_id FROM bills WHERE id = OLD.bill_id;
      IF v_vendor_id IS NOT NULL THEN
        UPDATE contacts SET balance = balance - OLD.amount WHERE id = v_vendor_id;
      END IF;
    END IF;
    IF NEW.bill_id IS NOT NULL THEN
      SELECT vendor_id INTO v_vendor_id FROM bills WHERE id = NEW.bill_id;
      IF v_vendor_id IS NOT NULL THEN
        UPDATE contacts SET balance = balance + NEW.amount WHERE id = v_vendor_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.bill_id IS NOT NULL THEN
      SELECT vendor_id INTO v_vendor_id FROM bills WHERE id = OLD.bill_id;
      IF v_vendor_id IS NOT NULL THEN
        -- Reverse the payment effect
        UPDATE contacts SET balance = balance - OLD.amount WHERE id = v_vendor_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_vendor_balance_on_payment_change
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_vendor_balance_on_payment();

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
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_tenants BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_accounts BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_contacts BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_bills BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_invoices BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_transactions BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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
CREATE INDEX idx_bill_lines_bill ON bill_lines(bill_id);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_items_tenant ON items(tenant_id);
CREATE INDEX idx_items_name ON items(tenant_id, name);
CREATE INDEX idx_items_base_unit ON items(base_unit_id);
CREATE INDEX idx_unit_types_tenant ON unit_types(tenant_id);
CREATE INDEX idx_unit_types_category ON unit_types(category_id);
CREATE INDEX idx_item_units_item ON item_units(item_id);
CREATE INDEX idx_item_units_unit_type ON item_units(unit_type_id);
CREATE INDEX idx_bill_lines_unit_type ON bill_lines(unit_type_id);
CREATE INDEX idx_bill_lines_item_unit ON bill_lines(item_id, unit_type_id);

