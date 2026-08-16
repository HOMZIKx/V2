import { ActivityDetailPage } from '../../../../src/components/ActivityDetailPage';

export default async function ActivityDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ActivityDetailPage activityId={id} />;
}
