import type { Metadata } from 'next';
import { AccountClient } from './AccountClient.js';

export const metadata: Metadata = { title: 'Account — CelebBase Wellness' };

export default function AccountPage(): React.ReactElement {
  return <AccountClient />;
}
