'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Landmark, Calendar, Percent, DollarSign, TrendingDown, TrendingUp,
  Plus, Trash2, ChevronDown, ChevronUp, Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { useRole } from '@/hooks/use-role';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate, checkAccountFunds } from '@/lib/utils/format';
import { 
  calculateNextPayment, 
  generateAmortizationSchedule,
  formatFrequency 
} from '@/lib/utils/loan-calculator';
import type { Loan, LoanPayment, Account, PaymentFrequency } from '@/lib/supabase/types';
import { toast } from 'sonner';
import { EditLoanDrawer } from './edit-loan-drawer';

interface LoanDetailsDrawerProps {
  loan: Loan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

// Payment with calculated running balance
interface PaymentWithBalance extends LoanPayment {
  calculatedBalance: number;
}

export function LoanDetailsDrawer({ loan, open, onOpenChange, onUpdate }: LoanDetailsDrawerProps) {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  
  // Payment form state
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentPrincipal, setPaymentPrincipal] = useState(0);
  const [paymentInterest, setPaymentInterest] = useState(0);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [customSplit, setCustomSplit] = useState(false);
  
  // Edit payment state
  const [editPaymentDialogOpen, setEditPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<LoanPayment | null>(null);

  // Calculate remaining balance dynamically from payments
  const { remainingBalance, totalPaidPrincipal, totalPaidInterest, paymentsWithBalance } = useMemo(() => {
    if (!loan) return { remainingBalance: 0, totalPaidPrincipal: 0, totalPaidInterest: 0, paymentsWithBalance: [] };
    
    // Sort payments by date ascending for calculation
    const sortedPayments = [...payments].sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    );
    
    let balance = loan.principal_amount;
    let totalPrincipal = 0;
    let totalInterest = 0;
    
    const withBalance: PaymentWithBalance[] = sortedPayments.map(payment => {
      balance -= payment.principal_amount;
      totalPrincipal += payment.principal_amount;
      totalInterest += payment.interest_amount;
      return {
        ...payment,
        calculatedBalance: Math.max(0, balance)
      };
    });
    
    // Reverse for display (newest first)
    withBalance.reverse();
    
    return { 
      remainingBalance: Math.max(0, balance), 
      totalPaidPrincipal: totalPrincipal,
      totalPaidInterest: totalInterest,
      paymentsWithBalance: withBalance 
    };
  }, [loan, payments]);

  // Load payments and accounts
  useEffect(() => {
    if (!loan || !tenant || !open) return;

    const load = async () => {
      setLoading(true);
      const supabase = createClient();

      const [paymentsRes, accountsRes] = await Promise.all([
        supabase
          .from('loan_payments')
          .select('*, account:accounts(name)')
          .eq('loan_id', loan.id)
          .order('payment_date', { ascending: false }),
        supabase
          .from('accounts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('name'),
      ]);

      setPayments((paymentsRes.data || []) as LoanPayment[]);
      setAccounts((accountsRes.data || []) as Account[]);
      setLoading(false);
    };

    load();
  }, [loan, tenant, open]);

  // Calculate suggested payment when dialog opens
  useEffect(() => {
    if (paymentDialogOpen && loan) {
      if (loan.payment_frequency) {
        const suggested = calculateNextPayment(
          remainingBalance,
          loan.interest_rate,
          loan.payment_frequency as PaymentFrequency,
          loan.monthly_payment || 0
        );
        setPaymentTotal(suggested.total);
        setPaymentPrincipal(suggested.principal);
        setPaymentInterest(suggested.interest);
      } else {
        // No payment frequency - default to remaining balance
        setPaymentTotal(remainingBalance);
        setPaymentPrincipal(remainingBalance);
        setPaymentInterest(0);
      }
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentAccountId('');
      setPaymentNotes('');
      setCustomSplit(false);
    }
  }, [paymentDialogOpen, loan, remainingBalance]);

  // Update principal/interest when total changes (auto-calculate unless custom split)
  const handleTotalChange = (total: number) => {
    setPaymentTotal(total);
    if (loan && !customSplit) {
      const interest = Math.min(
        Math.round(remainingBalance * (loan.interest_rate / 12) * 100) / 100,
        total
      );
      setPaymentInterest(interest);
      setPaymentPrincipal(Math.round((total - interest) * 100) / 100);
    }
  };

  // Recalculate when exiting custom split mode
  const handleCustomSplitToggle = (enabled: boolean) => {
    setCustomSplit(enabled);
    if (!enabled && loan) {
      // Recalculate based on current total
      const interest = Math.min(
        Math.round(remainingBalance * (loan.interest_rate / 12) * 100) / 100,
        paymentTotal
      );
      setPaymentInterest(interest);
      setPaymentPrincipal(Math.round((paymentTotal - interest) * 100) / 100);
    }
  };

  const handleRecordPayment = async () => {
    if (!loan || !tenant) return;

    // Account is required for proper bookkeeping
    if (!paymentAccountId) {
      toast.error('Please select an account');
      return;
    }

    // For payable loans (money going out), validate sufficient funds
    if (loan.type === 'payable') {
      const selectedAccount = accounts.find(acc => acc.id === paymentAccountId);
      if (selectedAccount) {
        const { hasFunds, available } = checkAccountFunds(selectedAccount, paymentTotal);
        if (!hasFunds) {
          const label = selectedAccount.type === 'credit' ? 'Available credit' : 'Available';
          toast.error(`Insufficient funds in ${selectedAccount.name}. ${label}: ${formatCurrency(available, tenant.currency)}`);
          return;
        }
      }
    }

    setSavingPayment(true);
    const supabase = createClient();

    try {
      // Create loan payment record (no remaining_balance stored)
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .insert({
          loan_id: loan.id,
          tenant_id: tenant.id,
          account_id: paymentAccountId,
          payment_date: paymentDate,
          total_amount: paymentTotal,
          principal_amount: paymentPrincipal,
          interest_amount: paymentInterest,
          notes: paymentNotes || null,
        });

      if (paymentError) throw paymentError;

      toast.success('Payment recorded');
      setPaymentDialogOpen(false);
      onUpdate?.();
      
      // Reload payments
      const { data: updatedPayments } = await supabase
        .from('loan_payments')
        .select('*, account:accounts(name)')
        .eq('loan_id', loan.id)
        .order('payment_date', { ascending: false });
      
      setPayments((updatedPayments || []) as LoanPayment[]);
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error('Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Delete this payment? This will also remove the associated transaction.')) return;

    const supabase = createClient();

    try {
      // 1. Delete associated transaction first (due to FK constraint)
      await supabase
        .from('transactions')
        .delete()
        .eq('loan_payment_id', paymentId);

      // 2. Delete loan payment
      const { error } = await supabase
        .from('loan_payments')
        .delete()
        .eq('id', paymentId);

      if (error) throw error;

      toast.success('Payment deleted');
      setPayments(payments.filter(p => p.id !== paymentId));
      onUpdate?.();
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast.error('Failed to delete payment');
    }
  };

  const handleEditPayment = (payment: LoanPayment) => {
    setEditingPayment(payment);
    setPaymentDate(payment.payment_date);
    setPaymentTotal(payment.total_amount);
    setPaymentPrincipal(payment.principal_amount);
    setPaymentInterest(payment.interest_amount);
    setPaymentAccountId(payment.account_id);
    setPaymentNotes(payment.notes || '');
    setCustomSplit(false); // Start with auto-calculate
    setEditPaymentDialogOpen(true);
  };

  const handleUpdatePayment = async () => {
    if (!loan || !tenant || !editingPayment) return;

    if (!paymentAccountId) {
      toast.error('Please select an account');
      return;
    }

    // For payable loans (money going out), validate sufficient funds
    // Consider the original payment amount that will be reversed
    if (loan.type === 'payable') {
      const selectedAccount = accounts.find(acc => acc.id === paymentAccountId);
      if (selectedAccount) {
        // Calculate effective available: current + original payment (if from same account)
        const originalWasFromSameAccount = editingPayment.account_id === paymentAccountId;
        const effectiveAccount = originalWasFromSameAccount 
          ? { ...selectedAccount, balance: selectedAccount.balance + editingPayment.total_amount }
          : selectedAccount;
        
        const { hasFunds, available } = checkAccountFunds(effectiveAccount, paymentTotal);
        if (!hasFunds) {
          const label = selectedAccount.type === 'credit' ? 'Available credit' : 'Available';
          toast.error(`Insufficient funds in ${selectedAccount.name}. ${label}: ${formatCurrency(available, tenant.currency)}`);
          return;
        }
      }
    }

    setSavingPayment(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('loan_payments')
        .update({
          account_id: paymentAccountId,
          payment_date: paymentDate,
          total_amount: paymentTotal,
          principal_amount: paymentPrincipal,
          interest_amount: paymentInterest,
          notes: paymentNotes || null,
        })
        .eq('id', editingPayment.id);

      if (error) throw error;

      toast.success('Payment updated');
      setEditPaymentDialogOpen(false);
      setEditingPayment(null);
      onUpdate?.();

      // Reload payments
      const { data: updatedPayments } = await supabase
        .from('loan_payments')
        .select('*, account:accounts(name)')
        .eq('loan_id', loan.id)
        .order('payment_date', { ascending: false });

      setPayments((updatedPayments || []) as LoanPayment[]);
    } catch (error) {
      console.error('Error updating payment:', error);
      toast.error('Failed to update payment');
    } finally {
      setSavingPayment(false);
    }
  };

  if (!loan || !tenant) return null;

  const progressPercent = ((loan.principal_amount - remainingBalance) / loan.principal_amount) * 100;
  const amortizationSchedule = loan.payment_frequency 
    ? generateAmortizationSchedule(
        loan.principal_amount,
        loan.interest_rate,
        loan.term_months,
        new Date(loan.start_date),
        loan.payment_frequency as PaymentFrequency
      )
    : [];

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-slate-800 border-slate-700 max-h-[90vh]">
          <div className="overflow-y-auto">
            <DrawerHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DrawerTitle className="text-white flex items-center gap-2">
                    {loan.type === 'payable' ? (
                      <TrendingDown className="h-5 w-5 text-red-400" />
                    ) : (
                      <TrendingUp className="h-5 w-5 text-emerald-400" />
                    )}
                    {loan.name}
                  </DrawerTitle>
                  <DrawerDescription className="text-slate-400">
                    {loan.type === 'payable' ? 'Loan Payable' : 'Loan Receivable'}
                    {loan.contact && ` • ${loan.contact.name}`}
                  </DrawerDescription>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditDrawerOpen(true)}
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {remainingBalance > 0 && (
                      <Button
                        size="sm"
                        onClick={() => setPaymentDialogOpen(true)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Payment
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </DrawerHeader>

            <div className="px-4 pb-6 space-y-6">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={
                    remainingBalance > 0
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }
                >
                  {remainingBalance > 0 ? 'Active' : 'Paid Off'}
                </Badge>
              </div>

              {/* Balance Card */}
              <div className="p-4 bg-slate-700/30 rounded-lg">
                <div className="text-sm text-slate-400 mb-1">Remaining Balance</div>
                <div className="text-3xl font-bold text-white">
                  {formatCurrency(remainingBalance, tenant.currency)}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  of {formatCurrency(loan.principal_amount, tenant.currency)} principal
                </div>
                
                {/* Progress Bar - Green for positive vibe */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Progress</span>
                    <span className="text-emerald-400 font-medium">{progressPercent.toFixed(1)}% paid</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full">
                    <div 
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${Math.min(100, progressPercent)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Loan Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Percent className="h-3 w-3" />
                    Interest Rate
                  </div>
                  <div className="text-white font-medium">
                    {(loan.interest_rate * 100).toFixed(2)}% APR
                  </div>
                </div>
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Calendar className="h-3 w-3" />
                    Term
                  </div>
                  <div className="text-white font-medium">
                    {loan.term_months} months
                  </div>
                </div>
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <DollarSign className="h-3 w-3" />
                    Payment
                  </div>
                  <div className="text-white font-medium">
                    {loan.payment_frequency ? (
                      <>
                        {formatCurrency(loan.monthly_payment || 0, tenant.currency)}
                        <span className="text-xs text-slate-400 ml-1">
                          {formatFrequency(loan.payment_frequency)}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400">No schedule</span>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Calendar className="h-3 w-3" />
                    Start Date
                  </div>
                  <div className="text-white font-medium">
                    {formatDate(loan.start_date)}
                  </div>
                </div>
              </div>

              {/* Totals - Calculated dynamically */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="text-sm text-emerald-400 mb-1">Total Principal Paid</div>
                  <div className="text-xl font-bold text-white">
                    {formatCurrency(totalPaidPrincipal, tenant.currency)}
                  </div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="text-sm text-amber-400 mb-1">Total Interest Paid</div>
                  <div className="text-xl font-bold text-white">
                    {formatCurrency(totalPaidInterest, tenant.currency)}
                  </div>
                </div>
              </div>

              {/* Amortization Schedule - only show if payment frequency is set */}
              {loan.payment_frequency && (
                <div>
                  <button
                    onClick={() => setShowSchedule(!showSchedule)}
                    className="flex items-center justify-between w-full p-3 bg-slate-700/30 rounded-lg text-white hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="font-medium">Amortization Schedule</span>
                    {showSchedule ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  
                  {showSchedule && (
                    <div className="mt-2 max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="text-slate-400 sticky top-0 bg-slate-800">
                          <tr>
                            <th className="text-left p-2">#</th>
                            <th className="text-left p-2">Date</th>
                            <th className="text-right p-2">Payment</th>
                            <th className="text-right p-2">Principal</th>
                            <th className="text-right p-2">Interest</th>
                            <th className="text-right p-2">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="text-white">
                          {amortizationSchedule.slice(0, 60).map((entry) => (
                            <tr key={entry.paymentNumber} className="border-t border-slate-700">
                              <td className="p-2">{entry.paymentNumber}</td>
                              <td className="p-2">{formatDate(entry.paymentDate)}</td>
                              <td className="text-right p-2">
                                {formatCurrency(entry.paymentAmount, tenant.currency)}
                              </td>
                              <td className="text-right p-2 text-emerald-400">
                                {formatCurrency(entry.principalAmount, tenant.currency)}
                              </td>
                              <td className="text-right p-2 text-amber-400">
                                {formatCurrency(entry.interestAmount, tenant.currency)}
                              </td>
                              <td className="text-right p-2">
                                {formatCurrency(entry.remainingBalance, tenant.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Payment History */}
              <div>
                <h3 className="text-lg font-medium text-white mb-3">Payment History</h3>
                {loading ? (
                  <div className="text-slate-400 text-center py-4">Loading...</div>
                ) : paymentsWithBalance.length === 0 ? (
                  <div className="text-slate-400 text-center py-8">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                    <p>No payments recorded yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paymentsWithBalance.map((payment) => (
                      <div
                        key={payment.id}
                        className="p-3 bg-slate-700/30 rounded-lg flex items-center justify-between group"
                      >
                        <div>
                          <div className="text-white font-medium">
                            {formatCurrency(payment.total_amount, tenant.currency)}
                          </div>
                          <div className="text-xs text-slate-400">
                            {formatDate(payment.payment_date)}
                            {' • '}
                            <span className="text-emerald-400">
                              {formatCurrency(payment.principal_amount, tenant.currency)} principal
                            </span>
                            {' + '}
                            <span className="text-amber-400">
                              {formatCurrency(payment.interest_amount, tenant.currency)} interest
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">
                            Bal: {formatCurrency(payment.calculatedBalance, tenant.currency)}
                          </span>
                          {canWrite && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditPayment(payment)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-300 h-7 w-7"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeletePayment(payment.id)}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 h-7 w-7"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Record Payment
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Record a payment for {loan.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Payment Date</Label>
                <DateInput
                  value={paymentDate}
                  onChange={(value) => setPaymentDate(value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-300">Total Payment</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentTotal}
                  onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)}
                  className="mt-1 bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-300">
                {loan.type === 'payable' ? 'Pay From Account' : 'Receive To Account'}
              </Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger className="mt-1 bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id} className="text-white">
                      {acc.name} ({formatCurrency(acc.balance, tenant.currency)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Calculated breakdown */}
            <div className="p-3 bg-slate-700/30 rounded-lg space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Payment breakdown</span>
                <button
                  type="button"
                  onClick={() => handleCustomSplitToggle(!customSplit)}
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >
                  {customSplit ? 'Auto calculate' : 'Adjust split'}
                </button>
              </div>
              
              {customSplit ? (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <Label className="text-xs text-slate-400">Principal</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentPrincipal}
                      onChange={(e) => setPaymentPrincipal(parseFloat(e.target.value) || 0)}
                      className="mt-1 h-8 bg-slate-700/50 border-slate-600 text-white text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400">Interest</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentInterest}
                      onChange={(e) => setPaymentInterest(parseFloat(e.target.value) || 0)}
                      className="mt-1 h-8 bg-slate-700/50 border-slate-600 text-white text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-slate-400">Principal: </span>
                    <span className="text-emerald-400 font-medium">
                      {formatCurrency(paymentPrincipal, tenant.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Interest: </span>
                    <span className="text-amber-400 font-medium">
                      {formatCurrency(paymentInterest, tenant.currency)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Balance after payment */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Balance after payment</span>
                <span className="text-lg font-bold text-white">
                  {formatCurrency(Math.max(0, remainingBalance - paymentPrincipal), tenant.currency)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
              className="border-slate-600 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={savingPayment || paymentTotal <= 0}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {savingPayment ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Loan Drawer */}
      <EditLoanDrawer
        loan={loan}
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        onSuccess={() => {
          onOpenChange(false);
          onUpdate?.();
        }}
      />

      {/* Edit Payment Dialog */}
      <Dialog open={editPaymentDialogOpen} onOpenChange={(open) => {
        setEditPaymentDialogOpen(open);
        if (!open) setEditingPayment(null);
      }}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Payment
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Update payment details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Payment Date</Label>
                <DateInput
                  value={paymentDate}
                  onChange={(value) => setPaymentDate(value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-slate-300">Total Payment</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentTotal}
                  onChange={(e) => handleTotalChange(parseFloat(e.target.value) || 0)}
                  className="mt-1 bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-300">
                {loan.type === 'payable' ? 'Paid From Account' : 'Received To Account'}
              </Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger className="mt-1 bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id} className="text-white">
                      {acc.name} ({formatCurrency(acc.balance, tenant.currency)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Calculated breakdown */}
            <div className="p-3 bg-slate-700/30 rounded-lg space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Payment breakdown</span>
                <button
                  type="button"
                  onClick={() => handleCustomSplitToggle(!customSplit)}
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >
                  {customSplit ? 'Auto calculate' : 'Adjust split'}
                </button>
              </div>
              
              {customSplit ? (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <Label className="text-xs text-slate-400">Principal</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentPrincipal}
                      onChange={(e) => setPaymentPrincipal(parseFloat(e.target.value) || 0)}
                      className="mt-1 h-8 bg-slate-700/50 border-slate-600 text-white text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400">Interest</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentInterest}
                      onChange={(e) => setPaymentInterest(parseFloat(e.target.value) || 0)}
                      className="mt-1 h-8 bg-slate-700/50 border-slate-600 text-white text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-between text-sm">
                  <div>
                    <span className="text-slate-400">Principal: </span>
                    <span className="text-emerald-400 font-medium">
                      {formatCurrency(paymentPrincipal, tenant.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Interest: </span>
                    <span className="text-amber-400 font-medium">
                      {formatCurrency(paymentInterest, tenant.currency)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-slate-300">Notes (optional)</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Payment notes..."
                className="mt-1 bg-slate-700/50 border-slate-600 text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditPaymentDialogOpen(false)}
              className="border-slate-600 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePayment}
              disabled={savingPayment || paymentTotal <= 0}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {savingPayment ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
