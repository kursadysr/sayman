'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpCircle, ArrowDownCircle, Receipt, BookOpen, Filter, Landmark, ExternalLink } from 'lucide-react';
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
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Account } from '@/lib/supabase/types';

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
  const [loading, setLoading] = useState(true);
  
  // Detail dialog for transactions without source
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

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
    
    const filteredTxs = selectedAccountId === 'all' 
      ? transactions 
      : transactions.filter(tx => tx.account_id === selectedAccountId);

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
        billId,
        invoiceId,
        loanId,
      });
    });

    return entries;
  }, [transactions, accounts, selectedAccountId]);

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

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-emerald-400" />
            General Ledger
          </h1>
          <p className="text-slate-400 text-sm">Tap any entry to view details</p>
        </div>
        
        {/* Account Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="flex-1 bg-slate-800 border-slate-700 text-white">
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
      </div>

      {/* Summary Cards - 2x2 Grid on Mobile */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <p className="text-slate-400 text-xs mb-1">Opening</p>
            <p className={`text-lg font-bold ${openingBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
              {formatCurrency(openingBalance, tenant.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <p className="text-slate-400 text-xs mb-1">Closing</p>
            <p className={`text-lg font-bold ${closingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(closingBalance, tenant.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
              <ArrowDownCircle className="h-3 w-3 text-red-400" />
              Debits
            </div>
            <p className="text-lg font-bold text-red-400">
              {formatCurrency(totals.debit, tenant.currency)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
              <ArrowUpCircle className="h-3 w-3 text-green-400" />
              Credits
            </div>
            <p className="text-lg font-bold text-green-400">
              {formatCurrency(totals.credit, tenant.currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Entries - Mobile Card View */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
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
              {/* Opening Balance Row */}
              <div className="p-3 bg-slate-700/30">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm italic">Opening Balance</span>
                  <span className={`font-bold ${openingBalance >= 0 ? 'text-white' : 'text-red-400'}`}>
                    {formatCurrency(openingBalance, tenant.currency)}
                  </span>
                </div>
              </div>

              {/* Transaction Entries */}
              {ledgerEntries.map((entry) => (
                <div 
                  key={entry.id} 
                  onClick={() => handleEntryClick(entry)}
                  className="p-3 hover:bg-slate-700/30 transition-colors cursor-pointer active:bg-slate-700/50"
                >
                  {/* Row 1: Date & Account (if showing all) */}
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>{formatDate(entry.date)}</span>
                    <div className="flex items-center gap-2">
                      {selectedAccountId === 'all' && (
                        <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-xs">
                          {entry.accountName}
                        </Badge>
                      )}
                      {hasLink(entry) && (
                        <ExternalLink className="h-3 w-3 text-slate-500" />
                      )}
                    </div>
                  </div>
                  
                  {/* Row 2: Description */}
                  <p className="text-white text-sm font-medium mb-1 line-clamp-1">
                    {entry.description}
                  </p>
                  
                  {/* Row 3: Reference & Amounts */}
                  <div className="flex items-center justify-between">
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
                    </div>
                    
                    <div className="flex items-center gap-3 text-sm">
                      {/* Debit/Credit */}
                      {entry.debit > 0 ? (
                        <span className="text-red-400 font-medium">
                          -{formatCurrency(entry.debit, tenant.currency)}
                        </span>
                      ) : (
                        <span className="text-green-400 font-medium">
                          +{formatCurrency(entry.credit, tenant.currency)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Row 4: Running Balance */}
                  <div className="flex justify-end mt-1">
                    <span className={`text-xs ${entry.balance >= 0 ? 'text-slate-400' : 'text-red-400'}`}>
                      Bal: {formatCurrency(entry.balance, tenant.currency)}
                    </span>
                  </div>
                </div>
              ))}

              {/* Closing Balance Row */}
              <div className="p-3 bg-slate-700/30">
                <div className="flex justify-between items-center">
                  <div className="text-sm">
                    <span className="text-slate-400 italic">Closing Balance</span>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Debits: <span className="text-red-400">{formatCurrency(totals.debit, tenant.currency)}</span>
                      {' • '}
                      Credits: <span className="text-green-400">{formatCurrency(totals.credit, tenant.currency)}</span>
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${closingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatCurrency(closingBalance, tenant.currency)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-slate-500 text-xs mt-4">
        Debits = Cash out • Credits = Cash in • Tap entry to view source
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
                  <p className="text-slate-400 text-sm">Account</p>
                  <p className="text-white font-medium">{selectedEntry.accountName}</p>
                </div>
              </div>
              
              <div>
                <p className="text-slate-400 text-sm">Description</p>
                <p className="text-white font-medium">{selectedEntry.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <p className="text-slate-400 text-sm">Debit (Out)</p>
                  <p className="text-red-400 font-bold text-lg">
                    {selectedEntry.debit > 0 
                      ? formatCurrency(selectedEntry.debit, tenant.currency) 
                      : '—'}
                  </p>
                </div>
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <p className="text-slate-400 text-sm">Credit (In)</p>
                  <p className="text-green-400 font-bold text-lg">
                    {selectedEntry.credit > 0 
                      ? formatCurrency(selectedEntry.credit, tenant.currency) 
                      : '—'}
                  </p>
                </div>
              </div>
              
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <p className="text-slate-400 text-sm">Balance After</p>
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
    </div>
  );
}
