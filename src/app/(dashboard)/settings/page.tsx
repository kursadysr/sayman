'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const tenantFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  currency: z.string(),
  address: z.string().optional(),
  tax_id: z.string().optional(),
  footer_note: z.string().optional(),
});

type TenantFormValues = z.infer<typeof tenantFormSchema>;

export default function SettingsPage() {
  const { tenant, setCurrentTenant } = useTenant();
  const [loading, setLoading] = useState(false);

  const tenantForm = useForm<TenantFormValues>({
    resolver: zodResolver(tenantFormSchema),
    defaultValues: {
      name: '',
      currency: 'USD',
      address: '',
      tax_id: '',
      footer_note: '',
    },
  });

  useEffect(() => {
    if (!tenant) return;

    tenantForm.reset({
      name: tenant.name,
      currency: tenant.currency,
      address: tenant.address_details?.address || '',
      tax_id: tenant.address_details?.tax_id || '',
      footer_note: tenant.address_details?.footer_note || '',
    });
  }, [tenant, tenantForm]);

  const onSaveTenant = async (values: TenantFormValues) => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('tenants')
        .update({
          name: values.name,
          currency: values.currency,
          address_details: {
            address: values.address,
            tax_id: values.tax_id,
            footer_note: values.footer_note,
          },
        })
        .eq('id', tenant.id)
        .select()
        .single();

      if (error) throw error;

      setCurrentTenant(data);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-400">Select a workspace to continue</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400">Manage your workspace settings</p>
      </div>

      {/* Workspace Settings */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Workspace Settings</CardTitle>
          <CardDescription className="text-slate-400">
            Update your organization details for invoices and reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...tenantForm}>
            <form onSubmit={tenantForm.handleSubmit(onSaveTenant)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={tenantForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          className="bg-slate-700/50 border-slate-600 text-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={tenantForm.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Currency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="USD" className="text-white">USD ($)</SelectItem>
                          <SelectItem value="EUR" className="text-white">EUR (€)</SelectItem>
                          <SelectItem value="GBP" className="text-white">GBP (£)</SelectItem>
                          <SelectItem value="TRY" className="text-white">TRY (₺)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={tenantForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Your business address"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={tenantForm.control}
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
                control={tenantForm.control}
                name="footer_note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Invoice Footer Note</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Thank you for your business!"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Save className="mr-2 h-4 w-4" />
                {loading ? 'Saving...' : 'Save Settings'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

