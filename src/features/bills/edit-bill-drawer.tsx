'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, generateId } from '@/lib/utils/format';
import type { Bill, BillLine, Contact, Item, UnitType, ItemUnit } from '@/lib/supabase/types';
import { toast } from 'sonner';

const formSchema = z.object({
  vendor_id: z.string().optional(),
  bill_number: z.string().optional(),
  issue_date: z.string().min(1, 'Issue date is required'),
  due_date: z.string().optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LineItem {
  id: string;
  db_id?: string;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  unit_category_id: string | null;
  unit_type_id: string | null;
  base_quantity: number | null;
}

interface UnitCategory {
  id: string;
  name: string;
  base_unit_name: string;
  base_unit_symbol: string;
}

interface ItemWithUnits extends Item {
  base_unit?: UnitType;
  item_units?: (ItemUnit & { unit_type?: UnitType })[];
}

interface EditBillDrawerProps {
  bill: Bill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditBillDrawer({ bill, open, onOpenChange, onSuccess }: EditBillDrawerProps) {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [items, setItems] = useState<ItemWithUnits[]>([]);
  const [unitCategories, setUnitCategories] = useState<UnitCategory[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<ItemWithUnits[]>([]);
  const [originalLineIds, setOriginalLineIds] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vendor_id: '',
      bill_number: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: '',
      description: '',
    },
  });

  const watchedVendorId = form.watch('vendor_id');
  const selectedVendorId = watchedVendorId && watchedVendorId !== 'none' ? watchedVendorId : null;

  // Load bill data when bill changes
  useEffect(() => {
    if (!bill || !open) return;

    const loadBillData = async () => {
      const supabase = createClient();

      form.reset({
        vendor_id: bill.vendor_id || 'none',
        bill_number: bill.bill_number || '',
        issue_date: bill.issue_date,
        due_date: bill.due_date || '',
        description: bill.description || '',
      });

      // Load bill lines with unit info
      const { data: linesData } = await supabase
        .from('bill_lines')
        .select('*, unit_type:unit_types(*)')
        .eq('bill_id', bill.id)
        .order('sort_order');

      const lines = (linesData || []) as (BillLine & { unit_type?: UnitType })[];

      if (lines.length > 0) {
        setLineItems(
          lines.map((line) => ({
            id: generateId(),
            db_id: line.id,
            item_id: line.item_id,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            tax_rate: line.tax_rate,
            unit_category_id: line.unit_type?.category_id || null,
            unit_type_id: line.unit_type_id || null,
            base_quantity: line.base_quantity || null,
          }))
        );
        setOriginalLineIds(lines.map((l) => l.id));
      } else {
        // Bill was created without lines (legacy) - create one from total
        setLineItems([
          {
            id: generateId(),
            item_id: null,
            description: bill.description || 'Item',
            quantity: 1,
            unit_price: bill.total_amount,
            tax_rate: 0,
            unit_category_id: null,
            unit_type_id: null,
            base_quantity: null,
          },
        ]);
        setOriginalLineIds([]);
      }
    };

    loadBillData();
  }, [bill, open, form]);

  // Load vendors, unit categories, and unit types
  useEffect(() => {
    if (!tenant || !open) return;

    const loadData = async () => {
      const supabase = createClient();

      const [vendorsRes, categoriesRes, unitTypesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('type', 'vendor')
          .order('name'),
        supabase
          .from('unit_categories')
          .select('*')
          .order('name'),
        supabase
          .from('unit_types')
          .select('*, category:unit_categories(*)')
          .or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`)
          .order('name'),
      ]);

      setVendors((vendorsRes.data || []) as Contact[]);
      setUnitCategories((categoriesRes.data || []) as UnitCategory[]);
      setUnitTypes((unitTypesRes.data || []) as UnitType[]);
    };

    loadData();
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
        .select('*, base_unit:unit_types(*), item_units(*, unit_type:unit_types(*))')
        .eq('tenant_id', tenant.id)
        .eq('vendor_id', selectedVendorId)
        .order('name');

      setItems((itemsData || []) as ItemWithUnits[]);
    };

    loadItems();
  }, [tenant, selectedVendorId]);

  const handleDescriptionChange = (id: string, value: string, index: number) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, description: value, item_id: null } : item
      )
    );

    if (value.length >= 1 && items.length > 0) {
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

  const selectSuggestion = (lineId: string, item: ItemWithUnits) => {
    // Find default unit or base unit
    const defaultUnit = item.item_units?.find(iu => iu.is_default)?.unit_type;
    const unitToUse = defaultUnit || item.base_unit;
    const categoryId = unitToUse?.category_id || item.base_unit?.category_id || null;
    
    setLineItems(
      lineItems.map((li) =>
        li.id === lineId
          ? { 
              ...li, 
              item_id: item.id, 
              description: item.name, 
              unit_price: item.last_unit_price,
              unit_category_id: categoryId,
              unit_type_id: unitToUse?.id || null,
              base_quantity: null
            }
          : li
      )
    );
    setSuggestions([]);
    setActiveItemIndex(null);
  };

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
      { id: generateId(), item_id: null, description: '', quantity: 1, unit_price: 0, tax_rate: 0, unit_category_id: null, unit_type_id: null, base_quantity: null },
    ]);
  };

  // Calculate base quantity from quantity and unit type
  const calculateBaseQuantity = (quantity: number, unitTypeId: string | null, itemId: string | null): number | null => {
    if (!unitTypeId) return null;
    
    const item = items.find(i => i.id === itemId);
    const unitType = unitTypes.find(u => u.id === unitTypeId);
    
    if (!unitType) return null;
    
    // Check if item has a custom conversion for this unit
    const itemUnit = item?.item_units?.find(iu => iu.unit_type_id === unitTypeId);
    if (itemUnit) {
      return quantity * itemUnit.conversion_factor;
    }
    
    // Use standard conversion factor
    return quantity * unitType.to_base_factor;
  };

  // Get available units for a line item filtered by category
  const getAvailableUnits = (itemId: string | null, categoryId: string | null): UnitType[] => {
    const item = items.find(i => i.id === itemId);
    
    // If item has custom units defined, prioritize those
    if (item?.item_units && item.item_units.length > 0) {
      const itemUnitTypes = item.item_units
        .map(iu => iu.unit_type)
        .filter((u): u is UnitType => !!u);
      
      // Add base unit if not already included
      if (item.base_unit && !itemUnitTypes.find(u => u.id === item.base_unit?.id)) {
        return [item.base_unit, ...itemUnitTypes];
      }
      return itemUnitTypes;
    }
    
    // Filter by category if selected
    if (categoryId) {
      return unitTypes.filter(u => u.category_id === categoryId);
    }
    
    // No category selected - return empty
    return [];
  };

  // Handle category change - auto-select first unit in category
  const handleCategoryChange = (lineId: string, categoryId: string) => {
    const unitsInCategory = unitTypes.filter(u => u.category_id === categoryId);
    const baseUnit = unitsInCategory.find(u => u.is_base);
    const defaultUnit = baseUnit || unitsInCategory[0];
    
    setLineItems(
      lineItems.map((li) =>
        li.id === lineId
          ? { 
              ...li, 
              unit_category_id: categoryId,
              unit_type_id: defaultUnit?.id || null
            }
          : li
      )
    );
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
    if (!tenant || !bill) return;

    const hasEmptyDescription = lineItems.some((item) => !item.description.trim());
    if (hasEmptyDescription) {
      toast.error('All items must have a description');
      return;
    }

    const total = calculateTotal();
    if (total <= 0) {
      toast.error('Bill total must be greater than 0');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const vendorId = values.vendor_id && values.vendor_id !== 'none' ? values.vendor_id : null;

    try {
      // Update bill (total will be recalculated by trigger)
      const { error: billError } = await supabase
        .from('bills')
        .update({
          vendor_id: vendorId,
          bill_number: values.bill_number || null,
          issue_date: values.issue_date,
          due_date: values.due_date || null,
          description: values.description || null,
          total_amount: 0, // Will be updated by trigger
        })
        .eq('id', bill.id);

      if (billError) throw billError;

      // Delete removed lines
      const currentDbIds = lineItems.filter((l) => l.db_id).map((l) => l.db_id!);
      const deletedIds = originalLineIds.filter((id) => !currentDbIds.includes(id));

      if (deletedIds.length > 0) {
        await supabase.from('bill_lines').delete().in('id', deletedIds);
      }

      // Upsert items for price tracking (only if vendor selected)
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
              await supabase
                .from('items')
                .update({ last_unit_price: lineItem.unit_price, updated_at: new Date().toISOString() })
                .eq('id', existingItem.id);

              lineItem.item_id = existingItem.id;
            } else {
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

      // Update existing lines and insert new ones
      for (let i = 0; i < lineItems.length; i++) {
        const lineItem = lineItems[i];
        const lineData = {
          bill_id: bill.id,
          item_id: lineItem.item_id,
          description: lineItem.description,
          quantity: lineItem.quantity,
          unit_price: lineItem.unit_price,
          tax_rate: lineItem.tax_rate,
          total: lineItem.quantity * lineItem.unit_price * (1 + lineItem.tax_rate / 100),
          sort_order: i,
          unit_type_id: lineItem.unit_type_id,
          base_quantity: calculateBaseQuantity(lineItem.quantity, lineItem.unit_type_id, lineItem.item_id),
        };

        if (lineItem.db_id) {
          await supabase.from('bill_lines').update(lineData).eq('id', lineItem.db_id);
        } else {
          await supabase.from('bill_lines').insert(lineData);
        }
      }

      toast.success('Bill updated successfully');
      handleClose();
      onSuccess?.();
    } catch (error) {
      console.error('Error updating bill:', error);
      toast.error('Failed to update bill');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.reset();
    setLineItems([{ id: generateId(), item_id: null, description: '', quantity: 1, unit_price: 0, tax_rate: 0, unit_category_id: null, unit_type_id: null, base_quantity: null }]);
    setSuggestions([]);
    setActiveItemIndex(null);
    setItems([]);
    setOriginalLineIds([]);
    onOpenChange(false);
  };

  if (!bill) return null;

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="bg-slate-800 border-slate-700 max-h-[90vh]">
        <div className="overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle className="text-white">Edit Bill</DrawerTitle>
            <DrawerDescription className="text-slate-400">
              Update bill details
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
                          No vendor
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

              {/* Bill Number & Date */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bill_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-300">Bill #</FormLabel>
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
                      <FormLabel className="text-slate-300">Date *</FormLabel>
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

              {/* Items */}
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
                    Add
                  </Button>
                </div>

                <div className="space-y-3">
                  {lineItems.map((item, index) => (
                    <div key={item.id} className="p-3 bg-slate-700/30 rounded-lg space-y-2">
                      <div className="flex gap-2">
                        {/* Description with autocomplete */}
                        <div className="relative flex-1">
                          <Input
                            placeholder="Item name"
                            value={item.description}
                            onChange={(e) => handleDescriptionChange(item.id, e.target.value, index)}
                            onBlur={() =>
                              setTimeout(() => {
                                if (activeItemIndex === index) {
                                  setSuggestions([]);
                                  setActiveItemIndex(null);
                                }
                              }, 200)
                            }
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

                        {lineItems.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLineItem(item.id)}
                            className="text-red-400 hover:text-red-300 h-10 w-10 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Quantity and Unit Selection */}
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
                        
                        {/* Show simplified unit selection for items with custom units */}
                        {(() => {
                          const selectedItem = items.find(i => i.id === item.item_id);
                          const hasCustomUnits = selectedItem?.item_units && selectedItem.item_units.length > 0;
                          
                          if (hasCustomUnits) {
                            const availableUnits = getAvailableUnits(item.item_id, null);
                            return (
                              <div className="col-span-2">
                                <Label className="text-xs text-slate-400">Unit</Label>
                                <Select 
                                  value={item.unit_type_id || ''} 
                                  onValueChange={(value) => updateLineItem(item.id, 'unit_type_id', value || null)}
                                >
                                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white h-10">
                                    <SelectValue placeholder="Select unit" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-slate-800 border-slate-700">
                                    {availableUnits.map((unit) => (
                                      <SelectItem key={unit.id} value={unit.id} className="text-white">
                                        {unit.symbol} ({unit.name})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }
                          
                          const availableUnits = getAvailableUnits(item.item_id, item.unit_category_id);
                          return (
                            <>
                              <div>
                                <Label className="text-xs text-slate-400">Type</Label>
                                <Select 
                                  value={item.unit_category_id || ''} 
                                  onValueChange={(value) => handleCategoryChange(item.id, value)}
                                >
                                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white h-10">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-slate-800 border-slate-700">
                                    {unitCategories.map((cat) => (
                                      <SelectItem key={cat.id} value={cat.id} className="text-white">
                                        {cat.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs text-slate-400">Unit</Label>
                                <Select 
                                  value={item.unit_type_id || ''} 
                                  onValueChange={(value) => updateLineItem(item.id, 'unit_type_id', value || null)}
                                  disabled={!item.unit_category_id}
                                >
                                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white h-10">
                                    <SelectValue placeholder={item.unit_category_id ? "Select" : "-"} />
                                  </SelectTrigger>
                                  <SelectContent className="bg-slate-800 border-slate-700">
                                    {availableUnits.map((unit) => (
                                      <SelectItem key={unit.id} value={unit.id} className="text-white">
                                        {unit.symbol}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Price and Tax */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-slate-400">Price</Label>
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

                      {/* Show base quantity conversion */}
                      {item.unit_type_id && (() => {
                        const baseQty = calculateBaseQuantity(item.quantity, item.unit_type_id, item.item_id);
                        const selectedItem = items.find(i => i.id === item.item_id);
                        const baseUnit = selectedItem?.base_unit || unitTypes.find(u => u.id === item.unit_type_id);
                        if (baseQty && baseUnit && item.unit_type_id !== baseUnit.id) {
                          return (
                            <div className="text-xs text-slate-400 text-right">
                              = {baseQty.toFixed(2)} {baseUnit.symbol}
                            </div>
                          );
                        }
                        return null;
                      })()}
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

              <DrawerFooter className="px-0">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
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
