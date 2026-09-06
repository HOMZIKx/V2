import { redirect } from 'next/navigation';

/** WWW Activity tab removed; events stay on Discord / activity-service API. */
export default function ActivityPage() {
  redirect('/');
}
