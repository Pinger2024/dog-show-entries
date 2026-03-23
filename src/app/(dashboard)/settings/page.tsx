'use client';

import { Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { Settings } from 'lucide-react';
import { PageHeader, PageTitle } from '@/components/ui/page-header';
import { ProfileForm } from './profile-form';
import { PasswordForm } from './password-form';
import { ProSubscription } from './pro-subscription';

export default function SettingsPage() {
  const { data: session } = useSession();
  const isExhibitor = session?.user?.role === 'exhibitor';

  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <PageHeader>
        <div className="flex items-center gap-3">
          <Settings className="size-6 text-primary" />
          <PageTitle>Settings</PageTitle>
        </div>
      </PageHeader>

      <div className={isExhibitor ? 'grid gap-6 lg:grid-cols-[1fr_380px]' : 'max-w-2xl space-y-6'}>
        {/* Profile settings */}
        <div className="space-y-6">
          <ProfileForm />
          <PasswordForm />
        </div>

        {/* Pro subscription — exhibitors only */}
        {isExhibitor && (
          <div>
            <Suspense>
              <ProSubscription />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
