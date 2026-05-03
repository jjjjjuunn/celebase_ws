import type { Metadata } from 'next';
import { TrackClient } from './TrackClient.js';

export const metadata: Metadata = { title: 'Track — CelebBase Wellness' };

export default function TrackPage(): React.ReactElement {
  return <TrackClient />;
}
