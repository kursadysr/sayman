'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
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
import type { Bill, Account } from '@/lib/supabase/types';
import { toast } from 'sonner';

const formSchema = z.object({
  amount: z.string().min(1, 'Amount is required'),
  account_id: z.string().min(1, 'Account is required'),
  date: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

interface RecordPaymentDialogProps {
  bill: Bill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  paidAmount?: number;
}

export function RecordPaymentDialog({
  bill,
  open,
  onOpenChange,
  onSuccess,
  paidAmount = 0,
}: RecordPaymentDialogProps) {
  const { tenant } = useTenant();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);

  const remainingAmount = bill ? bill.total_amount - paidAmount : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: '',
      account_id: '',
      date: format(new Date(), 'yyyy-MM-dd'),
    },
  });

  useEffect(() => {
    if (!tenant || !open) return;

    const loadAccounts = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('tenant_id', tenant.id);
      
      setAccounts((data || []) as Account[]);
      
      if (data && data.length > 0) {
        form.setValue('account_id', data[0].id);
      }
    };

    loadAccounts();
  }, [tenant, open, form]);

  useEffect(() => {
    if (remainingAmount > 0) {
      form.setValue('amount', remainingAmount.toString());
    }
  }, [remainingAmount, form]);

  const onSubmit = async (values: FormValues) => {
    if (!tenant || !bill) return;

    setLoading(true);
    const supabase = createClient();
    const paymentAmount = parseFloat(values.amount);

    try {
      // Create payment transaction (cash outflow)
      const { error: txError } = await supabase.from('transactions').insert({
        tenant_id: tenant.id,
        account_id: values.account_id,
        date: values.date,
        amount: -paymentAmount, // Negative for expense/payment
        description: `Payment: ${bill.description || bill.bill_number || 'Bill'}`,
        status: 'cleared',
        bill_id: bill.id,
      });

      if (txError) throw txError;

      // Calculate new status
      const newPaidAmount = paidAmount + paymentAmount;
      let newStatus: 'unpaid' | 'partial' | 'paid' = 'partial';
      
      if (newPaidAmount >= bill.total_amount) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      // Update bill status
      const { error: billError } = await supabase
        .from('bills')
        .update({ status: newStatus })
        .eq('id', bill.id);

      if (billError) throw billError;

      toast.success('Payment recorded successfully');
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error('Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  if (!bill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription className="text-slate-400">
            Bill Amount: {formatCurrency(bill.total_amount, tenant?.currency)}
            <br />
            Remaining: {formatCurrency(remainingAmount, tenant?.currency)}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Payment Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      max={remainingAmount}
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
              name="account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Pay From Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id} className="text-white">
                          {acc.name} ({formatCurrency(acc.balance, tenant?.currency)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Payment Date</FormLabel>
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-slate-600 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {loading ? 'Recording...' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

