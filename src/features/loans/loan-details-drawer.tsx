'use client';

import { useState, useEffect } from 'react';
import { 
  Landmark, Calendar, Percent, DollarSign, TrendingDown, TrendingUp,
  Plus, Trash2, ChevronDown, ChevronUp
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
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { 
  calculateNextPayment, 
  generateAmortizationSchedule,
  formatFrequency 
} from '@/lib/utils/loan-calculator';
import type { Loan, LoanPayment, Account, PaymentFrequency } from '@/lib/supabase/types';
import { toast } from 'sonner';

interface LoanDetailsDrawerProps {
  loan: Loan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

export function LoanDetailsDrawer({ loan, open, onOpenChange, onUpdate }: LoanDetailsDrawerProps) {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  
  // Payment form state
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentPrincipal, setPaymentPrincipal] = useState(0);
  const [paymentInterest, setPaymentInterest] = useState(0);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

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
      const suggested = calculateNextPayment(
        loan.remaining_balance,
        loan.interest_rate,
        loan.payment_frequency as PaymentFrequency,
        loan.monthly_payment || 0
      );
      setPaymentTotal(suggested.total);
      setPaymentPrincipal(suggested.principal);
      setPaymentInterest(suggested.interest);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentAccountId('');
      setPaymentNotes('');
    }
  }, [paymentDialogOpen, loan]);

  // Update principal/interest when total changes
  const handleTotalChange = (total: number) => {
    setPaymentTotal(total);
    if (loan) {
      const interest = Math.min(
        Math.round(loan.remaining_balance * (loan.interest_rate / 12) * 100) / 100,
        total
      );
      setPaymentInterest(interest);
      setPaymentPrincipal(Math.round((total - interest) * 100) / 100);
    }
  };

  const handleRecordPayment = async () => {
    if (!loan || !tenant) return;

    setSavingPayment(true);
    const supabase = createClient();

    try {
      const newBalance = Math.round((loan.remaining_balance - paymentPrincipal) * 100) / 100;

      const { error } = await supabase.from('loan_payments').insert({
        loan_id: loan.id,
        tenant_id: tenant.id,
        account_id: paymentAccountId || null,
        payment_date: paymentDate,
        total_amount: paymentTotal,
        principal_amount: paymentPrincipal,
        interest_amount: paymentInterest,
        remaining_balance: Math.max(0, newBalance),
        notes: paymentNotes || null,
      });

      if (error) throw error;

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
    if (!confirm('Delete this payment?')) return;

    const supabase = createClient();

    try {
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

  if (!loan || !tenant) return null;

  const progressPercent = ((loan.principal_amount - loan.remaining_balance) / loan.principal_amount) * 100;
  const amortizationSchedule = generateAmortizationSchedule(
    loan.principal_amount,
    loan.interest_rate,
    loan.term_months,
    new Date(loan.start_date),
    loan.payment_frequency as PaymentFrequency
  );

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
                {canWrite && loan.status === 'active' && (
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
            </DrawerHeader>

            <div className="px-4 pb-6 space-y-6">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={
                    loan.status === 'active' 
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : loan.status === 'paid_off'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }
                >
                  {loan.status === 'active' ? 'Active' : loan.status === 'paid_off' ? 'Paid Off' : 'Defaulted'}
                </Badge>
              </div>

              {/* Balance Card */}
              <div className="p-4 bg-slate-700/30 rounded-lg">
                <div className="text-sm text-slate-400 mb-1">Remaining Balance</div>
                <div className={`text-3xl font-bold ${
                  loan.type === 'payable' ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {formatCurrency(loan.remaining_balance, tenant.currency)}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  of {formatCurrency(loan.principal_amount, tenant.currency)} principal
                </div>
                
                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Progress</span>
                    <span>{progressPercent.toFixed(1)}% paid</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full">
                    <div 
                      className={`h-full rounded-full ${
                        loan.type === 'payable' ? 'bg-red-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${progressPercent}%` }}
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
                    {formatCurrency(loan.monthly_payment || 0, tenant.currency)}
                    <span className="text-xs text-slate-400 ml-1">
                      {formatFrequency(loan.payment_frequency)}
                    </span>
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

              {/* Totals */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="text-sm text-emerald-400 mb-1">Total Principal Paid</div>
                  <div className="text-xl font-bold text-white">
                    {formatCurrency(loan.total_paid_principal, tenant.currency)}
                  </div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <div className="text-sm text-amber-400 mb-1">Total Interest Paid</div>
                  <div className="text-xl font-bold text-white">
                    {formatCurrency(loan.total_paid_interest, tenant.currency)}
                  </div>
                </div>
              </div>

              {/* Amortization Schedule */}
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
                            <td className="p-2">{entry.paymentDate.toLocaleDateString()}</td>
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

              {/* Payment History */}
              <div>
                <h3 className="text-lg font-medium text-white mb-3">Payment History</h3>
                {loading ? (
                  <div className="text-slate-400 text-center py-4">Loading...</div>
                ) : payments.length === 0 ? (
                  <div className="text-slate-400 text-center py-8">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                    <p>No payments recorded yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {payments.map((payment) => (
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
                            Bal: {formatCurrency(payment.remaining_balance, tenant.currency)}
                          </span>
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeletePayment(payment.id)}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 h-7 w-7"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
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
            <div>
              <Label className="text-slate-300">Payment Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 bg-slate-700/50 border-slate-600 text-white"
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Principal</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentPrincipal}
                  onChange={(e) => setPaymentPrincipal(parseFloat(e.target.value) || 0)}
                  className="mt-1 bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Interest</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentInterest}
                  onChange={(e) => setPaymentInterest(parseFloat(e.target.value) || 0)}
                  className="mt-1 bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-300">Pay From Account</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger className="mt-1 bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue placeholder="Select account (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="" className="text-slate-400">No account</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id} className="text-white">
                      {acc.name} ({formatCurrency(acc.balance, tenant.currency)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-slate-700/30 rounded-lg">
              <div className="text-sm text-slate-400">Balance after payment</div>
              <div className="text-xl font-bold text-white">
                {formatCurrency(Math.max(0, loan.remaining_balance - paymentPrincipal), tenant.currency)}
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
    </>
  );
}

