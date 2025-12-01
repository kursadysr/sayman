'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
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
import type { Account, Category, Contact } from '@/lib/supabase/types';
import { toast } from 'sonner';

const formSchema = z.object({
  amount: z.string().min(1, 'Amount is required'),
  description: z.string().optional(),
  category_id: z.string().optional(),
  account_id: z.string().optional(),
  vendor_id: z.string().optional(),
  date: z.string(),
  due_date: z.string().optional(),
  isPaid: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddTransactionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  type?: 'expense' | 'income';
}

export function AddTransactionDrawer({
  open,
  onOpenChange,
  onSuccess,
  type = 'expense',
}: AddTransactionDrawerProps) {
  const { tenant } = useTenant();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: '',
      description: '',
      category_id: '',
      account_id: '',
      vendor_id: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      due_date: '',
      isPaid: true,
    },
  });

  const isPaid = form.watch('isPaid');

  useEffect(() => {
    if (!tenant || !open) return;

    const loadData = async () => {
      const supabase = createClient();

      const [accountsRes, categoriesRes, vendorsRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('tenant_id', tenant.id),
        supabase
          .from('categories')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('type', type === 'expense' ? 'expense' : 'income'),
        supabase
          .from('contacts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('type', 'vendor'),
      ]);

      setAccounts((accountsRes.data || []) as Account[]);
      setCategories((categoriesRes.data || []) as Category[]);
      setVendors((vendorsRes.data || []) as Contact[]);

      // Set default account
      if (accountsRes.data && accountsRes.data.length > 0) {
        form.setValue('account_id', accountsRes.data[0].id);
      }
    };

    loadData();
  }, [tenant, open, type, form]);

  const onSubmit = async (values: FormValues) => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();
    const amount = parseFloat(values.amount) * (type === 'expense' ? -1 : 1);

    try {
      if (values.isPaid) {
        // Create direct transaction
        const { error } = await supabase.from('transactions').insert({
          tenant_id: tenant.id,
          account_id: values.account_id,
          category_id: values.category_id || null,
          date: values.date,
          amount,
          description: values.description || null,
          status: 'cleared',
        });

        if (error) throw error;
        toast.success('Transaction added successfully');
      } else {
        // Create bill (Accounts Payable)
        const { error } = await supabase.from('bills').insert({
          tenant_id: tenant.id,
          vendor_id: values.vendor_id || null,
          category_id: values.category_id || null,
          issue_date: values.date,
          due_date: values.due_date || null,
          total_amount: Math.abs(amount),
          description: values.description || null,
          status: 'unpaid',
        });

        if (error) throw error;
        toast.success('Bill created successfully');
      }

      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-slate-800 border-slate-700">
        <DrawerHeader>
          <DrawerTitle className="text-white">
            Add {type === 'expense' ? 'Expense' : 'Income'}
          </DrawerTitle>
        </DrawerHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      className="bg-slate-700/50 border-slate-600 text-white text-2xl h-14"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Description</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="What was this for?"
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
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id} className="text-white">
                          {cat.name}
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
                  <FormLabel className="text-slate-300">Date</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="date"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white pl-10"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Paid Now Toggle */}
            <FormField
              control={form.control}
              name="isPaid"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-slate-600 p-4">
                  <div>
                    <FormLabel className="text-white">Paid Now?</FormLabel>
                    <p className="text-sm text-slate-400">
                      {field.value ? 'This will be recorded as a transaction' : 'This will be saved as a bill'}
                    </p>
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

            {isPaid ? (
              <FormField
                control={form.control}
                name="account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Account</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id} className="text-white">
                            {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="vendor_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Vendor</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                            <SelectValue placeholder="Select vendor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {vendors.map((v) => (
                            <SelectItem key={v.id} value={v.id} className="text-white">
                              {v.name}
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
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Due Date</FormLabel>
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
              </>
            )}
          </form>
        </Form>

        <DrawerFooter className="mt-4">
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {loading ? 'Saving...' : isPaid ? 'Add Transaction' : 'Create Bill'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline" className="border-slate-600 text-slate-300">
              Cancel
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

