import { NextRequest, NextResponse } from 'next/server';

const OS_PLACES_URL = 'https://api.os.uk/search/places/v1/postcode';

export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get('postcode');
  if (!postcode) {
    return NextResponse.json({ error: 'Postcode is required' }, { status: 400 });
  }

  // Validate UK postcode format before forwarding to OS Places
  const postcodeRegex = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
  if (!postcodeRegex.test(postcode.trim())) {
    return NextResponse.json({ error: 'Invalid postcode format' }, { status: 400 });
  }

  const apiKey = process.env.OS_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Address lookup not configured' }, { status: 503 });
  }

  try {
    const url = new URL(OS_PLACES_URL);
    url.searchParams.set('postcode', postcode.trim());
    url.searchParams.set('key', apiKey);
    url.searchParams.set('dataset', 'DPA'); // Delivery Point Address (Royal Mail PAF equivalent)

    const res = await fetch(url.toString());

    if (!res.ok) {
      console.error('[address-lookup] OS Places returned', res.status);
      return NextResponse.json({ error: 'Lookup failed' }, { status: 502 });
    }

    const data = await res.json();
    const results = (data.results ?? []).map((r: Record<string, Record<string, string>>) => {
      const dpa = r.DPA;
      if (!dpa) return null;

      // Build a clean multi-line address from OS Places DPA fields
      const lines: string[] = [];
      if (dpa.ORGANISATION_NAME) lines.push(dpa.ORGANISATION_NAME);
      if (dpa.SUB_BUILDING_NAME) lines.push(dpa.SUB_BUILDING_NAME);
      if (dpa.BUILDING_NAME) lines.push(dpa.BUILDING_NAME);

      const numberAndStreet = [dpa.BUILDING_NUMBER, dpa.THOROUGHFARE_NAME]
        .filter(Boolean)
        .join(' ');
      if (numberAndStreet) lines.push(numberAndStreet);

      if (dpa.DEPENDENT_LOCALITY) lines.push(dpa.DEPENDENT_LOCALITY);
      const postTown = dpa.POST_TOWN ?? '';
      const postcode = dpa.POSTCODE ?? '';

      const address = lines.join(', ');

      return {
        address,
        town: postTown,
        postcode,
        fullAddress: dpa.ADDRESS ?? [address, postTown, postcode].filter(Boolean).join(', '),
        uprn: dpa.UPRN,
      };
    }).filter(Boolean);

    return NextResponse.json({ results }, {
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('[address-lookup] Error:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
