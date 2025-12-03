'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Calculator } from 'lucide-react';
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
import { formatCurrency } from '@/lib/utils/format';
import type { Contact, Item } from '@/lib/supabase/types';
import { toast } from 'sonner';

const formSchema = z.object({
  vendor_id: z.string().optional(),
  bill_number: z.string().optional(),
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string().optional(),
  description: z.string().optional(),
  total_amount: z.number().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LineItem {
  id: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface AddBillDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddBillDrawer({ open, onOpenChange, onSuccess }: AddBillDrawerProps) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [useLineItems, setUseLineItems] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), item_id: null, description: '', quantity: 1, unit_price: 0, tax_rate: 0 },
  ]);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Item[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vendor_id: '',
      bill_number: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: '',
      description: '',
      total_amount: 0,
    },
  });

  const watchedVendorId = form.watch('vendor_id');
  const selectedVendorId = watchedVendorId && watchedVendorId !== 'none' ? watchedVendorId : null;

  // Load vendors
  useEffect(() => {
    if (!tenant || !open) return;

    const loadVendors = async () => {
      const supabase = createClient();
      
      const { data: vendorsData } = await supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('type', 'vendor')
        .order('name');

      setVendors((vendorsData || []) as Contact[]);
    };

    loadVendors();
  }, [tenant, open]);

  // Load items for the selected vendor
  useEffect(() => {
    if (!tenant || !selectedVendorId) {
      setItems([]);
      return;
    }

    const loadItems = async () => {
      const supabase = createClient();
      
      const { data: itemsData } = await supabase
        .from('items')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('vendor_id', selectedVendorId)
        .order('name');

      setItems((itemsData || []) as Item[]);
    };

    loadItems();
  }, [tenant, selectedVendorId]);

  // Filter suggestions based on input
  const handleDescriptionChange = (id: string, value: string, index: number) => {
    // Update description and reset item_id in one state update
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, description: value, item_id: null } : item
      )
    );
    
    if (value.length >= 1) {
      const filtered = items.filter((item) =>
        item.name.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered);
      setActiveItemIndex(index);
    } else {
      setSuggestions([]);
      setActiveItemIndex(null);
    }
  };

  const selectSuggestion = (lineId: string, item: Item) => {
    setLineItems(
      lineItems.map((li) =>
        li.id === lineId
          ? { ...li, item_id: item.id, description: item.name, unit_price: item.last_unit_price }
          : li
      )
    );
    setSuggestions([]);
    setActiveItemIndex(null);
  };

  // Calculate total from line items
  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => {
      const subtotal = item.quantity * item.unit_price;
      const tax = subtotal * (item.tax_rate / 100);
      return sum + subtotal + tax;
    }, 0);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      { id: crypto.randomUUID(), item_id: null, description: '', quantity: 1, unit_price: 0, tax_rate: 0 },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((item) => item.id !== id));
    }
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number | null) => {
    setLineItems(
      lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const onSubmit = async (values: FormValues) => {
    if (!tenant) return;

    // Validate line items if using them
    if (useLineItems) {
      const hasEmptyDescription = lineItems.some((item) => !item.description.trim());
      if (hasEmptyDescription) {
        toast.error('All line items must have a description');
        return;
      }
    }

    setLoading(true);
    const supabase = createClient();

    // Handle "none" vendor selection
    const vendorId = values.vendor_id && values.vendor_id !== 'none' ? values.vendor_id : null;

    try {
      // Calculate total
      const totalAmount = useLineItems ? calculateTotal() : (values.total_amount || 0);

      // Create bill
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .insert({
          tenant_id: tenant.id,
          vendor_id: vendorId,
          bill_number: values.bill_number || null,
          issue_date: values.issue_date,
          due_date: values.due_date || null,
          description: values.description || null,
          total_amount: useLineItems ? 0 : totalAmount,
        })
        .select()
        .single();

      if (billError) throw billError;

      // Add line items and upsert items for price tracking (only if vendor selected)
      if (useLineItems && bill) {
        // Upsert items to track prices (per vendor) - only if vendor is selected
        if (vendorId) {
          for (const lineItem of lineItems) {
            if (lineItem.description.trim()) {
              const { data: existingItem } = await supabase
                .from('items')
                .select('id')
                .eq('tenant_id', tenant.id)
                .eq('vendor_id', vendorId)
                .eq('name', lineItem.description.trim())
                .single();

              if (existingItem) {
                // Update existing item's last price
                await supabase
                  .from('items')
                  .update({ last_unit_price: lineItem.unit_price, updated_at: new Date().toISOString() })
                  .eq('id', existingItem.id);
                
                lineItem.item_id = existingItem.id;
              } else {
                // Create new item for this vendor
                const { data: newItem } = await supabase
                  .from('items')
                  .insert({
                    tenant_id: tenant.id,
                    vendor_id: vendorId,
                    name: lineItem.description.trim(),
                    last_unit_price: lineItem.unit_price,
                  })
                  .select()
                  .single();

                if (newItem) {
                  lineItem.item_id = newItem.id;
                }
              }
            }
          }
        }

        // Insert bill lines
        const linesToInsert = lineItems.map((item, index) => ({
          bill_id: bill.id,
          item_id: item.item_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          total: item.quantity * item.unit_price * (1 + item.tax_rate / 100),
          sort_order: index,
        }));

        const { error: linesError } = await supabase
          .from('bill_lines')
          .insert(linesToInsert);

        if (linesError) throw linesError;
      }

      toast.success('Bill recorded successfully');
      form.reset();
      setLineItems([{ id: crypto.randomUUID(), item_id: null, description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
      setUseLineItems(false);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error creating bill:', error);
      toast.error('Failed to create bill');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setLineItems([{ id: crypto.randomUUID(), item_id: null, description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]);
    setUseLineItems(false);
    setSuggestions([]);
    setActiveItemIndex(null);
    setItems([]);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="bg-slate-800 border-slate-700 max-h-[90vh]">
        <div className="overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle className="text-white">Add Bill</DrawerTitle>
            <DrawerDescription className="text-slate-400">
              Record a new bill from a vendor
            </DrawerDescription>
          </DrawerHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 space-y-4">
              {/* Vendor Selection */}
              <FormField
                control={form.control}
                name="vendor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Vendor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                          <SelectValue placeholder="Select vendor (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="none" className="text-slate-400">
                          No vendor (quick expense)
                        </SelectItem>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id} className="text-white">
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Bill Number & Dates */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bill_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Bill Number</FormLabel>
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

                <FormField
                  control={form.control}
                  name="issue_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Issue Date *</FormLabel>
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
              </div>

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

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Bill description"
                        {...field}
                        className="bg-slate-700/50 border-slate-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Toggle between total and line items */}
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-slate-400" />
                  <Label className="text-slate-300">Itemize bill</Label>
                </div>
                <Switch
                  checked={useLineItems}
                  onCheckedChange={setUseLineItems}
                />
              </div>

              {/* Total Amount (if not using line items) */}
              {!useLineItems && (
                <FormField
                  control={form.control}
                  name="total_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Total Amount *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          className="bg-slate-700/50 border-slate-600 text-white text-lg font-bold"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Line Items */}
              {useLineItems && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-300">Items</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addLineItem}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {lineItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-700/30 rounded-lg space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-400">Item {index + 1}</span>
                          {lineItems.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLineItem(item.id)}
                              className="text-red-400 hover:text-red-300 h-6 w-6 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* Description with autocomplete */}
                        <div className="relative">
                          <Input
                            placeholder="Start typing item name..."
                            value={item.description}
                            onChange={(e) => handleDescriptionChange(item.id, e.target.value, index)}
                            onBlur={() => setTimeout(() => {
                              if (activeItemIndex === index) {
                                setSuggestions([]);
                                setActiveItemIndex(null);
                              }
                            }, 200)}
                            className="bg-slate-700/50 border-slate-600 text-white"
                          />
                          
                          {/* Suggestions dropdown */}
                          {activeItemIndex === index && suggestions.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-slate-700 border border-slate-600 rounded-md shadow-lg max-h-48 overflow-auto">
                              {suggestions.map((suggestion) => (
                                <button
                                  key={suggestion.id}
                                  type="button"
                                  onClick={() => selectSuggestion(item.id, suggestion)}
                                  className="w-full px-3 py-2 text-left hover:bg-slate-600 flex justify-between items-center"
                                >
                                  <span className="text-white">{suggestion.name}</span>
                                  <span className="text-sm text-emerald-400">
                                    {formatCurrency(suggestion.last_unit_price, tenant?.currency || 'USD')}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs text-slate-400">Qty</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)
                              }
                              className="bg-slate-700/50 border-slate-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-400">Unit Price</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) =>
                                updateLineItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)
                              }
                              className="bg-slate-700/50 border-slate-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-400">Tax %</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.tax_rate}
                              onChange={(e) =>
                                updateLineItem(item.id, 'tax_rate', parseFloat(e.target.value) || 0)
                              }
                              className="bg-slate-700/50 border-slate-600 text-white"
                            />
                          </div>
                        </div>

                        <div className="text-right text-sm text-slate-400">
                          Subtotal:{' '}
                          <span className="text-white font-medium">
                            {formatCurrency(
                              item.quantity * item.unit_price * (1 + item.tax_rate / 100),
                              tenant?.currency || 'USD'
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <span className="text-slate-300 font-medium">Total</span>
                    <span className="text-xl font-bold text-emerald-400">
                      {formatCurrency(calculateTotal(), tenant?.currency || 'USD')}
                    </span>
                  </div>
                </div>
              )}

              <DrawerFooter className="px-0">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {loading ? 'Creating...' : 'Create Bill'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
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
