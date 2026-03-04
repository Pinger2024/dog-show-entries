'use client';

import { Settings } from 'lucide-react';
import { ProfileForm } from './profile-form';
import { PasswordForm } from './password-form';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="size-6 text-primary" />
        <h1 className="font-serif text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      <div className="space-y-6">
        <ProfileForm />
        <PasswordForm />
      </div>
    </div>
  );
}
