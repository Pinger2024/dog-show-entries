'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function PasswordForm() {
  const { data: hasPassword, isLoading } = trpc.users.hasPassword.useQuery();
  const setPasswordMutation = trpc.users.setPassword.useMutation();
  const changePasswordMutation = trpc.users.changePassword.useMutation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordVisible, setShowPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isPending = setPasswordMutation.isPending || changePasswordMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      if (hasPassword) {
        await changePasswordMutation.mutateAsync({
          currentPassword,
          newPassword,
        });
        setSuccess('Password changed successfully');
      } else {
        await setPasswordMutation.mutateAsync({
          password: newPassword,
        });
        setSuccess('Password set successfully');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Password</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="size-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-lg">
          {hasPassword ? 'Change Password' : 'Set a Password'}
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? 'Update your password. You can also continue using magic links or Google to sign in.'
            : 'Set a password to sign in faster with browser autofill. Magic links and Google will still work.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {hasPassword && (
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type={showPasswordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setError(''); }}
                required
                className="h-11"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">
              {hasPassword ? 'New password' : 'Password'}
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPasswordVisible ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                minLength={8}
                maxLength={128}
                required
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPasswordVisible(!showPasswordVisible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPasswordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm password</Label>
            <Input
              id="confirm-new-password"
              type={showPasswordVisible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
              minLength={8}
              maxLength={128}
              required
              className="h-11"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {success}
            </div>
          )}

          <Button type="submit" className="h-11" disabled={isPending}>
            {isPending
              ? 'Saving...'
              : hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
