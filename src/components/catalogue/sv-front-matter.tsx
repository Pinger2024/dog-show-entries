/**
 * Front-matter pages for the SV/WUSV catalogue — sit between the cover
 * and the by-class entries section.
 *
 * Mirrors the page structure of the SPGSD Regional 2026 catalogue
 * Amanda shared (2026-05-23):
 *
 *   Page 2 — Acknowledgements: Event Manager, Awards on offer, thanks
 *            to sponsors, vet on call
 *   Page 3 — Breed Classification: numbered class list with a/b coat
 *            sub-letters, time schedule, identification-checks note
 *   Page 4 — Judges biographies
 *   Page 5 — BRG Points System explainer
 *
 * All four pages render on the SV palette + typography defined in
 * `src/components/schedule/shared/sv-styles.ts`, with the inside-page
 * tonal wash sitting behind the content so the document reads as one
 * continuous design from cover to last entry.
 */
import { Page, Text, View } from '@react-pdf/renderer';
import { TonalWash } from '@/components/sv-pdf/cover-atoms';
import { SV, ss, SV_FONTS } from '@/components/schedule/shared/sv-styles';
import type { CatalogueShowInfo, ShowClassInfo } from './catalogue-types';

const PAGE_STYLE = {
  backgroundColor: SV.paper,
  color: SV.ink,
  fontFamily: SV_FONTS.sans,
  fontSize: 9.5,
  lineHeight: 1.5,
  paddingTop: '9mm',
  paddingBottom: '14mm',
  paddingLeft: '11mm',
  paddingRight: '11mm',
} as const;

function Topper({ num, subject }: { num: number; subject: string }) {
  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={ss.eyebrow}>№ {String(num).padStart(2, '0')}</Text>
        <Text style={ss.eyebrow}>{subject}</Text>
      </View>
      <View style={[ss.ruleThin, { marginTop: 4 }]} />
    </>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 13, color: SV.ink }}>{title}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: SV.rule }} />
    </View>
  );
}

// ── PAGE 2 — ACKNOWLEDGEMENTS ────────────────────────────────────────────

export function SvAcknowledgementsPage({ show }: { show: CatalogueShowInfo }) {
  const sponsors = show.showSponsors ?? [];
  const namedSponsors = sponsors.filter((s) => s.name);
  const awardsLines = [
    'WUSV-GSDL-BRG Grading Cards for all classes',
    'Trophies for 1st place',
    'Medals for 2nd & 3rd place',
    'Junior Handling goody bags',
  ];

  return (
    <Page size="A5" style={PAGE_STYLE}>
      <TonalWash variant="inside" buffer={show.svWashes?.inside} />
      <Topper num={2} subject="Acknowledgements" />

      <View style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 10, color: SV.ink3 }}>
          A note before judging —
        </Text>
        <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 26, lineHeight: 1, marginTop: 2 }}>
          thank you.
        </Text>
      </View>

      {/* Event Manager */}
      {show.showManager ? (
        <View style={{ marginTop: 14 }}>
          <SectionTitle title="Event Manager" />
          <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 13, color: SV.ink }}>
            {show.showManager}
          </Text>
        </View>
      ) : null}

      {/* Awards on offer */}
      <View style={{ marginTop: 14 }}>
        <SectionTitle title="Awards on offer" />
        {awardsLines.map((l, i) => (
          <Text
            key={i}
            style={{ fontFamily: SV_FONTS.sans, fontSize: 9, color: SV.ink2, marginBottom: 1.5 }}
          >
            · {l}
          </Text>
        ))}
      </View>

      {/* Thank-you message */}
      <View style={{ marginTop: 14 }}>
        <SectionTitle title="With grateful thanks" />
        <Text
          style={{
            fontFamily: SV_FONTS.serif,
            fontStyle: 'italic',
            fontSize: 11,
            color: SV.accent,
            lineHeight: 1.4,
            marginBottom: 6,
          }}
        >
          Thank you to everyone who has supported this regional by sponsoring
          classes, taking out adverts, donating prizes or stepping up as a
          steward in the ring today.
        </Text>
        {namedSponsors.length > 0 ? (
          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink2, lineHeight: 1.45 }}>
            {namedSponsors.map((s) => s.name).join('  ·  ')}
          </Text>
        ) : null}
        <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink3, marginTop: 6, lineHeight: 1.45 }}>
          And to our hard-working committee behind the scenes, without whom none
          of this would be possible.
        </Text>
      </View>

      {/* Vet on call */}
      {show.onCallVet ? (
        <View style={{ marginTop: 14 }}>
          <SectionTitle title="On-call veterinary surgeon" />
          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink2, lineHeight: 1.45 }}>
            {show.onCallVet}
          </Text>
        </View>
      ) : null}

      <View style={{ position: 'absolute', bottom: '5mm', left: '11mm', right: '11mm', flexDirection: 'row', justifyContent: 'space-between' }} fixed>
        <Text style={ss.eyebrow}>Acknowledgements</Text>
        <Text style={[ss.eyebrow, { color: SV.ink3 }]}>02</Text>
      </View>
    </Page>
  );
}

// ── PAGE 3 — BREED CLASSIFICATION ────────────────────────────────────────

interface NumberedSvClass {
  number: number;
  age: string;
  sex: 'dog' | 'bitch';
  coats: ('a' | 'b')[];
}

/** Build the SV numbered classification (1–12 breed + 13/14 JH) from the
 *  show's allShowClasses list. Each numbered class collapses both coat
 *  types into one row with a / b sub-letters. */
function buildSvClassification(allShowClasses: ShowClassInfo[] | undefined): {
  breed: NumberedSvClass[];
  jh: { number: number; label: string }[];
} {
  if (!allShowClasses || allShowClasses.length === 0) return { breed: [], jh: [] };

  const ORDER = ['Minor Puppy', 'Puppy', 'Junior', 'Yearling', 'Adult', 'Working'];
  const stripPrefix = (name: string) => name.replace(/^SV\s+/, '');

  const buckets = new Map<
    string,
    { name: string; sex: 'dog' | 'bitch'; coats: Set<'a' | 'b'> }
  >();
  const jhRows: ShowClassInfo[] = [];

  for (const sc of allShowClasses) {
    const sex = sc.sex === 'dog' ? 'dog' : sc.sex === 'bitch' ? 'bitch' : null;
    const display = stripPrefix(sc.className);
    if (sc.classNumber === null && (sex === null || sc.className.toLowerCase().includes('junior handler'))) {
      jhRows.push(sc);
      continue;
    }
    if (display === 'Baby Puppy' || !sex) continue;
    const key = `${display}|${sex}`;
    const b = buckets.get(key) ?? { name: display, sex, coats: new Set<'a' | 'b'>() };
    // Coat letter inferred from classLabel suffix (e.g. "1a", "1b").
    const label = sc.classLabel ?? '';
    if (label.endsWith('a')) b.coats.add('a');
    else if (label.endsWith('b')) b.coats.add('b');
    else { b.coats.add('a'); b.coats.add('b'); }
    buckets.set(key, b);
  }

  const ordered = Array.from(buckets.values()).sort((a, b) => {
    const ai = ORDER.indexOf(a.name);
    const bi = ORDER.indexOf(b.name);
    if (ai !== bi) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.sex === 'bitch' ? -1 : 1;
  });

  const breed: NumberedSvClass[] = ordered.map((b, i) => ({
    number: i + 1,
    age: b.name,
    sex: b.sex,
    coats: [...b.coats].sort() as ('a' | 'b')[],
  }));

  // De-dup JH rows by class name.
  const seen = new Set<string>();
  const jh: { number: number; label: string }[] = [];
  for (const sc of jhRows) {
    if (seen.has(sc.className)) continue;
    seen.add(sc.className);
    jh.push({
      number: breed.length + jh.length + 1,
      label: sc.className.replace(/Junior Handler/i, 'Junior Handling'),
    });
  }
  return { breed, jh };
}

export function SvClassificationPage({ show }: { show: CatalogueShowInfo }) {
  const { breed, jh } = buildSvClassification(show.allShowClasses);
  // Pair classes [Bitch, Dog] for the 2-column layout.
  const pairs: NumberedSvClass[][] = [];
  for (let i = 0; i < breed.length; i += 2) pairs.push(breed.slice(i, i + 2));

  return (
    <Page size="A5" style={PAGE_STYLE}>
      <TonalWash variant="inside" buffer={show.svWashes?.inside} />
      <Topper num={3} subject="Breed classification" />

      <View style={{ marginTop: 12 }}>
        <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 10, color: SV.ink3 }}>
          The running order —
        </Text>
        <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 26, lineHeight: 1, marginTop: 2 }}>
          classification.
        </Text>
        <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink3, marginTop: 4, maxWidth: '85%' }}>
          Verbal critiques will be given after the judging of each class. Both
          coat types in each class present their individual stand at the same
          time, then separately in final movement judging.
        </Text>
      </View>

      <View style={{ marginTop: 10 }}>
        {pairs.map((pair, idx) => {
          const head = pair[0];
          if (!head) return null;
          return (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                paddingVertical: 3.5,
                borderTopWidth: idx === 0 ? 1 : 0.5,
                borderTopColor: idx === 0 ? SV.ink : SV.rule,
              }}
            >
              <View style={{ width: '28%', paddingRight: 6 }}>
                <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 12, color: SV.ink, lineHeight: 1.1 }}>
                  {head.age}
                </Text>
              </View>
              {[0, 1].map((slot) => {
                const c = pair[slot];
                return (
                  <View key={slot} style={{ width: '36%', flexDirection: 'row', gap: 6, paddingRight: 4 }}>
                    {c ? (
                      <>
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: SV.ink,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 9, color: SV.paper, lineHeight: 1 }}>
                            {c.number}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink, fontWeight: 'bold' }}>
                            {c.sex === 'bitch' ? 'Bitch' : 'Dog'}
                          </Text>
                          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 6.5, color: SV.ink3, marginTop: 1 }}>
                            <Text style={{ color: SV.accent, fontWeight: 'bold' }}>a</Text> Stock
                            {'   '}
                            <Text style={{ color: SV.accent, fontWeight: 'bold' }}>b</Text> Long Stock
                          </Text>
                        </View>
                      </>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })}
        {/* Junior handling */}
        {jh.length > 0 && (
          <View
            style={{
              marginTop: 8,
              padding: 8,
              backgroundColor: SV.accentSoft,
              flexDirection: 'row',
              flexWrap: 'wrap',
            }}
          >
            <Text style={[ss.eyebrow, { width: '100%', color: SV.accent, marginBottom: 4 }]}>
              Junior Handling · Judged during lunch
            </Text>
            {jh.map((c, i) => (
              <View key={i} style={{ width: '50%', flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 2 }}>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    backgroundColor: SV.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 10, color: '#fff', lineHeight: 1 }}>
                    {c.number}
                  </Text>
                </View>
                <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink, fontWeight: 'bold' }}>
                  {c.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Time schedule + identification note */}
      <View style={{ marginTop: 12 }}>
        <SectionTitle title="Time schedule" />
        <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 9, color: SV.ink2, lineHeight: 1.5 }}>
          Show ground open to exhibitors and visitors at{' '}
          <Text style={{ fontWeight: 'bold' }}>{show.showOpenTime ?? '09:00'}</Text>.{'\n'}
          All dogs <Text style={{ fontWeight: 'bold' }}>must be identifiable by microchip</Text>.{'\n'}
          Identification checks will take place in the ring at the start of each class.{'\n'}
          Judging starts at <Text style={{ fontWeight: 'bold' }}>{show.startTime ?? '10:00'}</Text> sharp.
        </Text>
      </View>

      <View style={{ position: 'absolute', bottom: '5mm', left: '11mm', right: '11mm', flexDirection: 'row', justifyContent: 'space-between' }} fixed>
        <Text style={ss.eyebrow}>Breed classification</Text>
        <Text style={[ss.eyebrow, { color: SV.ink3 }]}>03</Text>
      </View>
    </Page>
  );
}

// ── PAGE 4 — JUDGES BIOS ─────────────────────────────────────────────────

export function SvJudgesPage({ show }: { show: CatalogueShowInfo }) {
  // judgesByBreedName is the canonical "{breed} → judge name" map. We
  // unique-fy across that + judgeDisplayList to get the cover judges.
  const judgeNames = [
    ...new Set([
      ...(show.judgeDisplayList ?? []).map((s) => s.replace(/^.*—\s*/, '').trim()),
      ...Object.values(show.judgesByBreedName ?? {}),
    ]),
  ];
  const bios = show.judgeBios ?? {};

  return (
    <Page size="A5" style={PAGE_STYLE}>
      <TonalWash variant="inside" buffer={show.svWashes?.inside} />
      <Topper num={4} subject="Judges" />

      <View style={{ marginTop: 12 }}>
        <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 10, color: SV.ink3 }}>
          A warm welcome to —
        </Text>
        <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 24, lineHeight: 1, marginTop: 2 }}>
          our esteemed judges.
        </Text>
      </View>

      <View style={{ marginTop: 14 }}>
        {judgeNames.map((name, i) => {
          const bio = bios[name];
          return (
            <View
              key={`${name}-${i}`}
              style={{
                paddingVertical: 8,
                borderTopWidth: i === 0 ? 1 : 0.5,
                borderTopColor: i === 0 ? SV.ink : SV.rule,
              }}
              wrap={false}
            >
              <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 14, color: SV.ink }}>
                {name}
              </Text>
              {bio ? (
                <Text
                  style={{
                    fontFamily: SV_FONTS.sans,
                    fontSize: 8.5,
                    color: SV.ink2,
                    lineHeight: 1.5,
                    marginTop: 3,
                  }}
                >
                  {bio}
                </Text>
              ) : (
                <Text
                  style={{
                    fontFamily: SV_FONTS.serif,
                    fontStyle: 'italic',
                    fontSize: 8,
                    color: SV.ink3,
                    marginTop: 3,
                  }}
                >
                  Biography to follow.
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <View style={{ position: 'absolute', bottom: '5mm', left: '11mm', right: '11mm', flexDirection: 'row', justifyContent: 'space-between' }} fixed>
        <Text style={ss.eyebrow}>Judges</Text>
        <Text style={[ss.eyebrow, { color: SV.ink3 }]}>04</Text>
      </View>
    </Page>
  );
}

// ── PAGE 5 — BRG POINTS SYSTEM ───────────────────────────────────────────

export function SvPointsPage({ show }: { show: CatalogueShowInfo }) {
  const points: { label: string; value: string }[] = [
    { label: 'VV1 (VP1)', value: '1 point' },
    { label: 'SG1', value: '2 points' },
    { label: 'SG1 adult', value: '4 points' },
    { label: 'SG2', value: '1 point' },
    { label: 'SG2 adult', value: '2 points' },
    { label: 'V1 working', value: '5 points' },
    { label: 'V2 working', value: '4 points' },
    { label: 'VA working', value: '10 points' },
  ];

  return (
    <Page size="A5" style={PAGE_STYLE}>
      <TonalWash variant="inside" buffer={show.svWashes?.inside} />
      <Topper num={5} subject="BRG points system" />

      <View style={{ marginTop: 12 }}>
        <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 10, color: SV.ink3 }}>
          How awards are decided —
        </Text>
        <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 22, lineHeight: 1, marginTop: 2 }}>
          the points system.
        </Text>
        <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink2, lineHeight: 1.5, marginTop: 6, maxWidth: '92%' }}>
          The British Gold Medal recognises exhibits which have achieved
          outstanding show results over their lifetime at Regional events
          and the British Sieger. Points are awarded on the following basis:
        </Text>
      </View>

      <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap' }}>
        {points.map((p, i) => (
          <View
            key={i}
            style={{
              width: '50%',
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 3,
              paddingRight: i % 2 === 0 ? 10 : 0,
              paddingLeft: i % 2 === 1 ? 10 : 0,
              borderBottomWidth: 0.5,
              borderBottomColor: SV.rule,
            }}
          >
            <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 9, color: SV.ink, fontWeight: 'bold' }}>
              {p.label}
            </Text>
            <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', fontSize: 9, color: SV.accent }}>
              {p.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={[ss.panelInk, { marginTop: 14 }]}>
        <Text style={ss.panelInkEyebrow}>British Gold Medal — 25 points</Text>
        <Text style={ss.panelInkBody}>
          An exhibit awarded 25 points across its career receives the BRG
          Gold Medal. The points must include at least <Text style={{ fontWeight: 'bold' }}>5 points
          gained in the Adult or Working class</Text>, and at least one Adult
          SG1 at a regional with a minimum of 3 exhibits present.
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <SectionTitle title="Annual Awards" />
        <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink2, lineHeight: 1.5 }}>
          Each year a list of the top exhibits is declared in the categories
          Male, Female, Long Coat Male and Long Coat Female. All exhibits
          twelve months or older by 31 December are included in the Annual
          Points Award Scheme. Health-test results must be on file by{' '}
          <Text style={{ fontWeight: 'bold' }}>1 February</Text> the following
          year for the placements to be confirmed.
        </Text>
      </View>

      <View style={{ position: 'absolute', bottom: '5mm', left: '11mm', right: '11mm', flexDirection: 'row', justifyContent: 'space-between' }} fixed>
        <Text style={ss.eyebrow}>Points system</Text>
        <Text style={[ss.eyebrow, { color: SV.ink3 }]}>05</Text>
      </View>
    </Page>
  );
}
