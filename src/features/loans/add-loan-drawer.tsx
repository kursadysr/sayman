'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Landmark, Calculator } from 'lucide-react';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/format';
import { calculatePaymentAmount } from '@/lib/utils/loan-calculator';
import type { Contact, PaymentFrequency } from '@/lib/supabase/types';
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
    },
  });

  const watchType = form.watch('type');
  const watchPrincipal = form.watch('principal_amount');
  const watchRate = form.watch('interest_rate');
  const watchTerm = form.watch('term_months');
  const watchFrequency = form.watch('payment_frequency');

  // Calculate payment (only if frequency is set)
  const calculatedPayment = watchPrincipal > 0 && watchTerm > 0 && watchFrequency
    ? calculatePaymentAmount(
        watchPrincipal,
        watchRate / 100, // Convert percentage to decimal
        watchTerm,
        watchFrequency as PaymentFrequency
      )
    : 0;

  // Load contacts
  useEffect(() => {
    if (!tenant || !open) return;

    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name');

      setContacts((data || []) as Contact[]);
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
      });
    }
  }, [open, form]);

  const onSubmit = async (values: FormValues) => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.from('loans').insert({
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
      });

      if (error) throw error;

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
                      <FormLabel className="text-slate-300">Payment Frequency (Optional)</FormLabel>
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
                      <Input
                        type="date"
                        {...field}
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
                      per {watchFrequency === 'biweekly' ? 'bi-week' : watchFrequency.replace('ly', '')}
                    </span>
                  </div>
                </div>
              )}

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

