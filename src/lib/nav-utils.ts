const LABEL_MAP: Record<string, string> = {
  secretary: 'Secretary',
  dashboard: 'Dashboard',
  shows: 'Shows',
  dogs: 'Dogs',
  entries: 'Entries',
  browse: 'Browse',
  feed: 'Feed',
  settings: 'Settings',
  admin: 'Admin',
  feedback: 'Feedback',
  backlog: 'Backlog',
  club: 'My Club',
  billing: 'Billing',
  new: 'New',
  edit: 'Edit',
  people: 'People',
  schedule: 'Schedule',
  checklist: 'Checklist',
  financial: 'Financial',
  catalogue: 'Catalogue',
  results: 'Results',
  reports: 'Reports',
  sponsors: 'Sponsors',
  documents: 'Documents',
  steward: 'Steward',
  enter: 'Enter',
  'print-shop': 'Print Shop',
  'reference-data': 'Reference Data',
  applications: 'Applications',
  invitations: 'Invitations',
  users: 'Users',
  pricing: 'Pricing',
  help: 'Help',
  features: 'Features',
};

/** UUID pattern — don't display raw UUIDs in breadcrumbs */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getBreadcrumbs(pathname: string | null | undefined) {
  if (!pathname) return [];
  const segments = pathname.split('/').filter(Boolean);
  return segments
    .map((segment, i) => {
      // Skip UUID segments in breadcrumbs — they're entity IDs, not readable labels
      if (UUID_RE.test(segment)) return null;
      // Also skip slug segments that look like show slugs (contain multiple hyphens + year)
      if (segment.includes('-') && /\d{4}/.test(segment) && segment.length > 20) return null;

      const label = LABEL_MAP[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
      return {
        label,
        href: '/' + segments.slice(0, i + 1).join('/'),
        isLast: i === segments.length - 1,
      };
    })
    .filter(Boolean) as { label: string; href: string; isLast: boolean }[];
}
