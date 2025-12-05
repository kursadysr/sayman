import { format, parseISO } from 'date-fns';
import type { Account } from '@/lib/supabase/types';

/**
 * Check if an account has sufficient funds for a withdrawal
 * @param account - The account to check
 * @param amount - The amount to withdraw (positive number)
 * @returns Object with hasFunds boolean and available amount
 */
export function checkAccountFunds(
  account: Account,
  amount: number
): { hasFunds: boolean; available: number } {
  // Ensure numeric conversion (DB might return strings)
  const balance = Number(account.balance) || 0;
  const creditLimit = Number(account.credit_limit) || 0;
  
  if (account.type === 'credit') {
    // Credit accounts: available = credit_limit + balance (balance is negative when owing)
    // If no credit limit set, default to 0 (no available credit)
    const available = creditLimit + balance;
    return { hasFunds: available >= amount, available };
  } else {
    // Bank/Cash accounts: can't go negative
    return { hasFunds: balance >= amount, available: balance };
  }
}

// UUID generator with fallback for older browsers
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date, formatStr: string = 'MM/dd/yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

export function formatDateInput(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

