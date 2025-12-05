'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Plus, Trash2, CheckCircle } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import type { Contact, Account } from '@/lib/supabase/types';
import { toast } from 'sonner';

const lineSchema = z.object({
  description: z.string().min(1, 'Description required'),
  quantity: z.number().min(0.01),
  unit_price: z.number().min(0),
  tax_rate: z.number().min(0).max(100),
});

const formSchema = z.object({
  customer_id: z.string().optional(),
  account_id: z.string().optional(),
  invoice_number: z.string().optional(),
  layout_type: z.enum(['service', 'product']),
  issue_date: z.string(),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
});

type FormValues = z.infer<typeof formSchema>;

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateInvoiceDialogProps) {
  const { tenant } = useTenant();
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [markAsPaid, setMarkAsPaid] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customer_id: '',
      account_id: '',
      invoice_number: '',
      layout_type: 'product',
      issue_date: format(new Date(), 'yyyy-MM-dd'),
      due_date: '',
      notes: '',
      lines: [{ description: '', quantity: 1, unit_price: 0, tax_rate: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const layoutType = form.watch('layout_type');
  const lines = form.watch('lines');

  const calculateTotal = () => {
    return lines.reduce((sum, line) => {
      const lineTotal = line.quantity * line.unit_price;
      const tax = lineTotal * (line.tax_rate / 100);
      return sum + lineTotal + tax;
    }, 0);
  };

  useEffect(() => {
    if (!tenant || !open) return;

    const loadData = async () => {
      const supabase = createClient();
      
      const [customersRes, accountsRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('type', 'customer'),
        supabase
          .from('accounts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('name'),
      ]);
      
      setCustomers((customersRes.data || []) as Contact[]);
      setAccounts((accountsRes.data || []) as Account[]);
    };

    loadData();
  }, [tenant, open]);

  const onSubmit = async (values: FormValues) => {
    if (!tenant) return;

    const total = calculateTotal();
    if (total <= 0) {
      toast.error('Total must be greater than 0');
      return;
    }

    // If paid, account is required
    if (markAsPaid && !values.account_id) {
      toast.error('Please select an account');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      // Create invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          tenant_id: tenant.id,
          customer_id: values.customer_id || null,
          invoice_number: values.invoice_number || null,
          layout_type: values.layout_type,
          issue_date: values.issue_date,
          due_date: values.due_date || null,
          notes: values.notes || null,
          status: markAsPaid ? 'paid' : 'draft',
        })
        .select()
        .single();

      if (invoiceError || !invoice) throw invoiceError;

      // Create invoice lines
      const linesData = values.lines.map((line, index) => ({
        invoice_id: invoice.id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        tax_rate: line.tax_rate,
        total: line.quantity * line.unit_price,
        sort_order: index,
      }));

      const { error: linesError } = await supabase
        .from('invoice_lines')
        .insert(linesData);

      if (linesError) throw linesError;

      // If paid, create payment transaction (positive amount = income)
      if (markAsPaid && values.account_id) {
        const { error: txError } = await supabase
          .from('transactions')
          .insert({
            tenant_id: tenant.id,
            account_id: values.account_id,
            date: values.issue_date,
            amount: total, // Positive for income
            description: `Invoice ${values.invoice_number || invoice.id.slice(0, 8)}`,
            status: 'cleared',
          });

        if (txError) throw txError;
      }

      toast.success(markAsPaid ? 'Invoice paid & saved' : 'Invoice created');
      form.reset();
      setMarkAsPaid(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setMarkAsPaid(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
          <DialogDescription className="text-slate-400">
            Create a new invoice for your customer.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Customer</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-white">
                            {c.name}
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
                name="invoice_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Invoice #</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="INV-001"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Paid toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-slate-400" />
                <Label className="text-slate-300">Paid</Label>
              </div>
              <Switch
                checked={markAsPaid}
                onCheckedChange={setMarkAsPaid}
              />
            </div>

            {/* Account Selection - Show when paying now */}
            {markAsPaid && (
              <FormField
                control={form.control}
                name="account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Receive To *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {accounts.length === 0 ? (
                          <div className="p-2 text-sm text-slate-400">
                            No accounts found. Add one in Accounts first.
                          </div>
                        ) : (
                          accounts.map((account) => (
                            <SelectItem key={account.id} value={account.id} className="text-white">
                              {account.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="issue_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Issue Date</FormLabel>
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

              {/* Due Date - Only show when not paid */}
              {!markAsPaid && (
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Due Date</FormLabel>
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
              )}
            </div>

            {/* Layout Type Toggle */}
            <FormField
              control={form.control}
              name="layout_type"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-slate-600 p-4">
                  <div>
                    <FormLabel className="text-white">Service Layout</FormLabel>
                    <p className="text-sm text-slate-400">
                      {field.value === 'service'
                        ? 'Quantity column hidden'
                        : 'Show quantity column'}
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value === 'service'}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? 'service' : 'product')
                      }
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel className="text-slate-300">Line Items</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({ description: '', quantity: 1, unit_price: 0, tax_rate: 0 })
                  }
                  className="border-slate-600 text-slate-300"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add Line
                </Button>
              </div>

              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid gap-2 p-3 rounded-lg bg-slate-700/30"
                >
                  <div className="grid grid-cols-12 gap-2">
                    <div className={layoutType === 'service' ? 'col-span-6' : 'col-span-4'}>
                      <Input
                        placeholder="Description"
                        {...form.register(`lines.${index}.description`)}
                        className="bg-slate-700/50 border-slate-600 text-white text-sm"
                      />
                    </div>
                    {layoutType !== 'service' && (
                      <div className="col-span-2">
                        <Input
                          type="number"
                          placeholder="Qty"
                          step="0.01"
                          {...form.register(`lines.${index}.quantity`, {
                            valueAsNumber: true,
                          })}
                          className="bg-slate-700/50 border-slate-600 text-white text-sm"
                        />
                      </div>
                    )}
                    <div className="col-span-3">
                      <Input
                        type="number"
                        placeholder="Price"
                        step="0.01"
                        {...form.register(`lines.${index}.unit_price`, {
                          valueAsNumber: true,
                        })}
                        className="bg-slate-700/50 border-slate-600 text-white text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Tax %"
                        step="0.01"
                        {...form.register(`lines.${index}.tax_rate`, {
                          valueAsNumber: true,
                        })}
                        className="bg-slate-700/50 border-slate-600 text-white text-sm"
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-end p-4 bg-slate-700/30 rounded-lg">
              <div className="text-right">
                <p className="text-sm text-slate-400">Total</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: tenant?.currency || 'USD',
                  }).format(calculateTotal())}
                </p>
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Notes</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Additional notes..."
                      {...field}
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
                onClick={handleClose}
                className="border-slate-600 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {loading ? 'Saving...' : markAsPaid ? 'Receive & Save' : 'Create Invoice'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
