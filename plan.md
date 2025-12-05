# Project Blueprint: Multi-Tenant Finance & Bookkeeping App

## 1. Executive Summary
**Project Name:** Sayman  
**Type:** Mobile-First Web Application (SaaS Architecture)  
**Core Goal:** A unified finance platform for managing distinct entities (Personal Finances, Retail Business, Freelance Agency) via a single login, with proper accrual-basis accounting.  
**Key Differentiator:** Simple expense entry with proper bookkeeping - tracks item prices, vendor balances, and supports both immediate payments and accounts payable/receivable.

## 2. Technical Stack
- **Frontend:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS + Shadcn/UI (Mobile-first)
- **Backend:** Supabase (PostgreSQL, Auth, Storage)
- **State Management:** Zustand (global UI state)
- **Forms:** React Hook Form + Zod
- **PDF Generation:** @react-pdf/renderer (Client-side)

---

## 3. Architecture: The Tenant System

### A. Multi-Tenant Design
- Each user can have multiple workspaces (tenants)
- Data isolation via Row Level Security (RLS)
- Tenant switcher in navigation for context switching

### B. Security (RLS Policy)
```sql
CREATE POLICY "Tenant Isolation" ON [table_name]
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  )
);
```

### C. User Onboarding
- Sign up creates user profile only (no automatic tenant)
- User creates their first workspace manually
- Supports multiple workspace types: Personal, Retail, Service

---

## 4. Database Schema

### Identity & Access
1. **`profiles`**: `id`, `email`, `full_name`, `avatar_url`
2. **`tenants`**: `id`, `name`, `type`, `currency`, `logo_url`, `address_details`
3. **`tenant_users`**: `tenant_id`, `user_id`, `role` (owner/manager/viewer)

### The Ledger
4. **`accounts`**: Bank/cash/credit accounts with balances
5. **`contacts`**: Vendors & customers with `balance` tracking
6. **`items`**: Products/services per vendor with `last_unit_price`

### Documents
7. **`bills`**: Expenses/Accounts Payable
   - `vendor_id` (optional - null for quick expenses)
   - `status`: unpaid, partial, paid
   - Always uses line items for itemized tracking

8. **`bill_lines`**: Itemized bill entries
   - `item_id` links to items table for price tracking
   - `quantity`, `unit_price`, `tax_rate`, `total`

9. **`invoices`**: Income/Accounts Receivable
   - `customer_id`, `status`, `layout_type`

10. **`invoice_lines`**: Invoice line items

11. **`transactions`**: Cash flow records (payments only)
    - Links to `bill_id` or `invoice_id` when paying documents
    - Positive = income, Negative = expense

---

## 5. Key Feature Workflows

### A. Adding Expenses (Bills)

**Always Itemized Entry:**
- Enter items with qty, price, tax
- One item = simple expense
- Multiple items = detailed breakdown

**Two Paths:**

1. **With Vendor (Credit Account):**
   - Select vendor → items auto-suggest from history
   - Toggle "Paid" OFF → Creates unpaid bill (AP)
   - Toggle "Paid" ON → Select account → Paid immediately

2. **Without Vendor (Quick Expense):**
   - No vendor selected → Must select account
   - Always paid immediately
   - No price tracking (items table)

### B. Item Price Tracking
- Items are tracked per vendor
- When entering a bill, typing suggests existing items
- Selecting fills in last known price
- Saving updates the item's `last_unit_price`
- View price history in Items page

### C. Contact Balances (Accounts Payable)
- Each vendor has a `balance` field
- Bill created → Balance increases (you owe them)
- Payment made → Balance decreases
- View transaction history per contact

### D. Invoicing (Accounts Receivable)
- Create invoice for customer
- Toggle "Paid" OFF → Creates unpaid invoice (AR)
- Toggle "Paid" ON → Select account → Payment received
- PDF generation with tenant branding

### E. General Ledger (Transactions)
- Proper accounting ledger with running balances
- Shows debit/credit columns per accounting standards
- Opening and closing balance tracking
- Filter by account to view individual account ledgers
- Reference numbers link to source documents (bills/invoices/loans)
- No direct entry - all flows through Bills/Invoices/Loans

### F. Loan Management (Double-Entry)
- **Loan Payable** (I borrowed money):
  - On creation: Debit Cash, Credit Loan Payable (liability)
  - On payment: Debit Loan Payable + Interest Expense, Credit Cash
- **Loan Receivable** (I lent money):
  - On creation: Debit Loan Receivable (asset), Credit Cash
  - On repayment: Debit Cash, Credit Loan Receivable + Interest Income
- All loan transactions appear in the General Ledger
- Initial disbursement recorded when creating loan

---

## 6. Accounting Principles

### Accrual Basis
- **Expense recorded** when bill is created (not when paid)
- **Income recorded** when invoice is created (not when received)

### Double-Entry (Simplified)
- Bill created → Expense ↑, Accounts Payable ↑
- Bill paid → Accounts Payable ↓, Cash ↓
- Invoice created → Accounts Receivable ↑, Revenue ↑
- Invoice paid → Cash ↑, Accounts Receivable ↓

---

## 7. Directory Structure

```text
/src
  /app
    /(auth)              # Login, Signup
    /(dashboard)         # Protected pages
      /dashboard         # Overview
      /transactions      # General Ledger
      /bills             # Expenses/AP
      /invoices          # Income/AR
      /contacts          # Vendors & Customers
      /items             # Item price management
      /accounts          # Bank/cash accounts
  /components
    /ui                  # Shadcn primitives
    /layout              # AppShell, Navigation
    /shared              # TenantSwitcher
  /features
    /auth                # Auth actions
    /bills               # AddBillDrawer, EditBillDrawer, RecordPaymentDialog
    /invoicing           # CreateInvoiceDialog, InvoicePDF
    /contacts            # ContactDetailsDrawer, EditContactDialog
  /lib
    /store               # useTenantStore (Zustand)
    /supabase            # Client & Types
  /hooks
    useTenant.ts         # Current tenant helper
```

---

## 8. UI/UX Principles

- **Keep it easy** - One item entry works for simple expenses
- **Always itemized** - No toggle between total/items
- **Smart defaults** - Auto-suggest from history
- **Clear status** - Paid vs Unpaid visible at glance
- **Mobile-first** - Drawer components for mobile entry
