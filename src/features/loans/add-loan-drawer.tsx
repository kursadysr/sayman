'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Landmark, Calculator, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/format';
import { calculatePaymentAmount } from '@/lib/utils/loan-calculator';
import type { Contact, Account, PaymentFrequency } from '@/lib/supabase/types';
import { toast } from 'sonner';

const formSchema = z.object({
  type: z.enum(['payable', 'receivable']),
  name: z.string().min(1, 'Name is required'),
  contact_id: z.string().optional(),
  principal_amount: z.number().min(0.01, 'Amount must be greater than 0'),
  interest_rate: z.number().min(0).max(100, 'Rate must be between 0 and 100'),
  term_months: z.number().min(1, 'Term must be at least 1 month'),
  payment_frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annually']).optional(),
  start_date: z.string().min(1, 'Start date is required'),
  notes: z.string().optional(),
  // Double-entry accounting: disbursement account
  record_disbursement: z.boolean().default(true),
  account_id: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddLoanDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddLoanDrawer({ open, onOpenChange, onSuccess }: AddLoanDrawerProps) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'payable',
      name: '',
      contact_id: '',
      principal_amount: 0,
      interest_rate: 0,
      term_months: 12,
      payment_frequency: undefined,
      start_date: new Date().toISOString().split('T')[0],
      notes: '',
      record_disbursement: true,
      account_id: '',
    },
  });

  const watchType = form.watch('type');
  const watchPrincipal = form.watch('principal_amount');
  const watchRate = form.watch('interest_rate');
  const watchTerm = form.watch('term_months');
  const watchFrequency = form.watch('payment_frequency');
  const watchRecordDisbursement = form.watch('record_disbursement');

  // Calculate payment (only if frequency is set)
  const calculatedPayment = watchPrincipal > 0 && watchTerm > 0 && watchFrequency
    ? calculatePaymentAmount(
        watchPrincipal,
        watchRate / 100, // Convert percentage to decimal
        watchTerm,
        watchFrequency as PaymentFrequency
      )
    : 0;

  // Load contacts and accounts
  useEffect(() => {
    if (!tenant || !open) return;

    const load = async () => {
      const supabase = createClient();
      const [contactsRes, accountsRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('name'),
        supabase
          .from('accounts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('name'),
      ]);

      setContacts((contactsRes.data || []) as Contact[]);
      setAccounts((accountsRes.data || []) as Account[]);
    };

    load();
  }, [tenant, open]);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      form.reset({
        type: 'payable',
        name: '',
        contact_id: '',
        principal_amount: 0,
        interest_rate: 0,
        term_months: 12,
        payment_frequency: undefined,
        start_date: new Date().toISOString().split('T')[0],
        notes: '',
        record_disbursement: true,
        account_id: '',
      });
    }
  }, [open, form]);

  const onSubmit = async (values: FormValues) => {
    if (!tenant) return;

    // Validate account is selected if recording disbursement
    if (values.record_disbursement && !values.account_id) {
      toast.error('Please select an account for the disbursement');
      return;
    }

    // For receivable loans (money going OUT), validate sufficient funds for non-credit accounts
    if (values.record_disbursement && values.account_id && values.type === 'receivable') {
      const selectedAccount = accounts.find(acc => acc.id === values.account_id);
      if (selectedAccount && selectedAccount.type !== 'credit') {
        if (selectedAccount.balance < values.principal_amount) {
          toast.error(`Insufficient funds in ${selectedAccount.name}. Available: ${formatCurrency(selectedAccount.balance, tenant.currency)}`);
          return;
        }
      }
    }

    setLoading(true);
    const supabase = createClient();

    try {
      // 1. Create the loan
      const { data: loan, error: loanError } = await supabase.from('loans').insert({
        tenant_id: tenant.id,
        type: values.type,
        name: values.name,
        contact_id: values.contact_id || null,
        principal_amount: values.principal_amount,
        interest_rate: values.interest_rate / 100, // Store as decimal
        term_months: values.term_months,
        payment_frequency: values.payment_frequency || null,
        start_date: values.start_date,
        monthly_payment: calculatedPayment || null,
        remaining_balance: values.principal_amount,
        notes: values.notes || null,
      }).select().single();

      if (loanError) throw loanError;

      // 2. Create initial disbursement transaction (double-entry)
      if (values.record_disbursement && values.account_id) {
        // Payable = I borrowed = Cash IN (positive)
        // Receivable = I lent = Cash OUT (negative)
        const amount = values.type === 'payable' 
          ? values.principal_amount 
          : -values.principal_amount;

        const description = values.type === 'payable'
          ? `Loan received: ${values.name}`
          : `Loan disbursed: ${values.name}`;

        const { error: txError } = await supabase.from('transactions').insert({
          tenant_id: tenant.id,
          account_id: values.account_id,
          date: values.start_date,
          amount,
          description,
          status: 'cleared',
        });

        if (txError) {
          console.error('Error creating disbursement transaction:', txError);
          // Don't fail the whole operation, loan is already created
          toast.warning('Loan created but disbursement transaction failed');
        }
      }

      toast.success('Loan added successfully');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error adding loan:', error);
      toast.error('Failed to add loan');
    } finally {
      setLoading(false);
    }
  };

  if (!tenant) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-slate-800 border-slate-700 max-h-[90vh]">
        <div className="overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle className="text-white flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Add Loan
            </DrawerTitle>
            <DrawerDescription className="text-slate-400">
              Track a loan you've borrowed or lent out
            </DrawerDescription>
          </DrawerHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 space-y-4">
              {/* Type Selection */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Loan Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="payable" className="text-white">
                          Payable (I borrowed money)
                        </SelectItem>
                        <SelectItem value="receivable" className="text-white">
                          Receivable (I lent money)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Loan Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Car Loan, Bank Loan"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contact_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">
                      {watchType === 'payable' ? 'Lender' : 'Borrower'} (Optional)
                    </FormLabel>
                    <Select onValueChange={(v) => field.onChange(v === 'none' ? '' : v)} value={field.value || 'none'}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue placeholder="Select contact" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="none" className="text-slate-400">
                          No contact
                        </SelectItem>
                        {contacts.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id} className="text-white">
                            {contact.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="principal_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Principal Amount</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          className="bg-slate-700/50 border-slate-600 text-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="interest_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Interest Rate (% APR)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          className="bg-slate-700/50 border-slate-600 text-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="term_months"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Term (Months)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="12"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          className="bg-slate-700/50 border-slate-600 text-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="payment_frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Payment Frequency</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)} value={field.value || 'none'}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                            <SelectValue placeholder="No schedule" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="none" className="text-slate-400">No schedule</SelectItem>
                          <SelectItem value="weekly" className="text-white">Weekly</SelectItem>
                          <SelectItem value="biweekly" className="text-white">Bi-weekly</SelectItem>
                          <SelectItem value="monthly" className="text-white">Monthly</SelectItem>
                          <SelectItem value="quarterly" className="text-white">Quarterly</SelectItem>
                          <SelectItem value="annually" className="text-white">Annually</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Start Date</FormLabel>
                    <FormControl>
                      <DateInput
                        value={field.value}
                        onChange={field.onChange}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Calculated Payment */}
              {calculatedPayment > 0 && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-emerald-400 mb-2">
                    <Calculator className="h-4 w-4" />
                    <span className="text-sm font-medium">Calculated Payment</span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {formatCurrency(calculatedPayment, tenant.currency)}
                    <span className="text-sm font-normal text-slate-400 ml-2">
                      per {watchFrequency === 'biweekly' ? 'bi-week' : watchFrequency?.replace('ly', '')}
                    </span>
                  </div>
                </div>
              )}

              {/* Disbursement Account - Double Entry Bookkeeping */}
              <div className="p-4 bg-slate-700/30 rounded-lg space-y-4">
                <FormField
                  control={form.control}
                  name="record_disbursement"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="text-slate-300">
                          Record Cash {watchType === 'payable' ? 'Received' : 'Disbursed'}
                        </FormLabel>
                        <FormDescription className="text-slate-500 text-xs">
                          {watchType === 'payable' 
                            ? 'Record the loan amount received in your account'
                            : 'Record the loan amount given from your account'
                          }
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {watchRecordDisbursement && (
                  <FormField
                    control={form.control}
                    name="account_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">
                          {watchType === 'payable' ? 'Deposit To' : 'Pay From'}
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {accounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id} className="text-white">
                                {acc.name} ({formatCurrency(acc.balance, tenant.currency)})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {watchRecordDisbursement && watchPrincipal > 0 && (
                  <div className="flex items-start gap-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs">
                    <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <span className="text-blue-300">
                      {watchType === 'payable' 
                        ? `${formatCurrency(watchPrincipal, tenant.currency)} will be added to your account (loan received)`
                        : `${formatCurrency(watchPrincipal, tenant.currency)} will be deducted from your account (loan given)`
                      }
                    </span>
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional notes about this loan"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white resize-none"
                        rows={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DrawerFooter className="px-0">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {loading ? 'Adding...' : 'Add Loan'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="w-full border-slate-600 text-slate-300"
                >
                  Cancel
                </Button>
              </DrawerFooter>
            </form>
          </Form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
