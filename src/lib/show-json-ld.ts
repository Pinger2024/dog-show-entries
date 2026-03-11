interface ShowForJsonLd {
  id: string;
  name: string;
  description?: string | null;
  showType: string;
  status: string;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  entryCloseDate?: Date | null;
  firstEntryFee?: number | null;
  kcLicenceNo?: string | null;
  organisation?: {
    name: string;
    website?: string | null;
    logoUrl?: string | null;
  } | null;
  venue?: {
    name: string;
    address?: string | null;
    postcode?: string | null;
    lat?: string | null;
    lng?: string | null;
  } | null;
  judgeAssignments?: Array<{
    judge?: { name: string } | null;
  }> | null;
}

interface SponsorForJsonLd {
  tier: string;
  customTitle?: string | null;
  sponsor: {
    name: string;
    website?: string | null;
    logoUrl?: string | null;
  };
}

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

const STATUS_MAP: Record<string, string> = {
  draft: 'https://schema.org/EventScheduled',
  published: 'https://schema.org/EventScheduled',
  entries_open: 'https://schema.org/EventScheduled',
  entries_closed: 'https://schema.org/EventScheduled',
  in_progress: 'https://schema.org/EventScheduled',
  completed: 'https://schema.org/EventScheduled',
  cancelled: 'https://schema.org/EventCancelled',
};

export function buildShowJsonLd(
  show: ShowForJsonLd,
  showUrl: string,
  sponsors?: SponsorForJsonLd[]
) {
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: show.name,
    url: showUrl,
    eventStatus: STATUS_MAP[show.status] ?? 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  };

  if (show.description) {
    jsonLd.description = show.description;
  }

  // Dates
  jsonLd.startDate = show.startDate;
  if (show.endDate !== show.startDate) {
    jsonLd.endDate = show.endDate;
  }

  // Location
  if (show.venue) {
    const place: Record<string, unknown> = {
      '@type': 'Place',
      name: show.venue.name,
    };
    const address: Record<string, unknown> = {
      '@type': 'PostalAddress',
      addressCountry: 'GB',
    };
    if (show.venue.address) address.streetAddress = show.venue.address;
    if (show.venue.postcode) address.postalCode = show.venue.postcode;
    place.address = address;

    if (show.venue.lat && show.venue.lng) {
      place.geo = {
        '@type': 'GeoCoordinates',
        latitude: parseFloat(show.venue.lat),
        longitude: parseFloat(show.venue.lng),
      };
    }
    jsonLd.location = place;
  }

  // Organizer
  if (show.organisation) {
    const org: Record<string, unknown> = {
      '@type': 'Organization',
      name: show.organisation.name,
    };
    if (show.organisation.website) org.url = show.organisation.website;
    if (show.organisation.logoUrl) org.logo = show.organisation.logoUrl;
    jsonLd.organizer = org;
  }

  // Judges as performers
  const judges = [
    ...new Set(
      show.judgeAssignments
        ?.map((ja) => ja.judge?.name)
        .filter(Boolean) as string[]
    ),
  ];
  if (judges.length) {
    jsonLd.performer = judges.map((name) => ({
      '@type': 'Person',
      name,
    }));
  }

  // Entry fee as offer
  if (show.firstEntryFee != null) {
    const offer: Record<string, unknown> = {
      '@type': 'Offer',
      price: (show.firstEntryFee / 100).toFixed(2),
      priceCurrency: 'GBP',
      url: showUrl,
    };
    if (show.status === 'entries_open') {
      offer.availability = 'https://schema.org/InStock';
    } else if (show.status === 'entries_closed') {
      offer.availability = 'https://schema.org/SoldOut';
    }
    if (show.entryCloseDate) {
      offer.validThrough = show.entryCloseDate.toISOString();
    }
    jsonLd.offers = offer;
  }

  // Sponsors as funder
  if (sponsors?.length) {
    const topSponsors = sponsors.filter(
      (s) => s.tier === 'title' || s.tier === 'show'
    );
    if (topSponsors.length) {
      jsonLd.funder = topSponsors.map((s) => {
        const funder: Record<string, unknown> = {
          '@type': 'Organization',
          name: s.sponsor.name,
        };
        if (s.sponsor.website) funder.url = s.sponsor.website;
        if (s.sponsor.logoUrl) funder.logo = s.sponsor.logoUrl;
        return funder;
      });
    }
  }

  // Additional metadata
  jsonLd.isAccessibleForFree = false;
  if (show.showType) {
    jsonLd.additionalType = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  }

  return jsonLd;
}
