'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock, Trash2 } from 'lucide-react';
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
import type { Timesheet, TimesheetCategory } from '@/lib/supabase/types';
import { toast } from 'sonner';

const formSchema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  date: z.string().min(1, 'Date is required'),
  hours: z.number().min(0),
  minutes: z.number().min(0).max(59),
  rate: z.number().min(0, 'Rate must be 0 or greater'),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditTimesheetDrawerProps {
  timesheet: Timesheet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditTimesheetDrawer({
  timesheet,
  open,
  onOpenChange,
  onSuccess,
}: EditTimesheetDrawerProps) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [categories, setCategories] = useState<TimesheetCategory[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category_id: '',
      date: new Date().toISOString().split('T')[0],
      hours: 0,
      minutes: 0,
      rate: 0,
      description: '',
    },
  });

  const watchCategoryId = form.watch('category_id');
  const watchHours = form.watch('hours');
  const watchMinutes = form.watch('minutes');
  const watchRate = form.watch('rate');
  
  const selectedCategory = categories.find(c => c.id === watchCategoryId);
  const isHourly = selectedCategory?.is_hourly ?? true;
  
  const totalHours = (watchHours || 0) + (watchMinutes || 0) / 60;
  const totalAmount = isHourly ? totalHours * (watchRate || 0) : (watchRate || 0);

  // Load categories
  useEffect(() => {
    if (!tenant || !open) return;

    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('timesheet_categories')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name');

      setCategories((data || []) as TimesheetCategory[]);
    };

    load();
  }, [tenant, open]);

  // Populate form when timesheet changes
  useEffect(() => {
    if (timesheet && open) {
      form.reset({
        category_id: timesheet.category_id || '',
        date: timesheet.date,
        hours: timesheet.hours || 0,
        minutes: timesheet.minutes || 0,
        rate: timesheet.hourly_rate || 0,
        description: timesheet.description || '',
      });
    }
  }, [timesheet, open, form]);

  const onSubmit = async (values: FormValues) => {
    if (!tenant || !timesheet) return;

    if (isHourly && values.hours === 0 && values.minutes === 0) {
      toast.error('Please enter time worked');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('timesheets')
        .update({
          category_id: values.category_id,
          date: values.date,
          hours: values.hours,
          minutes: values.minutes,
          hourly_rate: values.rate,
          total_amount: totalAmount,
          description: values.description || null,
        })
        .eq('id', timesheet.id);

      if (error) throw error;

      toast.success('Entry updated');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error updating timesheet:', error);
      toast.error('Failed to update entry');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!timesheet) return;
    
    if (!confirm('Delete this entry? This cannot be undone.')) return;

    setDeleting(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('timesheets')
        .delete()
        .eq('id', timesheet.id);

      if (error) throw error;

      toast.success('Entry deleted');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error deleting timesheet:', error);
      toast.error('Failed to delete entry');
    } finally {
      setDeleting(false);
    }
  };

  if (!tenant || !timesheet) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-slate-800 border-slate-700">
        <DrawerHeader>
          <DrawerTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Edit Entry
          </DrawerTitle>
          <DrawerDescription className="text-slate-400">
            Update or delete this timesheet entry
          </DrawerDescription>
        </DrawerHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 space-y-4">
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
                          {cat.name} ({cat.is_hourly ? 'hourly' : 'fixed'})
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

            {isHourly ? (
              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Hours</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
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
                  name="minutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Minutes</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="59"
                          {...field}
                          onChange={(e) => field.onChange(Math.min(59, parseInt(e.target.value) || 0))}
                          className="bg-slate-700/50 border-slate-600 text-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Rate/hr</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
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
            ) : (
              <FormField
                control={form.control}
                name="rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Total */}
            <div className="p-3 bg-slate-700/30 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">
                  {isHourly && totalHours > 0 && (
                    <span className="mr-2">
                      {Math.floor(totalHours)}h {Math.round((totalHours % 1) * 60)}m
                    </span>
                  )}
                  Total
                </span>
                <span className="text-xl font-bold text-emerald-400">
                  {formatCurrency(totalAmount, tenant.currency)}
                </span>
              </div>
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Note (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Additional notes"
                      {...field}
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DrawerFooter className="px-0">
              <div className="flex gap-2 w-full">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting || loading}
                  className="flex-1"
                >
                  {deleting ? 'Deleting...' : (
                    <>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </>
                  )}
                </Button>
                <Button
                  type="submit"
                  disabled={loading || deleting}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
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
      </DrawerContent>
    </Drawer>
  );
}

