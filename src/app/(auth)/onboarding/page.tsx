import { requireAuth } from '@/lib/auth-utils';
import { OnboardingWizard } from './onboarding-wizard';

export default async function OnboardingPage() {
  const user = await requireAuth();

  return <OnboardingWizard user={user} />;
}
