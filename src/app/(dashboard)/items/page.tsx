'use client';

import { useEffect, useState, useCallback } from 'react';
import { Package, Pencil, Check, X, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Contact } from '@/lib/supabase/types';

interface Item {
  id: string;
  tenant_id: string;
  vendor_id: string;
  name: string;
  last_unit_price: number;
  created_at: string;
  updated_at: string;
}
import { toast } from 'sonner';

interface PriceHistory {
  date: string;
  unit_price: number;
  quantity: number;
  bill_number: string | null;
}

interface ItemWithHistory extends Item {
  priceHistory: PriceHistory[];
}

export default function ItemsPage() {
  const { tenant } = useTenant();
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [items, setItems] = useState<ItemWithHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Load vendors
  useEffect(() => {
    if (!tenant) return;

    const loadVendors = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('type', 'vendor')
        .order('name');

      setVendors((data || []) as Contact[]);
    };

    loadVendors();
  }, [tenant]);

  // Load items for selected vendor
  const loadItems = useCallback(async () => {
    if (!tenant || !selectedVendorId) {
      setItems([]);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Get items for this vendor
    const { data: itemsData } = await supabase
      .from('items')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('vendor_id', selectedVendorId)
      .order('name');

    const loadedItems = (itemsData || []) as Item[];

    // Get price history for each item from bill_lines
    const itemsWithHistory: ItemWithHistory[] = await Promise.all(
      loadedItems.map(async (item) => {
        const { data: historyData } = await supabase
          .from('bill_lines')
          .select('unit_price, quantity, created_at, bill:bills(bill_number, issue_date)')
          .eq('item_id', item.id)
          .order('created_at', { ascending: false })
          .limit(10);

        const priceHistory: PriceHistory[] = (historyData || []).map((h: any) => ({
          date: h.bill?.issue_date || h.created_at,
          unit_price: h.unit_price,
          quantity: h.quantity,
          bill_number: h.bill?.bill_number,
        }));

        return { ...item, priceHistory };
      })
    );

    setItems(itemsWithHistory);
    setLoading(false);
  }, [tenant, selectedVendorId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleStartEdit = (item: ItemWithHistory) => {
    setEditingItemId(item.id);
    setEditName(item.name);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditName('');
  };

  const handleSaveEdit = async (itemId: string) => {
    if (!editName.trim()) {
      toast.error('Item name cannot be empty');
      return;
    }

    const supabase = createClient();

    // Check if name already exists for this vendor
    const { data: existing } = await supabase
      .from('items')
      .select('id')
      .eq('tenant_id', tenant!.id)
      .eq('vendor_id', selectedVendorId)
      .eq('name', editName.trim())
      .neq('id', itemId)
      .single();

    if (existing) {
      toast.error('An item with this name already exists for this vendor');
      return;
    }

    const { error } = await supabase
      .from('items')
      .update({ name: editName.trim(), updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      toast.error('Failed to update item name');
      return;
    }

    toast.success('Item name updated');
    setEditingItemId(null);
    setEditName('');
    loadItems();
  };

  const toggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  const getPriceChange = (history: PriceHistory[]) => {
    if (history.length < 2) return null;
    const latest = history[0].unit_price;
    const previous = history[1].unit_price;
    const change = ((latest - previous) / previous) * 100;
    return change;
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-400">Select a workspace to continue</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 pb-24 lg:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Items</h1>
        <p className="text-slate-400">Manage items and view price history by vendor</p>
      </div>

      {/* Vendor Selection */}
      <Card className="bg-slate-800/50 border-slate-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white text-lg">Select Vendor</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
            <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white w-full max-w-md">
              <SelectValue placeholder="Choose a vendor to view items" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {vendors.length === 0 ? (
                <div className="p-2 text-sm text-slate-400">
                  No vendors found. Add vendors in Contacts first.
                </div>
              ) : (
                vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id} className="text-white">
                    {vendor.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Items List */}
      {selectedVendorId && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-400" />
              Items ({items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center text-slate-400 py-8">Loading...</div>
            ) : items.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                <Package className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                <p>No items found for this vendor.</p>
                <p className="text-sm mt-2">Items are created when you add them to bills.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const priceChange = getPriceChange(item.priceHistory);
                  const isExpanded = expandedItemId === item.id;
                  const isEditing = editingItemId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="bg-slate-700/30 rounded-lg overflow-hidden"
                    >
                      {/* Item Header */}
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="bg-slate-700/50 border-slate-600 text-white max-w-xs"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveEdit(item.id)}
                                  className="bg-emerald-500 hover:bg-emerald-600 h-8 w-8 p-0"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancelEdit}
                                  className="text-slate-400 hover:text-white h-8 w-8 p-0"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{item.name}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleStartEdit(item)}
                                  className="text-slate-400 hover:text-white h-6 w-6 p-0"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-4">
                            {/* Current Price */}
                            <div className="text-right">
                              <div className="text-lg font-bold text-emerald-400">
                                {formatCurrency(item.last_unit_price, tenant.currency)}
                              </div>
                              {priceChange !== null && (
                                <div
                                  className={`flex items-center justify-end gap-1 text-xs ${
                                    priceChange > 0
                                      ? 'text-red-400'
                                      : priceChange < 0
                                      ? 'text-green-400'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {priceChange > 0 ? (
                                    <TrendingUp className="h-3 w-3" />
                                  ) : priceChange < 0 ? (
                                    <TrendingDown className="h-3 w-3" />
                                  ) : null}
                                  {priceChange > 0 ? '+' : ''}
                                  {priceChange.toFixed(1)}%
                                </div>
                              )}
                            </div>

                            {/* Expand Button */}
                            {item.priceHistory.length > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleExpand(item.id)}
                                className="text-slate-400 hover:text-white"
                              >
                                {isExpanded ? 'Hide History' : `History (${item.priceHistory.length})`}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Price History */}
                      {isExpanded && item.priceHistory.length > 0 && (
                        <div className="border-t border-slate-700 bg-slate-800/50 p-4">
                          <h4 className="text-sm font-medium text-slate-400 mb-3">Price History</h4>
                          <div className="space-y-2">
                            {item.priceHistory.map((history, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-sm py-2 border-b border-slate-700/50 last:border-0"
                              >
                                <div className="text-slate-400">
                                  {formatDate(history.date)}
                                  {history.bill_number && (
                                    <span className="ml-2 text-slate-500">
                                      #{history.bill_number}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-slate-400">
                                    Qty: {history.quantity}
                                  </span>
                                  <span className="font-medium text-white">
                                    {formatCurrency(history.unit_price, tenant.currency)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

