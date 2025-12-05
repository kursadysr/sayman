// Database types for Sayman Finance App

export type TenantType = 'personal' | 'retail' | 'service';
export type UserRole = 'owner' | 'manager' | 'viewer';
export type AccountType = 'bank' | 'cash' | 'credit';
export type CategoryType = 'income' | 'expense' | 'transfer' | 'cogs';
export type ContactType = 'vendor' | 'customer' | 'employee';
export type TimesheetStatus = 'unpaid' | 'paid';
export type BillStatus = 'unpaid' | 'partial' | 'paid';
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid';
export type InvoiceLayout = 'service' | 'product';
export type TransactionStatus = 'cleared' | 'pending';
export type LoanType = 'payable' | 'receivable';
export type LoanStatus = 'active' | 'paid_off' | 'defaulted';
export type PaymentFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';

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

export interface Item {
  id: string;
  tenant_id: string;
  vendor_id: string;
  name: string;
  last_unit_price: number;
  created_at: string;
  updated_at: string;
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
  balance: number;
  hourly_rate: number;
  created_at: string;
  updated_at: string;
}

export interface TimesheetCategory {
  id: string;
  tenant_id: string;
  name: string;
  is_hourly: boolean;
  created_at: string;
}

export interface Timesheet {
  id: string;
  tenant_id: string;
  employee_id: string;
  category_id: string | null;
  date: string;
  hours: number;
  minutes: number;
  hourly_rate: number;
  total_amount: number;
  description: string | null;
  status: TimesheetStatus;
  created_at: string;
  updated_at: string;
  employee?: Contact;
  category?: TimesheetCategory;
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
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Contact;
  lines?: BillLine[];
}

export interface BillLine {
  id: string;
  bill_id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
  sort_order: number;
  created_at: string;
  item?: Item;
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
  timesheet_id: string | null;
  loan_payment_id: string | null;
  created_at: string;
  updated_at: string;
  account?: Account;
  category?: Category;
  bill?: Bill;
  invoice?: Invoice;
  timesheet?: Timesheet;
  loan_payment?: LoanPayment;
}

export interface Loan {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  type: LoanType;
  name: string;
  principal_amount: number;
  interest_rate: number; // Annual rate as decimal (0.05 = 5%)
  term_months: number;
  payment_frequency: PaymentFrequency | null;
  start_date: string;
  monthly_payment: number | null;
  remaining_balance: number;
  total_paid_principal: number;
  total_paid_interest: number;
  status: LoanStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contact?: Contact;
  payments?: LoanPayment[];
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  tenant_id: string;
  account_id: string;
  payment_date: string;
  total_amount: number;
  principal_amount: number;
  interest_amount: number;
  remaining_balance?: number; // Optional - calculated dynamically in UI
  notes: string | null;
  created_at: string;
  account?: Account;
  transaction_id?: string;
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
  vendor_id: string;
  bill_number?: string;
  issue_date: string;
  due_date?: string;
  total_amount?: number;
  description?: string;
}

export interface CreateBillLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
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

export interface CreateLoanInput {
  contact_id?: string;
  type: LoanType;
  name: string;
  principal_amount: number;
  interest_rate: number;
  term_months: number;
  payment_frequency?: PaymentFrequency;
  start_date: string;
  monthly_payment?: number;
  notes?: string;
}

export interface CreateLoanPaymentInput {
  loan_id: string;
  account_id: string;
  payment_date: string;
  total_amount: number;
  principal_amount: number;
  interest_amount: number;
  notes?: string;
}

