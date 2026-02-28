'use client';

import { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, ChevronLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaymentFormProps {
  amount: number;
  onSuccess: () => void;
  onBack: () => void;
}

export function PaymentForm({ amount, onSuccess, onBack }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'An error occurred');
      setIsProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed. Please try again.');
      setIsProcessing(false);
      return;
    }

    // Payment succeeded
    onSuccess();
    setIsProcessing(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="h-11 text-sm"
          onClick={onBack}
          disabled={isProcessing}
        >
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button
          type="submit"
          className="h-11 flex-1 text-sm"
          disabled={!stripe || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Lock className="size-4" />
              Pay £{(amount / 100).toFixed(2)}
            </>
          )}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Your payment is securely processed by Stripe. We never store your card
        details.
      </p>
    </form>
  );
}
