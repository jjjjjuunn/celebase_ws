'use client';

import { createContext, useContext } from 'react';
import { schemas } from '@celebbase/shared-types';
import type { z } from 'zod';

export type UserWire = z.infer<typeof schemas.UserWireSchema>;

export interface UserContextValue {
  user: UserWire | null;
  loading: boolean;
  refetch: () => void;
}

export const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  refetch: () => undefined,
});

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
