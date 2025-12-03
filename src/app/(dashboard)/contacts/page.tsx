'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Users, Building2, User, Mail, Phone, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils/format';
import { AddContactDialog } from '@/features/contacts/add-contact-dialog';
import { ContactDetailsDrawer } from '@/features/contacts/contact-details-drawer';
import type { Contact, ContactType } from '@/lib/supabase/types';

export default function ContactsPage() {
  const { tenant } = useTenant();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'vendor' | 'customer'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<ContactType>('vendor');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);

  const loadContacts = useCallback(async () => {
    if (!tenant) return;

    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name', { ascending: true });

    setContacts((data || []) as Contact[]);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const filteredContacts = contacts.filter((contact) => {
    if (filter === 'all') return true;
    return contact.type === filter;
  });

  const handleAddContact = (type: ContactType) => {
    setDefaultType(type);
    setDialogOpen(true);
  };

  const handleContactClick = (contact: Contact) => {
    setSelectedContact(contact);
    setDetailsDrawerOpen(true);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="text-slate-400">Manage your vendors and customers</p>
        </div>
        <div className="hidden lg:flex gap-2">
          <Button
            onClick={() => handleAddContact('vendor')}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <Building2 className="mr-2 h-4 w-4" />
            Add Vendor
          </Button>
          <Button
            onClick={() => handleAddContact('customer')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            <User className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Mobile Add Buttons */}
      <div className="flex gap-2 mb-6 lg:hidden">
        <Button
          onClick={() => handleAddContact('vendor')}
          variant="outline"
          className="flex-1 border-slate-600 text-slate-300"
        >
          <Building2 className="mr-2 h-4 w-4" />
          Vendor
        </Button>
        <Button
          onClick={() => handleAddContact('customer')}
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
        >
          <User className="mr-2 h-4 w-4" />
          Customer
        </Button>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-6">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="all" className="data-[state=active]:bg-slate-700">
            All
          </TabsTrigger>
          <TabsTrigger value="vendor" className="data-[state=active]:bg-slate-700">
            Vendors
          </TabsTrigger>
          <TabsTrigger value="customer" className="data-[state=active]:bg-slate-700">
            Customers
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Contacts List */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Users className="h-12 w-12 mx-auto mb-4 text-slate-600" />
              <p>No contacts found.</p>
              <Button
                onClick={() => handleAddContact('vendor')}
                className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Contact
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => handleContactClick(contact)}
                  className="p-4 hover:bg-slate-700/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`p-2 rounded-full shrink-0 ${
                          contact.type === 'vendor'
                            ? 'bg-purple-500/10'
                            : 'bg-cyan-500/10'
                        }`}
                      >
                        {contact.type === 'vendor' ? (
                          <Building2 className="h-5 w-5 text-purple-400" />
                        ) : (
                          <User className="h-5 w-5 text-cyan-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white truncate">{contact.name}</p>
                          <Badge
                            className={
                              contact.type === 'vendor'
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                            }
                          >
                            {contact.type === 'vendor' ? 'Vendor' : 'Customer'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                          {contact.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{contact.email}</span>
                            </span>
                          )}
                          {contact.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {contact.balance !== 0 && (
                        <div className="text-right">
                          <div className="text-xs text-slate-400">
                            {contact.type === 'vendor'
                              ? contact.balance > 0
                                ? 'Balance'
                                : 'Credit'
                              : contact.balance > 0
                              ? 'Balance'
                              : 'Credit'}
                          </div>
                          <div
                            className={`font-medium ${
                              contact.balance > 0 ? 'text-red-400' : 'text-green-400'
                            }`}
                          >
                            {formatCurrency(Math.abs(contact.balance), tenant.currency)}
                          </div>
                        </div>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-500" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Contact Dialog */}
      <AddContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={loadContacts}
        defaultType={defaultType}
      />

      {/* Contact Details Drawer */}
      <ContactDetailsDrawer
        contact={selectedContact}
        open={detailsDrawerOpen}
        onOpenChange={setDetailsDrawerOpen}
        onContactUpdate={loadContacts}
      />
    </div>
  );
}

