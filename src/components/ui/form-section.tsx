import * as React from 'react';

import { cn } from '@/lib/utils';

interface FormSectionProps extends React.ComponentProps<'fieldset'> {
  /** Section heading. */
  title: string;
  /** Optional description below the heading. */
  description?: string;
}

/**
 * Reusable form section — groups related fields with a heading,
 * optional description, and consistent vertical spacing.
 *
 * Renders as a <fieldset> with <legend> for accessibility.
 */
function FormSection({
  title,
  description,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <fieldset
      className={cn('space-y-4', className)}
      {...props}
    >
      <div>
        <legend className="font-serif text-lg font-semibold tracking-tight">
          {title}
        </legend>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </fieldset>
  );
}

export { FormSection };
export type { FormSectionProps };
