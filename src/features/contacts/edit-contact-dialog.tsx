'use client';

import { useState, useEffect } from 'react';
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
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import type { Contact } from '@/lib/supabase/types';
import { toast } from 'sonner';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  tax_id: z.string().optional(),
  address: z.string().optional(),
  hourly_rate: z.number().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditContactDialogProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditContactDialog({
  contact,
  open,
  onOpenChange,
  onSuccess,
}: EditContactDialogProps) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      tax_id: '',
      address: '',
      hourly_rate: 0,
    },
  });

  // Load contact data when dialog opens
  useEffect(() => {
    if (contact && open) {
      form.reset({
        name: contact.name,
        email: contact.email || '',
        phone: contact.phone || '',
        tax_id: contact.tax_id || '',
        address: contact.address || '',
        hourly_rate: contact.hourly_rate || 0,
      });
    }
  }, [contact, open, form]);

  const onSubmit = async (values: FormValues) => {
    if (!tenant || !contact) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('contacts')
        .update({
          name: values.name,
          email: values.email || null,
          phone: values.phone || null,
          tax_id: values.tax_id || null,
          address: values.address || null,
          hourly_rate: contact.type === 'employee' ? (values.hourly_rate || 0) : contact.hourly_rate,
        })
        .eq('id', contact.id);

      if (error) throw error;

      toast.success('Contact updated successfully');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error updating contact:', error);
      toast.error('Failed to update contact');
    } finally {
      setLoading(false);
    }
  };

  if (!contact) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
          <DialogDescription className="text-slate-400">
            Update {contact.type === 'vendor' ? 'vendor' : contact.type === 'customer' ? 'customer' : 'employee'} information.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-300">Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={contact.type === 'employee' ? 'Employee name' : 'Company or person name'}
                      {...field}
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {contact.type === 'employee' && (
              <FormField
                control={form.control}
                name="hourly_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Hourly Rate</FormLabel>
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
            )}

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
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

