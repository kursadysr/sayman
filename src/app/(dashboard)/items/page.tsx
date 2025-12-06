'use client';

import { useEffect, useState, useCallback } from 'react';
import { Package, Pencil, Check, X, TrendingUp, TrendingDown, Plus, Trash2, Settings2, BarChart3, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTenant } from '@/hooks/use-tenant';
import { useRole } from '@/hooks/use-role';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Contact, UnitType, ItemUnit } from '@/lib/supabase/types';
import { toast } from 'sonner';

interface Item {
  id: string;
  tenant_id: string;
  vendor_id: string;
  name: string;
  last_unit_price: number;
  base_unit_id: string | null;
  created_at: string;
  updated_at: string;
  base_unit?: UnitType;
  item_units?: (ItemUnit & { unit_type?: UnitType; target_unit?: UnitType })[];
}

interface PriceHistory {
  date: string;
  unit_price: number;
  quantity: number;
  base_quantity: number | null;
  unit_symbol: string | null;
  bill_number: string | null;
}

interface ConsumptionAnalytics {
  totalBaseQuantity: number;
  weeklyAverage: number;
  monthlyAverage: number;
  avgDaysBetweenPurchases: number | null;
  avgPricePerBaseUnit: number | null;
  lastPurchaseDate: string | null;
  estimatedDaysUntilReorder: number | null;
}

interface ItemWithHistory extends Item {
  priceHistory: PriceHistory[];
  analytics?: ConsumptionAnalytics;
}

export default function ItemsPage() {
  const { tenant } = useTenant();
  const { canWrite } = useRole();
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [items, setItems] = useState<ItemWithHistory[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  
  // Unit management state
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemWithHistory | null>(null);
  const [selectedBaseUnitId, setSelectedBaseUnitId] = useState<string>('');
  const [newPackageUnits, setNewPackageUnits] = useState<{ unitTypeId: string; targetUnitId: string; conversionFactor: number; isDefault: boolean }[]>([]);
  const [savingUnits, setSavingUnits] = useState(false);

  // Load vendors and unit types
  useEffect(() => {
    if (!tenant) return;

    const loadData = async () => {
      const supabase = createClient();
      const [vendorsRes, unitTypesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('type', 'vendor')
          .order('name'),
        supabase
          .from('unit_types')
          .select('*, category:unit_categories(*)')
          .or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`)
          .order('name'),
      ]);

      if (vendorsRes.error) console.error('Error loading vendors:', vendorsRes.error);
      if (unitTypesRes.error) console.error('Error loading unit types:', unitTypesRes.error);

      setVendors((vendorsRes.data || []) as Contact[]);
      setUnitTypes((unitTypesRes.data || []) as UnitType[]);
    };

    loadData();
  }, [tenant]);

  // Calculate consumption analytics from bill lines data
  const calculateAnalytics = (
    allHistory: { date: string; base_quantity: number | null; unit_price: number; quantity: number }[]
  ): ConsumptionAnalytics => {
    if (allHistory.length === 0) {
      return {
        totalBaseQuantity: 0,
        weeklyAverage: 0,
        monthlyAverage: 0,
        avgDaysBetweenPurchases: null,
        avgPricePerBaseUnit: null,
        lastPurchaseDate: null,
        estimatedDaysUntilReorder: null,
      };
    }

    // Sort by date ascending
    const sorted = [...allHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Total base quantity
    const totalBaseQuantity = sorted.reduce((sum, h) => sum + (h.base_quantity || h.quantity), 0);
    
    // Calculate time span in days
    const firstDate = new Date(sorted[0].date);
    const lastDate = new Date(sorted[sorted.length - 1].date);
    const daySpan = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    // Weekly and monthly averages
    const weeklyAverage = (totalBaseQuantity / daySpan) * 7;
    const monthlyAverage = (totalBaseQuantity / daySpan) * 30;
    
    // Average days between purchases
    let avgDaysBetweenPurchases: number | null = null;
    if (sorted.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const d1 = new Date(sorted[i - 1].date);
        const d2 = new Date(sorted[i].date);
        intervals.push(Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
      }
      avgDaysBetweenPurchases = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    }
    
    // Average price per base unit
    let avgPricePerBaseUnit: number | null = null;
    const validPrices = sorted.filter(h => h.base_quantity && h.base_quantity > 0);
    if (validPrices.length > 0) {
      const totalCost = validPrices.reduce((sum, h) => sum + (h.unit_price * h.quantity), 0);
      const totalBase = validPrices.reduce((sum, h) => sum + (h.base_quantity || 0), 0);
      avgPricePerBaseUnit = totalBase > 0 ? totalCost / totalBase : null;
    }
    
    // Estimated days until reorder (based on average consumption)
    let estimatedDaysUntilReorder: number | null = null;
    if (avgDaysBetweenPurchases && sorted.length >= 2) {
      const daysSinceLastPurchase = Math.ceil(
        (new Date().getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      estimatedDaysUntilReorder = Math.max(0, Math.round(avgDaysBetweenPurchases - daysSinceLastPurchase));
    }

    return {
      totalBaseQuantity,
      weeklyAverage,
      monthlyAverage,
      avgDaysBetweenPurchases,
      avgPricePerBaseUnit,
      lastPurchaseDate: sorted[sorted.length - 1].date,
      estimatedDaysUntilReorder,
    };
  };

  // Load items for selected vendor
  const loadItems = useCallback(async () => {
    if (!tenant || !selectedVendorId) {
      setItems([]);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Get items for this vendor
    const { data: itemsData, error: itemsError } = await supabase
      .from('items')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('vendor_id', selectedVendorId)
      .order('name');

    if (itemsError) {
      console.error('Error loading items:', itemsError);
    }
    
    console.log('Loaded items:', itemsData?.length || 0);
    
    // Fetch base_unit and item_units separately if items exist
    let loadedItems: Item[] = [];
    if (itemsData && itemsData.length > 0) {
      const itemIds = itemsData.map(i => i.id);
      
      // Get item_units for all items
      const { data: itemUnitsData } = await supabase
        .from('item_units')
        .select('*')
        .in('item_id', itemIds);
      
      // Get unit types for base units
      const baseUnitIds = itemsData.map(i => i.base_unit_id).filter(Boolean);
      let unitTypesMap: Record<string, any> = {};
      if (baseUnitIds.length > 0) {
        const { data: unitsData } = await supabase
          .from('unit_types')
          .select('*')
          .in('id', baseUnitIds);
        unitTypesMap = (unitsData || []).reduce((acc, u) => ({ ...acc, [u.id]: u }), {});
      }
      
      loadedItems = itemsData.map(item => ({
        ...item,
        base_unit: item.base_unit_id ? unitTypesMap[item.base_unit_id] : null,
        item_units: (itemUnitsData || []).filter(iu => iu.item_id === item.id),
      })) as Item[];
    }

    // Get price history and analytics for each item from bill_lines
    const itemsWithHistory: ItemWithHistory[] = await Promise.all(
      loadedItems.map(async (item) => {
        // Get recent history for display (limited)
        const { data: historyData } = await supabase
          .from('bill_lines')
          .select('unit_price, quantity, base_quantity, created_at, bill:bills(bill_number, issue_date), unit_type:unit_types(symbol)')
          .eq('item_id', item.id)
          .order('created_at', { ascending: false })
          .limit(10);

        const priceHistory: PriceHistory[] = (historyData || []).map((h: any) => ({
          date: h.bill?.issue_date || h.created_at,
          unit_price: h.unit_price,
          quantity: h.quantity,
          base_quantity: h.base_quantity,
          unit_symbol: h.unit_type?.symbol || null,
          bill_number: h.bill?.bill_number,
        }));

        // Get all history for analytics (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const { data: analyticsData } = await supabase
          .from('bill_lines')
          .select('unit_price, quantity, base_quantity, bill:bills(issue_date)')
          .eq('item_id', item.id)
          .gte('created_at', ninetyDaysAgo.toISOString());

        const analyticsHistory = (analyticsData || []).map((h: any) => ({
          date: h.bill?.issue_date || '',
          base_quantity: h.base_quantity,
          unit_price: h.unit_price,
          quantity: h.quantity,
        })).filter(h => h.date);

        const analytics = calculateAnalytics(analyticsHistory);

        return { ...item, priceHistory, analytics };
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

  // Open unit management dialog
  const openUnitDialog = (item: ItemWithHistory) => {
    setSelectedItem(item);
    setSelectedBaseUnitId(item.base_unit_id || '');
    setNewPackageUnits(
      (item.item_units || []).map(iu => ({
        unitTypeId: iu.unit_type_id,
        targetUnitId: iu.target_unit_id || '',
        conversionFactor: iu.conversion_factor,
        isDefault: iu.is_default,
      }))
    );
    setUnitDialogOpen(true);
  };

  const closeUnitDialog = () => {
    setUnitDialogOpen(false);
    setSelectedItem(null);
    setSelectedBaseUnitId('');
    setNewPackageUnits([]);
  };

  const addPackageUnit = () => {
    setNewPackageUnits([...newPackageUnits, { unitTypeId: '', targetUnitId: '', conversionFactor: 1, isDefault: false }]);
  };

  const removePackageUnit = (index: number) => {
    setNewPackageUnits(newPackageUnits.filter((_, i) => i !== index));
  };

  const updatePackageUnit = (index: number, field: string, value: string | number | boolean) => {
    setNewPackageUnits(
      newPackageUnits.map((pu, i) => 
        i === index ? { ...pu, [field]: value } : pu
      )
    );
  };

const saveUnits = async () => {
    if (!selectedItem || !tenant) return;

    setSavingUnits(true);
    const supabase = createClient();

    try {
      // Delete existing item_units
      await supabase
        .from('item_units')
        .delete()
        .eq('item_id', selectedItem.id);

      // Insert new item_units (must have both units and conversion factor)
      const validUnits = newPackageUnits.filter(pu => pu.unitTypeId && pu.targetUnitId && pu.conversionFactor > 0);
      if (validUnits.length > 0) {
        await supabase
          .from('item_units')
          .insert(
            validUnits.map(pu => ({
              item_id: selectedItem.id,
              unit_type_id: pu.unitTypeId,
              target_unit_id: pu.targetUnitId,
              conversion_factor: pu.conversionFactor,
              is_default: pu.isDefault,
            }))
          );
      }

      toast.success('Units updated');
      closeUnitDialog();
      loadItems();
    } catch (error) {
      console.error('Error saving units:', error);
      toast.error('Failed to save units');
    } finally {
      setSavingUnits(false);
    }
  };

  // Get base units only (for base unit selection)
  const baseUnits = unitTypes.filter(u => u.is_base);

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
                                <div>
                                  <span className="font-medium text-white">{item.name}</span>
                                  {item.base_unit && (
                                    <span className="ml-2 text-xs text-slate-400">
                                      ({item.base_unit.symbol})
                                    </span>
                                  )}
                                </div>
                                {canWrite && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleStartEdit(item)}
                                      className="text-slate-400 hover:text-white h-6 w-6 p-0"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => openUnitDialog(item)}
                                      className="text-slate-400 hover:text-white h-6 w-6 p-0"
                                      title="Manage Units"
                                    >
                                      <Settings2 className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
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

                      {/* Price History & Analytics */}
                      {isExpanded && (
                        <div className="border-t border-slate-700 bg-slate-800/50">
                          {/* Consumption Analytics */}
                          {item.analytics && item.base_unit && (
                            <div className="p-4 border-b border-slate-700">
                              <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                                <BarChart3 className="h-4 w-4" />
                                Consumption Analytics (90 days)
                              </h4>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {/* Weekly Average */}
                                <div className="bg-slate-700/30 rounded-lg p-3">
                                  <div className="text-xs text-slate-400 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Weekly Avg
                                  </div>
                                  <div className="text-lg font-bold text-white mt-1">
                                    {item.analytics.weeklyAverage.toFixed(1)}
                                    <span className="text-xs text-slate-400 ml-1">{item.base_unit.symbol}</span>
                                  </div>
                                </div>
                                
                                {/* Monthly Average */}
                                <div className="bg-slate-700/30 rounded-lg p-3">
                                  <div className="text-xs text-slate-400 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Monthly Avg
                                  </div>
                                  <div className="text-lg font-bold text-white mt-1">
                                    {item.analytics.monthlyAverage.toFixed(1)}
                                    <span className="text-xs text-slate-400 ml-1">{item.base_unit.symbol}</span>
                                  </div>
                                </div>
                                
                                {/* Days Between Purchases */}
                                {item.analytics.avgDaysBetweenPurchases !== null && (
                                  <div className="bg-slate-700/30 rounded-lg p-3">
                                    <div className="text-xs text-slate-400 flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      Buy Every
                                    </div>
                                    <div className="text-lg font-bold text-white mt-1">
                                      {Math.round(item.analytics.avgDaysBetweenPurchases)}
                                      <span className="text-xs text-slate-400 ml-1">days</span>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Price per Base Unit */}
                                {item.analytics.avgPricePerBaseUnit !== null && (
                                  <div className="bg-slate-700/30 rounded-lg p-3">
                                    <div className="text-xs text-slate-400">
                                      Avg Price/{item.base_unit.symbol}
                                    </div>
                                    <div className="text-lg font-bold text-emerald-400 mt-1">
                                      {formatCurrency(item.analytics.avgPricePerBaseUnit, tenant.currency)}
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Reorder Alert */}
                              {item.analytics.estimatedDaysUntilReorder !== null && item.analytics.estimatedDaysUntilReorder <= 7 && (
                                <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                  <p className="text-xs text-amber-400">
                                    {item.analytics.estimatedDaysUntilReorder === 0 
                                      ? '⚠️ Based on your buying pattern, you may need to reorder soon!'
                                      : `⚠️ Estimated ${item.analytics.estimatedDaysUntilReorder} days until next purchase`
                                    }
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Price History */}
                          {item.priceHistory.length > 0 && (
                            <div className="p-4">
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
                                        {history.quantity} {history.unit_symbol || 'ea'}
                                        {history.base_quantity && history.unit_symbol && (
                                          <span className="text-slate-500 ml-1">
                                            (= {history.base_quantity.toFixed(2)} {item.base_unit?.symbol || 'base'})
                                          </span>
                                        )}
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Unit Management Dialog */}
      <Dialog open={unitDialogOpen} onOpenChange={setUnitDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Manage Units</DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedItem?.name} - Define unit conversions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add unit button */}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addPackageUnit}
                className="text-emerald-400 hover:text-emerald-300"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Conversion
              </Button>
            </div>

            {newPackageUnits.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-slate-600 rounded-lg">
                <p className="text-sm text-slate-400">No unit conversions defined</p>
                <p className="text-xs text-slate-500 mt-2">
                  Examples:<br />
                  1 box = 4 pack<br />
                  1 pack = 5 lb
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {newPackageUnits.map((pu, index) => {
                  const fromUnit = unitTypes.find(u => u.id === pu.unitTypeId);
                  const toUnit = unitTypes.find(u => u.id === pu.targetUnitId);
                  
                  return (
                    <div key={index} className="p-3 bg-slate-700/30 rounded-lg">
                      {/* Conversion: 1 [unit A] = [X] [unit B] */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-400 text-sm font-medium">1</span>
                        
                        {/* From unit */}
                        <Select 
                          value={pu.unitTypeId} 
                          onValueChange={(v) => updatePackageUnit(index, 'unitTypeId', v)}
                        >
                          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white w-24 h-9">
                            <SelectValue placeholder="unit" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {unitTypes.map((unit) => (
                              <SelectItem key={unit.id} value={unit.id} className="text-white">
                                {unit.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <span className="text-slate-400 text-sm">=</span>
                        
                        {/* Quantity */}
                        <Input
                          type="number"
                          step="0.01"
                          value={pu.conversionFactor || ''}
                          onChange={(e) => updatePackageUnit(index, 'conversionFactor', parseFloat(e.target.value) || 0)}
                          className="bg-slate-700/50 border-slate-600 text-white w-16 h-9 text-center"
                          placeholder="0"
                        />
                        
                        {/* To unit */}
                        <Select 
                          value={pu.targetUnitId} 
                          onValueChange={(v) => updatePackageUnit(index, 'targetUnitId', v)}
                        >
                          <SelectTrigger className="bg-slate-700/50 border-slate-600 text-emerald-400 w-24 h-9">
                            <SelectValue placeholder="unit" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {unitTypes.map((unit) => (
                              <SelectItem key={unit.id} value={unit.id} className="text-white">
                                {unit.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        {/* Delete button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removePackageUnit(index)}
                          className="text-red-400 hover:text-red-300 h-9 w-9 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      {/* Default checkbox and summary */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`default-${index}`}
                            checked={pu.isDefault}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewPackageUnits(newPackageUnits.map((p, i) => ({
                                  ...p,
                                  isDefault: i === index
                                })));
                              } else {
                                updatePackageUnit(index, 'isDefault', false);
                              }
                            }}
                            className="rounded border-slate-600"
                          />
                          <Label htmlFor={`default-${index}`} className="text-xs text-slate-400 cursor-pointer">
                            Default when buying
                          </Label>
                        </div>
                        
                        {/* Show summary */}
                        {fromUnit && toUnit && pu.conversionFactor > 0 && (
                          <span className="text-xs text-emerald-400">
                            1 {fromUnit.symbol} = {pu.conversionFactor} {toUnit.symbol}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Helpful example */}
            {newPackageUnits.length > 0 && (
              <p className="text-xs text-slate-500 italic">
                Tip: For chicken in boxes with 4 packs of 5 lb each, add: 1 box = 4 pack, 1 pack = 5 lb
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeUnitDialog}
              className="border-slate-600 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={saveUnits}
              disabled={savingUnits}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {savingUnits ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

