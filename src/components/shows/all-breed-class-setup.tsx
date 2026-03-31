'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CLASS_TEMPLATES } from '@/lib/class-templates';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────

interface BreedWithGroup {
  id: string;
  name: string;
  group: { id: string; name: string };
}

interface BreedGroupData {
  id: string;
  name: string;
  breeds: BreedWithGroup[];
}

export interface AllBreedClassData {
  /** Selected breed IDs */
  selectedBreedIds: string[];
  /** Selected class template ID */
  selectedTemplateId: string | null;
  /** Class definition IDs from the selected template */
  classDefinitionIds: string[];
  /** Per-breed class overrides: breedId -> class definition IDs (if customised) */
  breedClassOverrides: Record<string, string[]>;
}

interface AllBreedClassSetupProps {
  value: AllBreedClassData;
  onChange: (data: AllBreedClassData) => void;
  classDefinitions: { id: string; name: string }[];
}

// ── Canonical breed group ordering ─────────────────────────

const GROUP_ORDER = ['Gundog', 'Hound', 'Pastoral', 'Terrier', 'Toy', 'Utility', 'Working'];

// Filter templates appropriate for all-breed shows (exclude GSD-specific)
const ALL_BREED_TEMPLATES = CLASS_TEMPLATES.filter(
  (t) => !t.id.includes('gsd_')
);

// ── Sub-step navigation ────────────────────────────────────

type SubStep = 'breeds' | 'template' | 'review';

const SUB_STEPS: { key: SubStep; label: string }[] = [
  { key: 'breeds', label: 'Breeds' },
  { key: 'template', label: 'Classes' },
  { key: 'review', label: 'Review' },
];

// ── Component ──────────────────────────────────────────────

export function AllBreedClassSetup({
  value,
  onChange,
  classDefinitions,
}: AllBreedClassSetupProps) {
  const [subStep, setSubStep] = useState<SubStep>('breeds');
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Fetch breeds with groups
  const { data: allBreeds, isLoading: breedsLoading } = trpc.breeds.list.useQuery();

  // Group breeds by their breed group
  const breedGroups: BreedGroupData[] = useMemo(() => {
    if (!allBreeds) return [];
    const groupMap = new Map<string, BreedGroupData>();

    for (const breed of allBreeds) {
      if (!breed.group) continue;
      const existing = groupMap.get(breed.group.id);
      if (existing) {
        existing.breeds.push(breed as BreedWithGroup);
      } else {
        groupMap.set(breed.group.id, {
          id: breed.group.id,
          name: breed.group.name,
          breeds: [breed as BreedWithGroup],
        });
      }
    }

    // Sort groups by canonical order, breeds alphabetically within each
    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.name);
      const bi = GROUP_ORDER.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    for (const g of groups) {
      g.breeds.sort((a, b) => a.name.localeCompare(b.name));
    }

    return groups;
  }, [allBreeds]);

  const allBreedIds = useMemo(
    () => breedGroups.flatMap((g) => g.breeds.map((b) => b.id)),
    [breedGroups]
  );

  const totalBreedCount = allBreedIds.length;

  // ── Breed selection helpers ────────────────────────────────

  const selectedBreedSet = useMemo(
    () => new Set(value.selectedBreedIds),
    [value.selectedBreedIds]
  );

  // Previously auto-selected all 226 breeds — now starts empty (opt-in, not opt-out).
  // Secretaries use "Select All" button or pick individual breeds/groups.

  const toggleBreed = useCallback(
    (breedId: string) => {
      const newSet = new Set(value.selectedBreedIds);
      if (newSet.has(breedId)) {
        newSet.delete(breedId);
      } else {
        newSet.add(breedId);
      }
      onChange({ ...value, selectedBreedIds: Array.from(newSet) });
    },
    [value, onChange]
  );

  const toggleGroup = useCallback(
    (group: BreedGroupData) => {
      const groupBreedIds = group.breeds.map((b) => b.id);
      const allSelected = groupBreedIds.every((id) => selectedBreedSet.has(id));
      const newSet = new Set(value.selectedBreedIds);

      if (allSelected) {
        // Deselect all in group
        for (const id of groupBreedIds) newSet.delete(id);
      } else {
        // Select all in group
        for (const id of groupBreedIds) newSet.add(id);
      }

      onChange({ ...value, selectedBreedIds: Array.from(newSet) });
    },
    [value, onChange, selectedBreedSet]
  );

  const selectAllBreeds = useCallback(() => {
    onChange({ ...value, selectedBreedIds: allBreedIds });
  }, [value, onChange, allBreedIds]);

  const deselectAllBreeds = useCallback(() => {
    onChange({ ...value, selectedBreedIds: [] });
  }, [value, onChange]);

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // ── Filtered breeds for search ────────────────────────────

  const searchLower = search.toLowerCase().trim();

  const filteredGroups = useMemo(() => {
    if (!searchLower) return breedGroups;
    return breedGroups
      .map((g) => ({
        ...g,
        breeds: g.breeds.filter(
          (b) =>
            b.name.toLowerCase().includes(searchLower) ||
            g.name.toLowerCase().includes(searchLower)
        ),
      }))
      .filter((g) => g.breeds.length > 0);
  }, [breedGroups, searchLower]);

  // ── Template helpers ──────────────────────────────────────

  const handleSelectTemplate = useCallback(
    (templateId: string) => {
      const template = ALL_BREED_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;

      const isAlreadySelected = value.selectedTemplateId === templateId;
      if (isAlreadySelected) {
        onChange({
          ...value,
          selectedTemplateId: null,
          classDefinitionIds: [],
        });
        return;
      }

      // Match template class names to class definition IDs
      const classNameSet = new Set(template.classNames);
      const matchedIds = classDefinitions
        .filter((cd) => classNameSet.has(cd.name))
        .map((cd) => cd.id);

      onChange({
        ...value,
        selectedTemplateId: templateId,
        classDefinitionIds: matchedIds,
        breedClassOverrides: {}, // Reset overrides on template change
      });
    },
    [value, onChange, classDefinitions]
  );

  const selectedTemplate = ALL_BREED_TEMPLATES.find(
    (t) => t.id === value.selectedTemplateId
  );

  const matchedClasses = useMemo(() => {
    if (!value.classDefinitionIds.length) return [];
    const idSet = new Set(value.classDefinitionIds);
    return classDefinitions.filter((cd) => idSet.has(cd.id));
  }, [value.classDefinitionIds, classDefinitions]);

  // ── Review stats ──────────────────────────────────────────

  const reviewStats = useMemo(() => {
    const breedCount = value.selectedBreedIds.length;
    const classesPerBreed = value.classDefinitionIds.length;
    const overrideCount = Object.keys(value.breedClassOverrides).length;
    const totalClasses =
      (breedCount - overrideCount) * classesPerBreed +
      Object.values(value.breedClassOverrides).reduce(
        (sum, ids) => sum + ids.length,
        0
      );
    return { breedCount, classesPerBreed, overrideCount, totalClasses };
  }, [value]);

  // ── Group breed counts for review ─────────────────────────

  const selectedBreedsByGroup = useMemo(() => {
    return breedGroups.map((g) => ({
      ...g,
      breeds: g.breeds.filter((b) => selectedBreedSet.has(b.id)),
    })).filter((g) => g.breeds.length > 0);
  }, [breedGroups, selectedBreedSet]);

  // ── Render ────────────────────────────────────────────────

  if (breedsLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading breeds...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-step navigation */}
      <div className="flex items-center gap-1 border-b pb-3">
        {SUB_STEPS.map((s, i) => {
          const isCurrent = s.key === subStep;
          const isPast = SUB_STEPS.findIndex((ss) => ss.key === subStep) > i;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                // Allow going back, or forward if valid
                if (isPast || isCurrent) setSubStep(s.key);
                else if (s.key === 'template' && value.selectedBreedIds.length > 0)
                  setSubStep(s.key);
                else if (
                  s.key === 'review' &&
                  value.selectedBreedIds.length > 0 &&
                  value.selectedTemplateId
                )
                  setSubStep(s.key);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : isPast
                    ? 'bg-muted text-foreground hover:bg-muted/80 cursor-pointer'
                    : 'text-muted-foreground cursor-default'
              )}
            >
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded-full text-[10px]',
                  isCurrent
                    ? 'bg-primary-foreground text-primary'
                    : isPast
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted-foreground/20'
                )}
              >
                {isPast ? <Check className="size-2.5" /> : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Sub-step 1: Breed Selection */}
      {subStep === 'breeds' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Select breeds ({value.selectedBreedIds.length} of {totalBreedCount})
            </p>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={selectAllBreeds}
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={deselectAllBreeds}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search breeds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Breed groups */}
          <div className="space-y-1 rounded-lg border">
            {filteredGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.id) || !!searchLower;
              const groupBreedIds = group.breeds.map((b) => b.id);
              const selectedInGroup = groupBreedIds.filter((id) =>
                selectedBreedSet.has(id)
              ).length;
              const allInGroupSelected =
                selectedInGroup === group.breeds.length;
              const someInGroupSelected =
                selectedInGroup > 0 && !allInGroupSelected;

              return (
                <div key={group.id} className="border-b last:border-b-0">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50">
                    <Checkbox
                      checked={
                        allInGroupSelected
                          ? true
                          : someInGroupSelected
                            ? 'indeterminate'
                            : false
                      }
                      onCheckedChange={() => toggleGroup(group)}
                    />
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-2 text-left"
                      onClick={() => toggleGroupExpanded(group.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">{group.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {selectedInGroup}/{group.breeds.length}
                      </Badge>
                    </button>
                  </div>

                  {/* Breed list */}
                  {isExpanded && (
                    <div className="px-3 pb-2">
                      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
                        {group.breeds.map((breed) => (
                          <label
                            key={breed.id}
                            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedBreedSet.has(breed.id)}
                              onCheckedChange={() => toggleBreed(breed.id)}
                            />
                            <span className="text-sm">{breed.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredGroups.length === 0 && search && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No breeds matching &ldquo;{search}&rdquo;
            </p>
          )}

          {/* Navigate forward */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              disabled={value.selectedBreedIds.length === 0}
              onClick={() => setSubStep('template')}
            >
              Choose Classes
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Sub-step 2: Class Template Selection */}
      {subStep === 'template' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">
              Choose a class template for {value.selectedBreedIds.length} breeds
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The selected template will apply uniformly to all breeds. You can
              customise individual breeds in the next step.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_BREED_TEMPLATES.map((t) => {
              const isActive = value.selectedTemplateId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTemplate(t.id)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors relative',
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                >
                  {isActive && (
                    <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="size-3 text-primary-foreground" />
                    </div>
                  )}
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.classNames.length} classes
                    {t.splitBySex ? ' \u00b7 Split by sex' : ''}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedTemplate && matchedClasses.length > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">
                Classes included ({matchedClasses.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {matchedClasses.map((cd) => (
                  <Badge key={cd.id} variant="secondary">
                    {cd.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {!value.selectedTemplateId && (
            <p className="text-sm text-muted-foreground">
              Select a template above to define classes for your breeds.
            </p>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSubStep('breeds')}
            >
              Back to Breeds
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!value.selectedTemplateId}
              onClick={() => setSubStep('review')}
            >
              Review
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Sub-step 3: Review */}
      {subStep === 'review' && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{reviewStats.breedCount}</p>
              <p className="text-xs text-muted-foreground">Breeds</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{reviewStats.classesPerBreed}</p>
              <p className="text-xs text-muted-foreground">Classes/breed</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{reviewStats.totalClasses}</p>
              <p className="text-xs text-muted-foreground">Total classes</p>
            </div>
          </div>

          {selectedTemplate && (
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">
                Template: {selectedTemplate.name}
                {selectedTemplate.splitBySex && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Split by sex
                  </Badge>
                )}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {matchedClasses.map((cd) => (
                  <Badge key={cd.id} variant="secondary" className="text-xs">
                    {cd.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Breeds by group */}
          <div className="space-y-1 rounded-lg border">
            {selectedBreedsByGroup.map((group) => (
              <div key={group.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                  onClick={() => toggleGroupExpanded(group.id)}
                >
                  {expandedGroups.has(group.id) ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{group.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {group.breeds.length} breed{group.breeds.length !== 1 ? 's' : ''}
                  </Badge>
                </button>

                {expandedGroups.has(group.id) && (
                  <div className="px-3 pb-2">
                    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
                      {group.breeds.map((breed) => (
                        <div
                          key={breed.id}
                          className="flex items-center gap-2 rounded px-2 py-1 text-sm"
                        >
                          <Check className="size-3 text-primary" />
                          {breed.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSubStep('template')}
            >
              Change Classes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSubStep('breeds')}
            >
              Change Breeds
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
