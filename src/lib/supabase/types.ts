// Database types for Sayman Finance App

export type TenantType = 'personal' | 'retail' | 'service';
export type UserRole = 'owner' | 'manager' | 'viewer';
export type AccountType = 'bank' | 'cash' | 'credit';
export type CategoryType = 'income' | 'expense' | 'transfer' | 'cogs';
export type ContactType = 'vendor' | 'customer';
export type BillStatus = 'unpaid' | 'partial' | 'paid';
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid';
export type InvoiceLayout = 'service' | 'product';
export type TransactionStatus = 'cleared' | 'pending';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddressDetails {
  address?: string;
  tax_id?: string;
  footer_note?: string;
}

export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  currency: string;
  logo_url: string | null;
  address_details: AddressDetails;
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  tenant?: Tenant;
  profile?: Profile;
}

export interface Account {
  id: string;
  tenant_id: string;
  name: string;
  type: AccountType;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  type: ContactType;
  name: string;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bill {
  id: string;
  tenant_id: string;
  vendor_id: string | null;
  bill_number: string | null;
  status: BillStatus;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  description: string | null;
  category_id: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Contact;
  category?: Category;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  invoice_number: string | null;
  status: InvoiceStatus;
  layout_type: InvoiceLayout;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer?: Contact;
  lines?: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
  sort_order: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  tenant_id: string;
  account_id: string;
  category_id: string | null;
  date: string;
  amount: number;
  description: string | null;
  status: TransactionStatus;
  bill_id: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
  account?: Account;
  category?: Category;
  bill?: Bill;
  invoice?: Invoice;
}

// Form input types
export interface CreateTenantInput {
  name: string;
  type: TenantType;
  currency: string;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  balance?: number;
}

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  icon?: string;
}

export interface CreateContactInput {
  type: ContactType;
  name: string;
  email?: string;
  phone?: string;
  tax_id?: string;
  address?: string;
}

export interface CreateBillInput {
  vendor_id?: string;
  bill_number?: string;
  issue_date: string;
  due_date?: string;
  total_amount: number;
  description?: string;
  category_id?: string;
}

export interface CreateInvoiceInput {
  customer_id?: string;
  invoice_number?: string;
  layout_type: InvoiceLayout;
  issue_date: string;
  due_date?: string;
  notes?: string;
}

export interface CreateInvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

export interface CreateTransactionInput {
  account_id: string;
  category_id?: string;
  date: string;
  amount: number;
  description?: string;
  status?: TransactionStatus;
  bill_id?: string;
  invoice_id?: string;
}

