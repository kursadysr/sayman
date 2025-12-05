'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, BookOpen, Landmark, ExternalLink, Filter, X, ArrowUpDown, CalendarDays, Wallet, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Account } from '@/lib/supabase/types';

type SortOption = 'date_desc' | 'date_asc';
type TypeFilter = 'all' | 'bill' | 'invoice' | 'loan' | 'other';
type DateFilter = 'all' | 'this_month' | 'last_month' | 'q1' | 'q2' | 'q3' | 'q4' | 'this_year' | 'last_year' | 'custom';

interface AccountEffect {
  accountName: string;
  accountType: 'cash' | 'accounts_payable' | 'accounts_receivable' | 'loan_payable' | 'loan_receivable' | 'interest_expense' | 'interest_income';
  debit: number;
  credit: number;
}

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  reference?: string;
  referenceType?: 'bill' | 'invoice' | 'loan' | 'loan_payment';
  debit: number;
  credit: number;
  balance: number;
  accountId: string;
  accountName: string;
  // Double-entry: all affected accounts
  affectedAccounts: AccountEffect[];
  // Source IDs for navigation
  billId?: string;
  invoiceId?: string;
  loanId?: string;
}

interface Transaction {
  id: string;
  date: string;
  amount: number;
  description?: string;
  account_id: string;
  bill_id?: string;
  invoice_id?: string;
  loan_payment_id?: string;
  account?: { name: string };
  bill?: { id: string; bill_number?: string; vendor?: { name: string } };
  invoice?: { id: string; invoice_number?: string; customer?: { name: string } };
  loan_payment?: { id: string; loan_id: string; loan?: { id: string; name: string; type: string } };
}

export default function LedgerPage() {
  const { tenant } = useTenant();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDateStart, setCustomDateStart] = useState<string>('');
  const [customDateEnd, setCustomDateEnd] = useState<string>('');
  const [customDateDialogOpen, setCustomDateDialogOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<string>('');
  const [tempEndDate, setTempEndDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Detail dialog for transactions without source
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  
  // Filter sheet state
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    const [txResult, accountsResult] = await Promise.all([
      supabase
        .from('transactions')
        .select(`
          *,
          account:accounts(name),
          bill:bills(id, bill_number, vendor:contacts(name)),
          invoice:invoices(id, invoice_number, customer:contacts(name)),
          loan_payment:loan_payments(id, loan_id, loan:loans(id, name, type))
        `)
        .eq('tenant_id', tenant.id)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name'),
    ]);

    setTransactions((txResult.data || []) as Transaction[]);
    setAccounts((accountsResult.data || []) as Account[]);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get date range based on filter
  const getDateRange = useCallback((filter: DateFilter): { start: Date | null; end: Date | null } => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    switch (filter) {
      case 'this_month':
        return {
          start: new Date(year, month, 1),
          end: new Date(year, month + 1, 0)
        };
      case 'last_month':
        return {
          start: new Date(year, month - 1, 1),
          end: new Date(year, month, 0)
        };
      case 'q1':
        return {
          start: new Date(year, 0, 1),
          end: new Date(year, 2, 31)
        };
      case 'q2':
        return {
          start: new Date(year, 3, 1),
          end: new Date(year, 5, 30)
        };
      case 'q3':
        return {
          start: new Date(year, 6, 1),
          end: new Date(year, 8, 30)
        };
      case 'q4':
        return {
          start: new Date(year, 9, 1),
          end: new Date(year, 11, 31)
        };
      case 'this_year':
        return {
          start: new Date(year, 0, 1),
          end: new Date(year, 11, 31)
        };
      case 'last_year':
        return {
          start: new Date(year - 1, 0, 1),
          end: new Date(year - 1, 11, 31)
        };
      case 'custom':
        return {
          start: customDateStart ? new Date(customDateStart) : null,
          end: customDateEnd ? new Date(customDateEnd) : null
        };
      default:
        return { start: null, end: null };
    }
  }, [customDateStart, customDateEnd]);

  // Handle date filter change
  const handleDateFilterChange = (value: string) => {
    if (value === 'custom') {
      setTempStartDate(customDateStart || new Date().toISOString().split('T')[0]);
      setTempEndDate(customDateEnd || new Date().toISOString().split('T')[0]);
      setCustomDateDialogOpen(true);
    } else {
      setDateFilter(value as DateFilter);
    }
  };

  // Apply custom date range
  const applyCustomDateRange = () => {
    setCustomDateStart(tempStartDate);
    setCustomDateEnd(tempEndDate);
    setDateFilter('custom');
    setCustomDateDialogOpen(false);
  };

  // Get date filter label
  const getDateFilterLabel = (filter: DateFilter): string => {
    switch (filter) {
      case 'this_month': return 'This Month';
      case 'last_month': return 'Last Month';
      case 'q1': return 'Q1';
      case 'q2': return 'Q2';
      case 'q3': return 'Q3';
      case 'q4': return 'Q4';
      case 'this_year': return 'This Year';
      case 'last_year': return 'Last Year';
      case 'custom': return customDateStart && customDateEnd 
        ? `${formatDate(customDateStart)} - ${formatDate(customDateEnd)}`
        : 'Custom';
      default: return 'All Time';
    }
  };

  // Build ledger entries with running balance
  const ledgerEntries = useMemo(() => {
    const accountBalances: Record<string, number> = {};
    
    // Initialize with opening balances
    accounts.forEach((account) => {
      const accountTxs = transactions.filter(tx => tx.account_id === account.id);
      const txSum = accountTxs.reduce((sum, tx) => sum + tx.amount, 0);
      accountBalances[account.id] = Number(account.balance) - txSum;
    });

    const entries: LedgerEntry[] = [];
    
    // Filter by account
    let filteredTxs = selectedAccountId === 'all' 
      ? transactions 
      : transactions.filter(tx => tx.account_id === selectedAccountId);
    
    // Filter by type
    if (typeFilter !== 'all') {
      filteredTxs = filteredTxs.filter(tx => {
        if (typeFilter === 'bill') return tx.bill_id;
        if (typeFilter === 'invoice') return tx.invoice_id;
        if (typeFilter === 'loan') return tx.loan_payment_id || tx.description?.startsWith('Loan received:') || tx.description?.startsWith('Loan disbursed:');
        if (typeFilter === 'other') return !tx.bill_id && !tx.invoice_id && !tx.loan_payment_id && !tx.description?.startsWith('Loan');
        return true;
      });
    }

    // Filter by date
    if (dateFilter !== 'all') {
      const { start, end } = getDateRange(dateFilter);
      if (start && end) {
        filteredTxs = filteredTxs.filter(tx => {
          const txDate = new Date(tx.date);
          return txDate >= start && txDate <= end;
        });
      }
    }

    filteredTxs.forEach((tx) => {
      const accountId = tx.account_id;
      const previousBalance = accountBalances[accountId] || 0;
      const newBalance = previousBalance + tx.amount;
      accountBalances[accountId] = newBalance;

      let reference = '';
      let referenceType: LedgerEntry['referenceType'];
      let description = tx.description || '';
      let billId: string | undefined;
      let invoiceId: string | undefined;
      let loanId: string | undefined;
      
      if (tx.bill?.id) {
        reference = tx.bill.bill_number ? `Bill #${tx.bill.bill_number}` : 'Bill';
        referenceType = 'bill';
        billId = tx.bill.id;
        if (!description && tx.bill.vendor?.name) {
          description = `Payment to ${tx.bill.vendor.name}`;
        }
      } else if (tx.invoice?.id) {
        reference = tx.invoice.invoice_number ? `Inv #${tx.invoice.invoice_number}` : 'Invoice';
        referenceType = 'invoice';
        invoiceId = tx.invoice.id;
        if (!description && tx.invoice.customer?.name) {
          description = `Payment from ${tx.invoice.customer.name}`;
        }
      } else if (tx.loan_payment?.loan?.id) {
        reference = tx.loan_payment.loan.name;
        referenceType = 'loan_payment';
        loanId = tx.loan_payment.loan.id;
        if (!description) {
          description = tx.loan_payment.loan.type === 'payable' 
            ? 'Loan Payment (Out)'
            : 'Loan Payment Received';
        }
      } else if (description?.startsWith('Loan received:') || description?.startsWith('Loan disbursed:')) {
        referenceType = 'loan';
        reference = description.replace('Loan received: ', '').replace('Loan disbursed: ', '');
        // Note: For initial loan disbursements, we don't have the loan_id directly linked
        // They would need to navigate to loans page to find it
      }

      if (!description) {
        description = tx.amount >= 0 ? 'Deposit' : 'Withdrawal';
      }

      // Build affected accounts list (double-entry)
      const affectedAccounts: AccountEffect[] = [];
      const cashAccountName = tx.account?.name || 'Cash';
      const amount = Math.abs(tx.amount);

      if (tx.bill?.id) {
        // Bill payment: Cash ↓ (Credit), Accounts Payable ↓ (Debit)
        affectedAccounts.push(
          { accountName: 'Accounts Payable', accountType: 'accounts_payable', debit: amount, credit: 0 },
          { accountName: cashAccountName, accountType: 'cash', debit: 0, credit: amount }
        );
      } else if (tx.invoice?.id) {
        // Invoice payment received: Cash ↑ (Debit), Accounts Receivable ↓ (Credit)
        affectedAccounts.push(
          { accountName: cashAccountName, accountType: 'cash', debit: amount, credit: 0 },
          { accountName: 'Accounts Receivable', accountType: 'accounts_receivable', debit: 0, credit: amount }
        );
      } else if (tx.loan_payment?.loan?.id) {
        const loan = tx.loan_payment.loan;
        const principalAmount = Math.abs(tx.amount); // Simplified - actual split would need loan_payment data
        
        if (loan.type === 'payable') {
          // Paying off a loan: Loan Payable ↓ (Debit), Cash ↓ (Credit)
          affectedAccounts.push(
            { accountName: `Loan: ${loan.name}`, accountType: 'loan_payable', debit: principalAmount, credit: 0 },
            { accountName: cashAccountName, accountType: 'cash', debit: 0, credit: principalAmount }
          );
        } else {
          // Receiving loan payment: Cash ↑ (Debit), Loan Receivable ↓ (Credit)
          affectedAccounts.push(
            { accountName: cashAccountName, accountType: 'cash', debit: principalAmount, credit: 0 },
            { accountName: `Loan: ${loan.name}`, accountType: 'loan_receivable', debit: 0, credit: principalAmount }
          );
        }
      } else if (description?.startsWith('Loan received:')) {
        // Loan disbursement (payable): Cash ↑ (Debit), Loan Payable ↑ (Credit)
        const loanName = description.replace('Loan received: ', '');
        affectedAccounts.push(
          { accountName: cashAccountName, accountType: 'cash', debit: amount, credit: 0 },
          { accountName: `Loan: ${loanName}`, accountType: 'loan_payable', debit: 0, credit: amount }
        );
      } else if (description?.startsWith('Loan disbursed:')) {
        // Loan disbursement (receivable): Loan Receivable ↑ (Debit), Cash ↓ (Credit)
        const loanName = description.replace('Loan disbursed: ', '');
        affectedAccounts.push(
          { accountName: `Loan: ${loanName}`, accountType: 'loan_receivable', debit: amount, credit: 0 },
          { accountName: cashAccountName, accountType: 'cash', debit: 0, credit: amount }
        );
      } else {
        // Generic transaction
        if (tx.amount >= 0) {
          affectedAccounts.push(
            { accountName: cashAccountName, accountType: 'cash', debit: amount, credit: 0 }
          );
        } else {
          affectedAccounts.push(
            { accountName: cashAccountName, accountType: 'cash', debit: 0, credit: amount }
          );
        }
      }

      entries.push({
        id: tx.id,
        date: tx.date,
        description,
        reference,
        referenceType,
        debit: tx.amount < 0 ? Math.abs(tx.amount) : 0,
        credit: tx.amount > 0 ? tx.amount : 0,
        balance: newBalance,
        accountId,
        accountName: tx.account?.name || 'Unknown',
        affectedAccounts,
        billId,
        invoiceId,
        loanId,
      });
    });

    // Apply sorting
    const sortedEntries = [...entries].sort((a, b) => {
      if (sortBy === 'date_desc') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return sortedEntries;
  }, [transactions, accounts, selectedAccountId, typeFilter, dateFilter, getDateRange, sortBy]);

  // Handle entry click - navigate to source
  const handleEntryClick = (entry: LedgerEntry) => {
    if (entry.billId) {
      // Navigate to bills page - the bill details would need to be opened there
      router.push(`/bills?id=${entry.billId}`);
    } else if (entry.invoiceId) {
      router.push(`/invoices?id=${entry.invoiceId}`);
    } else if (entry.loanId) {
      router.push(`/loans?id=${entry.loanId}`);
    } else if (entry.referenceType === 'loan') {
      // Initial loan disbursement - go to loans page
      router.push('/loans');
    } else {
      // No linked source - show detail dialog
      setSelectedEntry(entry);
      setDetailDialogOpen(true);
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    return {
      debit: ledgerEntries.reduce((sum, e) => sum + e.debit, 0),
      credit: ledgerEntries.reduce((sum, e) => sum + e.credit, 0),
    };
  }, [ledgerEntries]);

  // Get opening/closing balance
  const openingBalance = useMemo(() => {
    if (selectedAccountId === 'all') {
      let total = 0;
      accounts.forEach((account) => {
        const accountTxs = transactions.filter(tx => tx.account_id === account.id);
        const txSum = accountTxs.reduce((sum, tx) => sum + tx.amount, 0);
        total += Number(account.balance) - txSum;
      });
      return total;
    }
    
    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account) return 0;
    
    const accountTxs = transactions.filter(tx => tx.account_id === account.id);
    const txSum = accountTxs.reduce((sum, tx) => sum + tx.amount, 0);
    return Number(account.balance) - txSum;
  }, [accounts, transactions, selectedAccountId]);

  const closingBalance = useMemo(() => {
    if (selectedAccountId === 'all') {
      return accounts.reduce((sum, a) => sum + Number(a.balance), 0);
    }
    const account = accounts.find(a => a.id === selectedAccountId);
    return account ? Number(account.balance) : 0;
  }, [accounts, selectedAccountId]);

  const getReferenceColor = (type?: LedgerEntry['referenceType']) => {
    switch (type) {
      case 'bill': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'invoice': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'loan': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'loan_payment': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-slate-700 text-slate-300';
    }
  };

  const hasLink = (entry: LedgerEntry) => {
    return entry.billId || entry.invoiceId || entry.loanId || entry.referenceType === 'loan';
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-400">Select a workspace to continue</p>
      </div>
    );
  }

  // Check if any filter is active
  const hasActiveFilters = typeFilter !== 'all' || selectedAccountId !== 'all' || dateFilter !== 'all';
  const activeFilterCount = [typeFilter !== 'all', selectedAccountId !== 'all', dateFilter !== 'all'].filter(Boolean).length;

  // Clear all filters
  const clearAllFilters = () => {
    setTypeFilter('all');
    setSelectedAccountId('all');
    setDateFilter('all');
    setCustomDateStart('');
    setCustomDateEnd('');
  };

  // Quick date filter options
  const quickDateFilters: { value: DateFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_year', label: 'This Year' },
  ];

  // Get selected account name
  const selectedAccountName = selectedAccountId === 'all' 
    ? null 
    : accounts.find(a => a.id === selectedAccountId)?.name;

  // Get type filter label
  const typeFilterLabel = typeFilter === 'all' ? null : 
    typeFilter === 'bill' ? 'Bills' :
    typeFilter === 'invoice' ? 'Invoices' :
    typeFilter === 'loan' ? 'Loans' : 'Other';

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-emerald-400" />
              General Ledger
            </h1>
            <p className="text-slate-400 text-sm">Tap any entry to view details</p>
          </div>
          
          {/* Sort Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortBy(sortBy === 'date_desc' ? 'date_asc' : 'date_desc')}
            className="text-slate-400 hover:text-white"
          >
            <ArrowUpDown className="h-4 w-4 mr-1" />
            {sortBy === 'date_desc' ? 'Newest' : 'Oldest'}
          </Button>
        </div>
        
        {/* Quick Date Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          {quickDateFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setDateFilter(filter.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                dateFilter === filter.value
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <button
            onClick={() => {
              setTempStartDate(customDateStart || new Date().toISOString().split('T')[0]);
              setTempEndDate(customDateEnd || new Date().toISOString().split('T')[0]);
              setCustomDateDialogOpen(true);
            }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${
              dateFilter === 'custom'
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {dateFilter === 'custom' && customDateStart && customDateEnd
              ? `${formatDate(customDateStart)} - ${formatDate(customDateEnd)}`
              : 'Custom'}
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-2">
          {/* Filter Button */}
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`border-slate-700 ${
                  hasActiveFilters 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Filter className="h-4 w-4 mr-1.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 bg-emerald-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-slate-900 border-slate-700">
              <SheetHeader>
                <SheetTitle className="text-white">Filter Transactions</SheetTitle>
                <SheetDescription className="text-slate-400">
                  Narrow down your ledger entries
                </SheetDescription>
              </SheetHeader>
              
              <div className="space-y-6 py-6">
                {/* Account Filter */}
                <div className="space-y-2">
                  <Label className="text-slate-300 flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-blue-400" />
                    Account
                  </Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue placeholder="All Accounts" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all" className="text-white">All Accounts</SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id} className="text-white">
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Type Filter */}
                <div className="space-y-2">
                  <Label className="text-slate-300 flex items-center gap-2">
                    <Tag className="h-4 w-4 text-purple-400" />
                    Transaction Type
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'bill', label: 'Bills' },
                      { value: 'invoice', label: 'Invoices' },
                      { value: 'loan', label: 'Loans' },
                      { value: 'other', label: 'Other' },
                    ].map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setTypeFilter(type.value as TypeFilter)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          typeFilter === type.value
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date Presets */}
                <div className="space-y-2">
                  <Label className="text-slate-300 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-amber-400" />
                    Date Range
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'all', label: 'All Time' },
                      { value: 'this_month', label: 'This Month' },
                      { value: 'last_month', label: 'Last Month' },
                      { value: 'q1', label: 'Q1' },
                      { value: 'q2', label: 'Q2' },
                      { value: 'q3', label: 'Q3' },
                      { value: 'q4', label: 'Q4' },
                      { value: 'this_year', label: 'This Year' },
                      { value: 'last_year', label: 'Last Year' },
                    ].map((filter) => (
                      <button
                        key={filter.value}
                        onClick={() => setDateFilter(filter.value as DateFilter)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          dateFilter === filter.value
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setFilterSheetOpen(false);
                        setTempStartDate(customDateStart || new Date().toISOString().split('T')[0]);
                        setTempEndDate(customDateEnd || new Date().toISOString().split('T')[0]);
                        setCustomDateDialogOpen(true);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                        dateFilter === 'custom'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      Custom...
                    </button>
                  </div>
                </div>
              </div>

              <SheetFooter className="flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={clearAllFilters}
                  className="flex-1 border-slate-700 text-slate-300"
                >
                  Clear All
                </Button>
                <Button
                  onClick={() => setFilterSheetOpen(false)}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  Apply
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {/* Active Filter Chips */}
          <div className="flex gap-2 overflow-x-auto flex-1 scrollbar-hide">
            {selectedAccountName && (
              <Badge
                variant="outline"
                className="bg-blue-500/10 text-blue-400 border-blue-500/30 flex items-center gap-1 flex-shrink-0"
              >
                <Wallet className="h-3 w-3" />
                {selectedAccountName}
                <button onClick={() => setSelectedAccountId('all')} className="ml-1 hover:text-blue-300">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {typeFilterLabel && (
              <Badge
                variant="outline"
                className="bg-purple-500/10 text-purple-400 border-purple-500/30 flex items-center gap-1 flex-shrink-0"
              >
                <Tag className="h-3 w-3" />
                {typeFilterLabel}
                <button onClick={() => setTypeFilter('all')} className="ml-1 hover:text-purple-300">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>

          {/* Clear All (only when filters active) */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-slate-400 hover:text-white flex-shrink-0"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Ledger Entries - Mobile Card View */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          {/* Entry count header */}
          {!loading && ledgerEntries.length > 0 && (
            <div className="px-3 py-2 border-b border-slate-700">
              <span className="text-xs text-slate-400">
                {ledgerEntries.length} {ledgerEntries.length === 1 ? 'entry' : 'entries'}
                {hasActiveFilters && ' (filtered)'}
              </span>
            </div>
          )}
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : ledgerEntries.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transactions yet.</p>
              <p className="text-sm mt-2">
                Record bill payments, invoice receipts, or loans to see entries here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {/* Opening Balance Row - only show for chronological ascending sort */}
              {sortBy === 'date_asc' && (
                <div className="p-3 bg-slate-700/30">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm italic">Opening Balance</span>
                    <span className={`font-bold ${openingBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {formatCurrency(openingBalance, tenant.currency)}
                    </span>
                  </div>
                </div>
              )}

              {/* Transaction Entries */}
              {ledgerEntries.map((entry) => (
                <div 
                  key={entry.id} 
                  onClick={() => handleEntryClick(entry)}
                  className="p-3 hover:bg-slate-700/30 transition-colors cursor-pointer active:bg-slate-700/50"
                >
                  {/* Row 1: Date & Reference */}
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>{formatDate(entry.date)}</span>
                    <div className="flex items-center gap-2">
                      {entry.reference && (
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getReferenceColor(entry.referenceType)}`}
                        >
                          {entry.referenceType === 'loan' || entry.referenceType === 'loan_payment' ? (
                            <Landmark className="h-3 w-3 mr-1" />
                          ) : null}
                          {entry.reference}
                        </Badge>
                      )}
                      {hasLink(entry) && (
                        <ExternalLink className="h-3 w-3 text-slate-500" />
                      )}
                    </div>
                  </div>
                  
                  {/* Row 2: Description */}
                  <p className="text-white text-sm font-medium mb-2 line-clamp-1">
                    {entry.description}
                  </p>
                  
                  {/* Row 3: Affected Accounts (Double-Entry) */}
                  <div className="bg-slate-700/20 rounded-md p-2 space-y-1">
                    {entry.affectedAccounts.map((acc, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className={`flex-1 truncate ${
                          acc.accountType === 'cash' ? 'text-blue-400' :
                          acc.accountType === 'accounts_payable' ? 'text-orange-400' :
                          acc.accountType === 'accounts_receivable' ? 'text-purple-400' :
                          acc.accountType.includes('loan') ? 'text-amber-400' :
                          'text-slate-300'
                        }`}>
                          {acc.accountName}
                        </span>
                        <div className="flex items-center gap-3 ml-2">
                          <span className={`w-16 text-right ${acc.debit > 0 ? 'text-red-400 font-medium' : 'text-slate-600'}`}>
                            {acc.debit > 0 ? formatCurrency(acc.debit, tenant.currency) : '—'}
                          </span>
                          <span className={`w-16 text-right ${acc.credit > 0 ? 'text-green-400 font-medium' : 'text-slate-600'}`}>
                            {acc.credit > 0 ? formatCurrency(acc.credit, tenant.currency) : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {/* Header labels for debit/credit columns */}
                    <div className="flex items-center justify-end text-[10px] text-slate-500 pt-1 border-t border-slate-600/50">
                      <span className="w-16 text-right">Debit</span>
                      <span className="w-16 text-right">Credit</span>
                    </div>
                  </div>
                  
                  {/* Row 4: Running Balance - only for chronological sort */}
                  {sortBy === 'date_asc' && (
                    <div className="flex justify-end mt-2">
                      <span className={`text-xs ${entry.balance >= 0 ? 'text-slate-400' : 'text-red-400'}`}>
                        Bal: {formatCurrency(entry.balance, tenant.currency)}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Closing Balance / Totals Row */}
              <div className="p-3 bg-slate-700/30">
                <div className="flex justify-between items-center">
                  <div className="text-sm">
                    <span className="text-slate-400 italic">
                      {sortBy === 'date_asc' ? 'Closing Balance' : 'Totals'}
                    </span>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Debits: <span className="text-red-400">{formatCurrency(totals.debit, tenant.currency)}</span>
                      {' • '}
                      Credits: <span className="text-green-400">{formatCurrency(totals.credit, tenant.currency)}</span>
                    </div>
                  </div>
                  {sortBy === 'date_asc' && (
                    <span className={`text-lg font-bold ${closingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(closingBalance, tenant.currency)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-slate-500 text-xs mt-4">
        Double-entry view • Tap entry to view source document
      </p>

      {/* Transaction Detail Dialog (for entries without source) */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription className="text-slate-400">
              Direct transaction without linked document
            </DialogDescription>
          </DialogHeader>
          
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-sm">Date</p>
                  <p className="text-white font-medium">{formatDate(selectedEntry.date)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Cash Account</p>
                  <p className="text-white font-medium">{selectedEntry.accountName}</p>
                </div>
              </div>
              
              <div>
                <p className="text-slate-400 text-sm">Description</p>
                <p className="text-white font-medium">{selectedEntry.description}</p>
              </div>
              
              {/* Affected Accounts */}
              <div>
                <p className="text-slate-400 text-sm mb-2">Affected Accounts</p>
                <div className="bg-slate-700/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-600 pb-1">
                    <span>Account</span>
                    <div className="flex gap-4">
                      <span className="w-20 text-right">Debit</span>
                      <span className="w-20 text-right">Credit</span>
                    </div>
                  </div>
                  {selectedEntry.affectedAccounts.map((acc, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className={`flex-1 ${
                        acc.accountType === 'cash' ? 'text-blue-400' :
                        acc.accountType === 'accounts_payable' ? 'text-orange-400' :
                        acc.accountType === 'accounts_receivable' ? 'text-purple-400' :
                        acc.accountType.includes('loan') ? 'text-amber-400' :
                        'text-white'
                      }`}>
                        {acc.accountName}
                      </span>
                      <div className="flex gap-4">
                        <span className={`w-20 text-right ${acc.debit > 0 ? 'text-red-400 font-medium' : 'text-slate-600'}`}>
                          {acc.debit > 0 ? formatCurrency(acc.debit, tenant.currency) : '—'}
                        </span>
                        <span className={`w-20 text-right ${acc.credit > 0 ? 'text-green-400 font-medium' : 'text-slate-600'}`}>
                          {acc.credit > 0 ? formatCurrency(acc.credit, tenant.currency) : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-slate-400 text-sm">Cash Balance After</p>
                <p className={`font-bold text-lg ${selectedEntry.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(selectedEntry.balance, tenant.currency)}
                </p>
              </div>
              
              <p className="text-slate-500 text-xs text-center">
                This transaction is not linked to a bill, invoice, or loan.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Date Range Dialog */}
      <Dialog open={customDateDialogOpen} onOpenChange={setCustomDateDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Custom Date Range</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select a custom date range for filtering
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Start Date</Label>
              <DateInput
                value={tempStartDate}
                onChange={setTempStartDate}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300">End Date</Label>
              <DateInput
                value={tempEndDate}
                onChange={setTempEndDate}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCustomDateDialogOpen(false)}
              className="border-slate-600 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={applyCustomDateRange}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
