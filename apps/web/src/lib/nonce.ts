import { headers } from 'next/headers';

// Read the per-request CSP nonce injected by middleware.
// Call only in Server Components (RSC) or route handlers — not in 'use client' files.
export async function getNonce(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get('x-nonce');
}
