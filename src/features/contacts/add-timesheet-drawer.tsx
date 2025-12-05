'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock, Plus, Tag, Trash2 } from 'lucide-react';
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
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/format';
import { generateId } from '@/lib/utils/format';
import type { Contact, Account, TimesheetCategory } from '@/lib/supabase/types';
import { toast } from 'sonner';

interface LineItem {
  id: string;
  category_id: string;
  hours: number;
  minutes: number;
  rate: number;
  note: string;
}

const formSchema = z.object({
  employee_id: z.string().min(1, 'Employee is required'),
  date: z.string().min(1, 'Date is required'),
  isPaid: z.boolean(),
  account_id: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddTimesheetDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultEmployeeId?: string;
}

export function AddTimesheetDrawer({
  open,
  onOpenChange,
  onSuccess,
  defaultEmployeeId,
}: AddTimesheetDrawerProps) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<TimesheetCategory[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIsHourly, setNewCategoryIsHourly] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employee_id: defaultEmployeeId || '',
      date: new Date().toISOString().split('T')[0],
      isPaid: false,
      account_id: '',
    },
  });

  const watchEmployeeId = form.watch('employee_id');
  const watchIsPaid = form.watch('isPaid');
  
  const selectedEmployee = employees.find(e => e.id === watchEmployeeId);

  // Calculate totals
  const calculateLineTotal = (item: LineItem) => {
    const category = categories.find(c => c.id === item.category_id);
    if (!category) return 0;
    if (category.is_hourly) {
      const totalHours = item.hours + item.minutes / 60;
      return totalHours * item.rate;
    }
    return item.rate;
  };

  const grandTotal = lineItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);

  // Load data
  useEffect(() => {
    if (!tenant || !open) return;

    const load = async () => {
      const supabase = createClient();
      
      const [employeesRes, accountsRes, categoriesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('type', 'employee')
          .order('name'),
        supabase
          .from('accounts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('name'),
        supabase
          .from('timesheet_categories')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('name'),
      ]);

      setEmployees((employeesRes.data || []) as Contact[]);
      setAccounts((accountsRes.data || []) as Account[]);
      setCategories((categoriesRes.data || []) as TimesheetCategory[]);
    };

    load();
  }, [tenant, open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        employee_id: defaultEmployeeId || '',
        date: new Date().toISOString().split('T')[0],
        isPaid: false,
        account_id: '',
      });
      setLineItems([]);
    }
  }, [open, defaultEmployeeId, form]);

  const addLineItem = () => {
    const defaultCategory = categories[0];
    const isHourly = defaultCategory?.is_hourly ?? true;
    
    setLineItems([...lineItems, {
      id: generateId(),
      category_id: defaultCategory?.id || '',
      hours: 0,
      minutes: 0,
      rate: isHourly ? (selectedEmployee?.hourly_rate || 0) : 0,
      note: '',
    }]);
  };

  const updateLineItem = (id: string, updates: Partial<LineItem>) => {
    setLineItems(lineItems.map(item => {
      if (item.id !== id) return item;
      
      const updated = { ...item, ...updates };
      
      // If category changed, update rate based on category type
      if (updates.category_id) {
        const newCategory = categories.find(c => c.id === updates.category_id);
        if (newCategory?.is_hourly) {
          updated.rate = selectedEmployee?.hourly_rate || 0;
        } else {
          updated.rate = 0;
        }
      }
      
      return updated;
    }));
  };

  const removeLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
  };

  const handleCreateCategory = async () => {
    if (!tenant || !newCategoryName.trim()) return;

    setSavingCategory(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('timesheet_categories')
        .insert({
          tenant_id: tenant.id,
          name: newCategoryName.trim(),
          is_hourly: newCategoryIsHourly,
        })
        .select()
        .single();

      if (error) throw error;

      setCategories([...categories, data as TimesheetCategory]);
      setCategoryDialogOpen(false);
      setNewCategoryName('');
      setNewCategoryIsHourly(true);
      toast.success('Category created');
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Failed to create category');
    } finally {
      setSavingCategory(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!tenant) return;
    if (lineItems.length === 0) {
      toast.error('Add at least one item');
      return;
    }

    // Validate line items
    for (const item of lineItems) {
      if (!item.category_id) {
        toast.error('Select a category for all items');
        return;
      }
      const category = categories.find(c => c.id === item.category_id);
      if (category?.is_hourly && item.hours === 0 && item.minutes === 0) {
        toast.error(`Enter time for ${category.name}`);
        return;
      }
    }

    setLoading(true);
    const supabase = createClient();

    try {
      // Create timesheet entries for each line item
      for (const item of lineItems) {
        const category = categories.find(c => c.id === item.category_id);
        const total = calculateLineTotal(item);

        const { data: timesheet, error: timesheetError } = await supabase
          .from('timesheets')
          .insert({
            tenant_id: tenant.id,
            employee_id: values.employee_id,
            category_id: item.category_id,
            date: values.date,
            hours: item.hours,
            minutes: item.minutes,
            hourly_rate: item.rate,
            total_amount: total,
            description: item.note || null,
            status: values.isPaid ? 'paid' : 'unpaid',
          })
          .select()
          .single();

        if (timesheetError) throw timesheetError;

        // If paid immediately, create transaction for each item
        if (values.isPaid && values.account_id && timesheet) {
          const { error: txError } = await supabase.from('transactions').insert({
            tenant_id: tenant.id,
            account_id: values.account_id,
            timesheet_id: timesheet.id,
            date: values.date,
            amount: -total,
            description: `${category?.name || 'Payment'} - ${selectedEmployee?.name || 'Employee'}`,
            status: 'cleared',
          });

          if (txError) throw txError;
        }
      }

      toast.success(values.isPaid ? 'Entries recorded and paid' : 'Entries recorded');
      form.reset();
      setLineItems([]);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error adding timesheets:', error);
      toast.error('Failed to record entries');
    } finally {
      setLoading(false);
    }
  };

  if (!tenant) return null;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-slate-800 border-slate-700 max-h-[90vh]">
          <div className="overflow-y-auto">
            <DrawerHeader>
              <DrawerTitle className="text-white flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Record Entry
              </DrawerTitle>
              <DrawerDescription className="text-slate-400">
                Track employee work, tips, and earnings
              </DrawerDescription>
            </DrawerHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="employee_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-300">Employee</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {employees.map((emp) => (
                              <SelectItem key={emp.id} value={emp.id} className="text-white">
                                {emp.name}
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
                </div>

                {/* Line Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300">Items</span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCategoryDialogOpen(true)}
                        className="text-slate-400 hover:text-white h-7 px-2"
                      >
                        <Tag className="h-3 w-3 mr-1" />
                        Category
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={addLineItem}
                        disabled={categories.length === 0}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white h-7"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>

                  {categories.length === 0 && (
                    <div className="p-4 bg-slate-700/30 rounded-lg text-center text-slate-400 text-sm">
                      Create a category first (e.g., Hourly Work, Tips)
                    </div>
                  )}

                  {lineItems.length === 0 && categories.length > 0 && (
                    <div className="p-4 bg-slate-700/30 rounded-lg text-center text-slate-400 text-sm">
                      Click "Add" to add work hours, tips, etc.
                    </div>
                  )}

                  {lineItems.map((item, index) => {
                    const category = categories.find(c => c.id === item.category_id);
                    const isHourly = category?.is_hourly ?? true;
                    const lineTotal = calculateLineTotal(item);

                    return (
                      <div key={item.id} className="p-3 bg-slate-700/30 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Select
                            value={item.category_id}
                            onValueChange={(v) => updateLineItem(item.id, { category_id: v })}
                          >
                            <SelectTrigger className="w-40 bg-slate-700/50 border-slate-600 text-white h-8">
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              {categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id} className="text-white">
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLineItem(item.id)}
                            className="text-red-400 hover:text-red-300 h-7 w-7"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          {isHourly ? (
                            <>
                              <div>
                                <label className="text-xs text-slate-400">Hours</label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={item.hours}
                                  onChange={(e) => updateLineItem(item.id, { hours: parseInt(e.target.value) || 0 })}
                                  className="bg-slate-700/50 border-slate-600 text-white h-8"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400">Mins</label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="59"
                                  value={item.minutes}
                                  onChange={(e) => updateLineItem(item.id, { minutes: Math.min(59, parseInt(e.target.value) || 0) })}
                                  className="bg-slate-700/50 border-slate-600 text-white h-8"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400">Rate</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.rate}
                                  onChange={(e) => updateLineItem(item.id, { rate: parseFloat(e.target.value) || 0 })}
                                  className="bg-slate-700/50 border-slate-600 text-white h-8"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400">Total</label>
                                <div className="h-8 flex items-center text-emerald-400 font-medium">
                                  {formatCurrency(lineTotal, tenant.currency)}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="col-span-3">
                                <label className="text-xs text-slate-400">Amount</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.rate}
                                  onChange={(e) => updateLineItem(item.id, { rate: parseFloat(e.target.value) || 0 })}
                                  className="bg-slate-700/50 border-slate-600 text-white h-8"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400">Total</label>
                                <div className="h-8 flex items-center text-emerald-400 font-medium">
                                  {formatCurrency(lineTotal, tenant.currency)}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <Input
                          placeholder="Note (optional)"
                          value={item.note}
                          onChange={(e) => updateLineItem(item.id, { note: e.target.value })}
                          className="bg-slate-700/50 border-slate-600 text-white h-8 text-sm"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Grand Total */}
                {lineItems.length > 0 && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-400 font-medium">Grand Total</span>
                      <span className="text-2xl font-bold text-emerald-400">
                        {formatCurrency(grandTotal, tenant.currency)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Paid toggle */}
                <FormField
                  control={form.control}
                  name="isPaid"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                      <FormLabel className="text-slate-300 cursor-pointer">Pay Now</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {watchIsPaid && (
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

                <DrawerFooter className="px-0">
                  <Button
                    type="submit"
                    disabled={loading || lineItems.length === 0 || (watchIsPaid && !form.watch('account_id'))}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    {loading ? 'Saving...' : watchIsPaid ? 'Record & Pay' : 'Record Entries'}
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

      {/* Create Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              New Category
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a category (e.g., Hourly Work, Tips, Delivery)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-slate-300">Name</label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Hourly Work, Tips"
                className="mt-1 bg-slate-700/50 border-slate-600 text-white"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <div>
                <div className="text-slate-300">Hourly Rate</div>
                <div className="text-xs text-slate-400">
                  {newCategoryIsHourly
                    ? 'Hours × rate'
                    : 'Fixed amount'}
                </div>
              </div>
              <Switch
                checked={newCategoryIsHourly}
                onCheckedChange={setNewCategoryIsHourly}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCategoryDialogOpen(false)}
              className="border-slate-600 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCategory}
              disabled={savingCategory || !newCategoryName.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {savingCategory ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
