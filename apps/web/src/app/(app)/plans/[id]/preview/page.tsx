import { PlanPreviewClient } from '../../../../../features/plans/PlanPreviewClient.js';

// Plan 22 · Phase D1 — Plan Preview route.
// Server component wrapper. The client island handles data fetching
// (MealPlanDetailResponse + initial aggregate) so the BFF session cookie
// is reused for both requests without a server-to-server hop.

export default async function PlanPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return <PlanPreviewClient planId={id} />;
}
