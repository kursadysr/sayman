'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import type { ContactType } from '@/lib/supabase/types';
import { toast } from 'sonner';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['vendor', 'customer']),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  tax_id: z.string().optional(),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultType?: ContactType;
}

export function AddContactDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultType = 'vendor',
}: AddContactDialogProps) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      type: defaultType,
      email: '',
      phone: '',
      tax_id: '',
      address: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.from('contacts').insert({
        tenant_id: tenant.id,
        name: values.name,
        type: values.type,
        email: values.email || null,
        phone: values.phone || null,
        tax_id: values.tax_id || null,
        address: values.address || null,
      });

      if (error) throw error;

      toast.success('Contact added successfully');
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error adding contact:', error);
      toast.error('Failed to add contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription className="text-slate-400">
            Add a new vendor or customer to your contacts.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="vendor" className="text-white">Vendor</SelectItem>
                      <SelectItem value="customer" className="text-white">Customer</SelectItem>
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
                  <FormLabel className="text-slate-300">Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Company or person name"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="email@example.com"
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
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Phone</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+1 234 567 8900"
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
              name="tax_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Tax ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Tax ID / VAT Number"
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
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Full address"
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
                {loading ? 'Adding...' : 'Add Contact'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

