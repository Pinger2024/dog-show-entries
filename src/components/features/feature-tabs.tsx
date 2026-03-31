'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AnimateIn } from '@/components/animate-in';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  colour: string;
}

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  badgeColour: string;
  title: string;
  subtitle: string;
  features: Feature[];
}

export function FeatureTabs({ tabs }: { tabs: Tab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8">
        {/* Tab bar — horizontal scroll on mobile */}
        <div className="-mx-4 mb-10 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:justify-center sm:gap-2 sm:px-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all min-h-[2.75rem]',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active tab content */}
        {active && (
          <div key={active.id}>
            <div className="mx-auto max-w-2xl text-center mb-10">
              <h2 className="gold-rule-center font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                {active.title}
              </h2>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                {active.subtitle}
              </p>
            </div>

            <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
              {active.features.map((feature, i) => (
                <AnimateIn key={feature.title} delay={i * 40}>
                  <div className="group relative h-full rounded-2xl border bg-card p-5 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 sm:p-6">
                    <div className={`mb-3 inline-flex rounded-xl p-2.5 ${feature.colour}`}>
                      <feature.icon className="size-5" />
                    </div>
                    <h3 className="font-serif text-base font-bold sm:text-lg">{feature.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
