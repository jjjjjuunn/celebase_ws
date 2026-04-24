'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { schemas } from '@celebbase/shared-types';
import { fetcher } from '@/lib/fetcher.js';
import { UserContext, type UserWire } from '@/lib/user-context.js';

export function UserProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [user, setUser] = useState<UserWire | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback((): void => {
    void (async () => {
      try {
        const res = await fetcher('/api/users/me', { schema: schemas.MeResponseSchema });
        setUser(res.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <UserContext.Provider value={{ user, loading, refetch: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}
