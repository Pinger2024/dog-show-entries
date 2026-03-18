'use client';

import { useShowId } from '../_lib/show-context';
import { ScheduleSettingsForm } from '../_components/schedule-settings-form';

export default function ScheduleSettingsPage() {
  const showId = useShowId();

  return <ScheduleSettingsForm showId={showId} />;
}
