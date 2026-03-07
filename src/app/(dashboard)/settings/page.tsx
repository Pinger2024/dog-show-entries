'use client';

import { Suspense } from 'react';
import { Settings, Crown } from 'lucide-react';
import { ProfileForm } from './profile-form';
import { PasswordForm } from './password-form';
import { ProSubscription } from './pro-subscription';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div className="flex items-center gap-3">
        <Settings className="size-6 text-primary" />
        <h1 className="font-serif text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left column: profile settings */}
        <div className="space-y-6">
          <ProfileForm />
          <PasswordForm />
        </div>

        {/* Right column: Pro subscription */}
        <div>
          <Suspense>
            <ProSubscription />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
