'use client';

import { useState, useEffect } from 'react';
import { useTenant } from './use-tenant';
import { createClient } from '@/lib/supabase/client';

type Role = 'owner' | 'manager' | 'viewer' | null;

export function useRole() {
  const { tenant } = useTenant();
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!tenant) {
        setRole(null);
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
        .single();

      setRole(data?.role as Role || null);
      setLoading(false);
    };

    fetchRole();
  }, [tenant]);

  const canWrite = role === 'owner' || role === 'manager';
  const isOwner = role === 'owner';

  return { role, canWrite, isOwner, loading };
}

