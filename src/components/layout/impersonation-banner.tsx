'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Eye } from 'lucide-react';

interface ImpersonationBannerProps {
  userName: string;
  userEmail: string;
  userRole: string;
}

export function ImpersonationBanner({ userName, userEmail, userRole }: ImpersonationBannerProps) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function handleExit() {
    setExiting(true);
    await fetch('/api/admin/stop-impersonate', { method: 'POST' });
    router.push('/admin/users');
    router.refresh();
  }

  return (
    <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Eye className="size-4" />
        <span>
          <span className="font-semibold">Impersonating:</span>{' '}
          {userName || userEmail}
          <span className="ml-1.5 opacity-75">({userRole})</span>
        </span>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="flex items-center gap-1 rounded bg-orange-600 hover:bg-orange-700 px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
      >
        <X className="size-3" />
        {exiting ? 'Exiting...' : 'Exit Impersonation'}
      </button>
    </div>
  );
}
