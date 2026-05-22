/**
 * SV / WUSV Regional Show schedule renderer — "Sieger Editorial" port.
 *
 * Six-page A5 schedule for WUSV-ruleset shows (GSDL-BRG and equivalent).
 * Ported from the design brief at `sv-schedule/HANDOFF.md`:
 *
 *   1. Cover            — host club, date, venue, breed judge, secretary
 *   2. At a glance      — fees · key dates · secretary · vet · awards · pull-quote
 *   3. Classification   — numbered 1–12 (breed) + 13/14 (JH), Bitch-before-Dog
 *   4. Eligibility      — definition table + health threshold panel + notes
 *   5. Grading          — SV grading scale (over-12 + under-12)
 *   6. Regulations      — 16-point WUSV/BRG rules summary, two columns
 *
 * Adverts (inside-front / inside-back / last-page) slot in via the existing
 * `AdvertPage` helper, same as the RKC renderer.
 */
import {
  Document,
  Page,
  Text,
  View,
  Svg,
  Path,
  Image,
} from '@react-pdf/renderer';
import type {
  ScheduleShowInfo,
  ScheduleClass,
  ScheduleJudge,
  ScheduleSponsor,
  ScheduleAdvert,
} from './shared/types';
import { groupSvClasses, type SvNumberedClass } from './shared/sv-classification';
import { ss, SV, SV_FONTS } from './shared/sv-styles';
import { AdvertPage, selectAdverts } from './shared/advert-page';
import {
  SV_CLASS_DEFINITIONS,
  SV_AGE_LABELS,
} from '@/lib/sv-class-definitions';
import {
  SV_GRADING_OVER_TWELVE,
  SV_GRADING_UNDER_TWELVE,
  type SvGrade,
} from '@/lib/sv-grading';
import { SV_RULES } from '@/lib/sv-rules';

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // Slice to the date portion for "YYYY-MM-DDTHH:..." inputs, then anchor at
  // noon UTC so we don't get a TZ-driven previous-day in en-GB.
  const datePart = iso.slice(0, 10);
  const d = new Date(`${datePart}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Shorter form for the right-column "Key dates" list — "Sun 31 May 2026". The
 *  full long-form fmtDate runs into the label when stacked at 50% page width
 *  (Amanda 2026-05-22). */
function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const datePart = iso.slice(0, 10);
  const d = new Date(`${datePart}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtMoney(pence: number | null | undefined): string {
  if (pence == null) return '—';
  return '£' + (pence / 100).toFixed(pence % 100 === 0 ? 0 : 2);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Pull a single breed judge for the cover. WUSV regionals have one breed
// judge (Classes 1–12); we prefer the judge with the broadest sex coverage,
// falling back to the first non-JH judge.
function pickBreedJudge(judges: readonly ScheduleJudge[]): ScheduleJudge | null {
  if (judges.length === 0) return null;
  const nonJh = judges.filter((j) => j.role !== 'Junior Handling');
  return nonJh[0] ?? judges[0] ?? null;
}

// ── Atoms ──────────────────────────────────────────────────────────────────

/**
 * Soft watercolour-style corner accent — pink/magenta/blue/purple gradient
 * brush stroke. Renders absolutely positioned, so it sits behind page
 * content. Amanda (2026-05-22): "splash of colour on each page similar to
 * the BRG banner — light touch, just on the corners". Alternates corners
 * by page index so the document feels alive without being busy.
 */
function CornerSplash({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  // A swoosh modelled on the BRG marketing banner — a wide, flat single
  // arc with several parallel brush strokes in pinks, lavender and blue,
  // each tapered with `strokeLinecap: round` so the wash fades at the
  // ends rather than ending abruptly. Anchored to a page corner and
  // bleeding off the edge so it reads as a gesture, not a centrepiece.
  // Amanda 2026-05-22: "do a swoosh like the banner photo, just in the
  // corner".
  const w = '95mm';
  const h = '30mm';
  const pos =
    corner === 'tl'
      ? { top: 0, left: 0 }
      : corner === 'tr'
        ? { top: 0, right: 0 }
        : corner === 'bl'
          ? { bottom: 0, left: 0 }
          : { bottom: 0, right: 0 };

  // Each path is a single Q-curve (no S-curve, no T-continuation) — a
  // simple flat arc. The 5 strokes sit at slightly different heights /
  // widths and overlap, blending into the multi-tone wash seen in the
  // BRG banner. Opacities stay low so text overlay reads cleanly.
  const strokes = [
    { d: 'M -5 70 Q 50 5 105 50',  c: '#F4A5C0', w: 18, o: 0.32 }, // pink — widest, lowest
    { d: 'M -5 62 Q 50 0 105 45',  c: '#B89AD0', w: 14, o: 0.32 }, // lavender — middle band
    { d: 'M -5 78 Q 50 18 105 58', c: '#7FA8D8', w: 12, o: 0.28 }, // soft blue — under-stroke
    { d: 'M -5 58 Q 50 -4 105 42', c: '#E8638F', w: 5,  o: 0.5 },  // magenta — thin accent
    { d: 'M -5 56 Q 50 -5 105 41', c: '#D4537A', w: 2,  o: 0.6 },  // red — thinnest highlight
  ];

  return (
    <View
      style={{
        position: 'absolute',
        width: w,
        height: h,
        ...pos,
      }}
      fixed
    >
      <Svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        {strokes.map((s, i) => (
          <Path
            key={i}
            d={s.d}
            stroke={s.c}
            strokeWidth={s.w}
            strokeLinecap="round"
            strokeOpacity={s.o}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

function Folio({ num, total = 6, label }: { num: number; total?: number; label: string }) {
  return (
    <View style={ss.folio} fixed>
      <Text style={ss.eyebrow}>{label}</Text>
      <Text style={[ss.eyebrow, { color: SV.ink3 }]}>
        {pad2(num)}  /  {pad2(total)}
      </Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={ss.sectionHeader}>
      <Text style={ss.sectionHeaderText}>{title}</Text>
      <View style={ss.sectionHeaderRule} />
    </View>
  );
}

function FeeRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={ss.feeRow}>
      <Text style={ss.feeRowLabel}>{label}</Text>
      <Text style={ss.feeRowValue}>{value}</Text>
    </View>
  );
}

function Topper({ num, subject }: { num: number; subject: string }) {
  return (
    <>
      <View style={ss.topper}>
        <Text style={ss.eyebrow}>№ {pad2(num)}</Text>
        <Text style={ss.eyebrow}>{subject}</Text>
      </View>
      <View style={[ss.ruleThin, { marginTop: 4 }]} />
    </>
  );
}

// ── PAGE 1 — COVER ─────────────────────────────────────────────────────────

function SvCover({
  show,
  judges,
  rkcClassCount,
}: {
  show: ScheduleShowInfo;
  judges: readonly ScheduleJudge[];
  /** Count of actual classes running — long coat + short coat each count
   *  separately per RKC convention. e.g. a 12-age × 2-coat SV regional
   *  shows "24-Class" rather than the 12 numbered groupings. JH is
   *  listed separately and isn't included in this total. */
  rkcClassCount: number;
}) {
  const judge = pickBreedJudge(judges);
  const judgeAffix = judge?.affix ? ` (${judge.affix})` : '';
  // Affiliation line — Amanda (2026-05-21) confirmed every BRG club uses its
  // own name (Midland Regional GSD Group, Scottish Progressive, National
  // Long Coat etc.) all under the GSDL-British Regional Group banner.
  const affiliation = 'Under the banner of GSDL — British Regional Group';
  const clubLogo = show.organisation?.logoUrl ?? null;

  return (
    <Page size="A5" style={ss.page}>
      <CornerSplash corner="tr" />
      {/* Top strip — jurisdiction line + licence number */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={ss.eyebrow}>Held under WUSV Rules</Text>
          <Text style={[ss.eyebrow, { marginTop: 1 }]}>GSDL · British Regional Group</Text>
        </View>
        {show.kcLicenceNo ? (
          <Text style={ss.eyebrow}>№ {show.kcLicenceNo}</Text>
        ) : null}
      </View>

      {/* Hero — club name dominant, "Regional Schedule" smaller with logo
          beside it (Amanda 2026-05-22). */}
      <View style={{ marginTop: 22 }}>
        <Text style={[ss.displayIt, { fontSize: 14, color: SV.ink2, marginBottom: 4 }]}>
          A {rkcClassCount}-Class
        </Text>
        <Text style={[ss.display, { fontSize: 30, lineHeight: 1.02, marginBottom: 2 }]}>
          {show.organisation?.name ?? ''}
        </Text>
        <Text style={[ss.bodySmall, { marginTop: 2, marginBottom: 10 }]}>{affiliation}</Text>

        {/* "Regional Schedule" + club logo, side-by-side */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ flexShrink: 1, paddingRight: 8 }}>
            <Text style={[ss.display, { fontSize: 26, lineHeight: 1, color: SV.ink }]}>
              Regional
            </Text>
            <Text style={[ss.displayIt, { fontSize: 22, lineHeight: 1, color: SV.accent, marginTop: 2 }]}>
              Schedule
            </Text>
          </View>
          {clubLogo ? (
            <Image
              src={clubLogo}
              style={{ width: 110, height: 110, objectFit: 'contain' }}
            />
          ) : null}
        </View>

        <View style={ss.rule} />
      </View>

      {/* Detail grid — Host Club cell is gone because the club name is now
          the hero headline. Date / Venue / Breed Judge stack 2-up. */}
      <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap' }}>
        {/* Date */}
        <View style={{ width: '50%', paddingRight: 8, marginBottom: 14 }}>
          <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Date</Text>
          <Text style={[ss.display, { fontSize: 14, lineHeight: 1.15 }]}>
            {fmtDate(show.date)}
          </Text>
          <Text style={[ss.bodySmall, { marginTop: 2 }]}>
            {show.showOpenTime ? `Grounds open ${show.showOpenTime}` : ''}
            {show.showOpenTime && show.startTime ? ' · ' : ''}
            {show.startTime ? `Judging from ${show.startTime}` : ''}
          </Text>
        </View>
        {/* Venue */}
        <View style={{ width: '50%', paddingLeft: 8, marginBottom: 14 }}>
          <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Venue</Text>
          <Text style={[ss.display, { fontSize: 13, lineHeight: 1.15 }]}>
            {show.venue?.name ?? ''}
          </Text>
          <Text style={[ss.bodySmall, { marginTop: 2 }]}>
            {[show.venue?.address, show.venue?.postcode].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {/* Breed Judge */}
        <View style={{ width: '50%', paddingRight: 8, marginBottom: 14 }}>
          <Text style={[ss.eyebrow, { marginBottom: 3 }]}>Breed Judge</Text>
          <Text style={[ss.display, { fontSize: 13, lineHeight: 1.15 }]}>
            {judge ? judge.name : 'Judge TBC'}
          </Text>
          {judgeAffix ? (
            <Text style={[ss.bodySmall, { marginTop: 2 }]}>{judgeAffix.trim().replace(/^\(|\)$/g, '')}</Text>
          ) : null}
        </View>
      </View>

      {/* Bottom strip — Entries close · Event Secretary */}
      <View style={[ss.rule, { marginTop: 4, marginBottom: 8 }]} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ maxWidth: '55%' }}>
          <Text style={[ss.eyebrow, { marginBottom: 2 }]}>Entries close</Text>
          <Text style={[ss.display, { fontSize: 11 }]}>{fmtDate(show.entryCloseDate)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '45%' }}>
          <Text style={[ss.eyebrow, { marginBottom: 2 }]}>Event Secretary</Text>
          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 9, color: SV.ink }}>
            {show.secretaryName ?? '—'}
          </Text>
          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 7.5, color: SV.ink3, marginTop: 1 }}>
            {[show.secretaryEmail, show.secretaryPhone].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      <Folio num={1} label="Cover" />
    </Page>
  );
}

// ── PAGE 2 — AT A GLANCE ───────────────────────────────────────────────────

function SvOverview({ show }: { show: ScheduleShowInfo }) {
  const memberTier = show.discountGroups?.[0] ?? null;
  const firstAider = show.scheduleData?.firstAiders?.[0] ?? null;

  return (
    <Page size="A5" style={ss.page}>
      <CornerSplash corner="bl" />
      <Topper num={2} subject={show.name} />

      <View style={{ marginTop: 14 }}>
        <Text style={[ss.displayIt, { fontSize: 10, color: SV.ink3 }]}>At a glance —</Text>
        <Text style={[ss.display, { fontSize: 28, lineHeight: 1, marginTop: 2 }]}>the essentials.</Text>
      </View>

      {/* Two-column body */}
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        {/* LEFT */}
        <View style={{ width: '50%', paddingRight: 10 }}>
          <SectionTitle title="Fees" />
          <FeeRow label="Per dog · per class" value={fmtMoney(show.firstEntryFee)} />
          {memberTier ? (
            <FeeRow
              label={memberTier.label}
              value={fmtMoney(memberTier.firstEntryFeePence)}
            />
          ) : null}
          {show.multiDogPackagePence != null ? (
            <FeeRow
              label={`${show.multiDogThreshold ?? 3}+ dogs · multi-dog`}
              value={fmtMoney(show.multiDogPackagePence)}
            />
          ) : null}
          {memberTier?.multiDogPackagePence != null ? (
            <FeeRow
              label="Members · multi-dog"
              value={fmtMoney(memberTier.multiDogPackagePence)}
            />
          ) : null}
          <FeeRow
            label="Junior Handling"
            value={!show.juniorHandlerFee ? 'Free' : fmtMoney(show.juniorHandlerFee)}
          />
          {/* Catalogue prices — static fallback per HANDOFF decision-needed. */}
          <FeeRow label="Catalogue (pre-paid)" value="£5.00" />
          <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 7.5, color: SV.ink3, marginTop: 5, fontStyle: 'italic' }}>
            Multi-dog: exhibits must share at least 50% common ownership.
          </Text>

          <View style={{ height: 7 }} />
          <SectionTitle title="Awards" />
          {/* Amanda 2026-05-22: drop per-class derivation. Two big awards
              groups split by sex, with plain-English eligibility lines. */}
          {[
            { name: 'Most Promising Young Bitch', desc: 'All winners up to and including Junior classes' },
            { name: 'Most Promising Young Dog',   desc: 'All winners up to and including Junior classes' },
            { name: 'Best Bitch',                 desc: 'All winners from Yearling to Working classes' },
            { name: 'Best Dog',                   desc: 'All winners from Yearling to Working classes' },
          ].map((a, i, arr) => (
            <View
              key={a.name}
              style={{
                paddingVertical: 4,
                borderBottomWidth: i < arr.length - 1 ? 0.5 : 0,
                borderBottomColor: SV.rule,
              }}
            >
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink, fontWeight: 'bold' }}>
                {a.name}
              </Text>
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 7.5, color: SV.ink3, marginTop: 1 }}>
                {a.desc}
              </Text>
            </View>
          ))}
          <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 7.5, color: SV.ink3, marginTop: 4, fontStyle: 'italic' }}>
            Trophies for 1st · Medals 1st–3rd · GSDL-BRG Grading Cards for all classes.
          </Text>
        </View>

        {/* RIGHT */}
        <View style={{ width: '50%', paddingLeft: 10 }}>
          <SectionTitle title="Key dates" />
          {/* Short date format here so long weekday + month names don't
              overrun the label column (Amanda 2026-05-22). */}
          <FeeRow label="Entries open" value={fmtDateShort(show.entriesOpenDate)} />
          {show.acceptsPostalEntries && show.postalCloseDate ? (
            <FeeRow label="Postal close" value={fmtDateShort(show.postalCloseDate)} />
          ) : null}
          <FeeRow label="Entries close" value={fmtDateShort(show.entryCloseDate)} />
          <FeeRow label="Show day" value={fmtDateShort(show.date)} />

          <View style={{ height: 7 }} />
          <SectionTitle title="Event Secretary" />
          <View>
            <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 9, fontWeight: 'bold', color: SV.ink }}>
              {show.secretaryName ?? '—'}
            </Text>
            {show.secretaryAddress ? (
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink3, marginTop: 2, lineHeight: 1.35 }}>
                {show.secretaryAddress}
              </Text>
            ) : null}
            {show.secretaryEmail ? (
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 7.5, color: SV.ink2, marginTop: 3 }}>
                {show.secretaryEmail}
              </Text>
            ) : null}
            {show.secretaryPhone ? (
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 7.5, color: SV.ink2 }}>
                {show.secretaryPhone}
              </Text>
            ) : null}
          </View>

          {show.onCallVet ? (
            <>
              <View style={{ height: 7 }} />
              <SectionTitle title="On-call vet" />
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink2, lineHeight: 1.4 }}>
                {show.onCallVet}
              </Text>
            </>
          ) : null}

          {firstAider ? (
            <>
              <View style={{ height: 7 }} />
              <SectionTitle title="First Aider" />
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink2 }}>
                {firstAider}
              </Text>
            </>
          ) : null}

          <View style={{ height: 7 }} />
          <SectionTitle title="Payment" />
          {/* Amanda 2026-05-22: only surface the postal/bank-transfer line
              when the show actually accepts postal entries — otherwise just
              say online via Remi. */}
          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink2, lineHeight: 1.45 }}>
            {show.acceptsPostalEntries
              ? 'Paid by Remi at entry. Bank transfer accepted for postal entries — surname as reference. No entries by phone, text or social media.'
              : 'Online payment only via Remi at entry. No entries by phone, text, post or social media.'}
          </Text>
        </View>
      </View>

      {/* Pull quote */}
      <View style={{ marginTop: 8 }}>
        <View style={ss.ruleThin} />
        <Text style={[ss.pullQuote, { fontSize: 10, marginTop: 5, lineHeight: 1.25 }]}>
          &ldquo;Verbal critiques will be given after the judging of each class — both coat types presented at the same stand, then separately in final movement.&rdquo;
        </Text>
      </View>

      <Folio num={2} label="At a glance" />
    </Page>
  );
}

// ── PAGE 3 — BREED CLASSIFICATION ──────────────────────────────────────────

function ClassNumberCircle({ n, accent }: { n: number; accent?: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: accent ? SV.accent : SV.ink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 11, color: SV.paper, lineHeight: 1 }}>{n}</Text>
    </View>
  );
}

function SvClassificationPage({
  breedClasses,
  juniorHandling,
  juniorHandlingJudge,
}: {
  breedClasses: SvNumberedClass[];
  juniorHandling: Array<{ number: number; label: string }>;
  juniorHandlingJudge: string | null;
}) {
  // Pair breed classes [Bitch, Dog] by age — grouping is already in canonical
  // order (Minor Puppy → Working, bitch first).
  const pairs: SvNumberedClass[][] = [];
  for (let i = 0; i < breedClasses.length; i += 2) {
    pairs.push(breedClasses.slice(i, i + 2));
  }

  return (
    <Page size="A5" style={ss.page}>
      <CornerSplash corner="tr" />
      <Topper num={3} subject={`Classes 1 – ${breedClasses.length + juniorHandling.length}`} />

      <View style={{ marginTop: 10 }}>
        <Text style={[ss.displayIt, { fontSize: 10, color: SV.ink3 }]}>Breed —</Text>
        <Text style={[ss.display, { fontSize: 22, lineHeight: 1, marginTop: 2 }]}>Classification</Text>
        <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink3, marginTop: 3, maxWidth: '85%' }}>
          Both coat types in each class will be presented for their individual stand at the same time, then separately in final movement judging.
        </Text>
      </View>

      <View style={{ marginTop: 8 }}>
        {pairs.map((pair, idx) => {
          const head = pair[0];
          if (!head) return null;
          const ageLabel = SV_AGE_LABELS[head.name];
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
              {/* Age column */}
              <View style={{ width: '28%', paddingRight: 6 }}>
                <Text style={[ss.display, { fontSize: 13, lineHeight: 1.1 }]}>{head.name}</Text>
                {ageLabel?.german ? (
                  <Text style={[ss.displayIt, { fontSize: 8.5, color: SV.accent, marginTop: 1 }]}>
                    {ageLabel.german}
                  </Text>
                ) : null}
                {ageLabel?.ageRange ? (
                  <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 7, color: SV.ink3, marginTop: 1 }}>
                    {ageLabel.ageRange}
                  </Text>
                ) : null}
              </View>
              {/* Two sex columns */}
              {[0, 1].map((slot) => {
                const c = pair[slot];
                return (
                  <View key={slot} style={{ width: '36%', flexDirection: 'row', gap: 6, paddingRight: 4 }}>
                    {c ? (
                      <>
                        <ClassNumberCircle n={c.number} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 9, color: SV.ink, fontWeight: 'bold' }}>
                            {c.sex === 'bitch' ? 'Bitch' : 'Dog'}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                            <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 7, color: SV.ink3 }}>
                              <Text style={{ color: SV.accent, fontWeight: 'bold' }}>a</Text> Stock
                            </Text>
                            <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 7, color: SV.ink3 }}>
                              <Text style={{ color: SV.accent, fontWeight: 'bold' }}>b</Text> Long Stock
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Junior Handling band */}
        {juniorHandling.length > 0 ? (
          <View
            style={{
              marginTop: 6,
              padding: 8,
              backgroundColor: SV.accentSoft,
            }}
          >
            <Text style={[ss.eyebrow, { color: SV.accent, marginBottom: 4 }]}>
              Junior Handling · Judged during lunch
              {juniorHandlingJudge ? ` · ${juniorHandlingJudge}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {juniorHandling.map((jh, i) => (
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
                      {jh.number}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink, fontWeight: 'bold' }}>
                      {jh.label}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Footer note */}
      <View style={{ marginTop: 8 }}>
        <View style={ss.ruleThin} />
        <Text style={[ss.displayIt, { fontSize: 9, color: SV.ink2, marginTop: 3 }]}>
          Most Promising Young Dog / Bitch judged from winners of Cl. 1 – 6.
          Regional Sieger &amp; Siegerin from winners of Cl. 9 – 12.
        </Text>
      </View>

      <Folio num={3} label="Breed classification" />
    </Page>
  );
}

// ── PAGE 4 — DEFINITIONS & ELIGIBILITY ─────────────────────────────────────

function SvEligibilityPage() {
  return (
    <Page size="A5" style={ss.page}>
      <CornerSplash corner="bl" />
      <Topper num={4} subject="Class definitions & eligibility" />

      <View style={{ marginTop: 14 }}>
        <Text style={[ss.displayIt, { fontSize: 10, color: SV.ink3 }]}>Who can enter —</Text>
        <Text style={[ss.display, { fontSize: 24, lineHeight: 1, marginTop: 2 }]}>eligibility, age, health.</Text>
      </View>

      <View style={{ marginTop: 14 }}>
        {SV_CLASS_DEFINITIONS.map((r, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              paddingVertical: 5,
              borderTopWidth: 0.5,
              borderTopColor: SV.rule,
              opacity: r.excluded ? 0.45 : 1,
            }}
          >
            <View style={{ width: '28%', paddingRight: 6 }}>
              <Text style={[ss.display, { fontSize: 11, lineHeight: 1.15 }]}>{r.code}</Text>
              {r.excluded ? (
                <Text style={[ss.eyebrow, { color: SV.accent, marginTop: 1 }]}>Not numbered</Text>
              ) : null}
            </View>
            <View style={{ width: '22%', paddingRight: 6 }}>
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink2 }}>{r.age}</Text>
            </View>
            <View style={{ width: '50%' }}>
              <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink2, lineHeight: 1.4 }}>
                {r.reqs}
              </Text>
            </View>
          </View>
        ))}
        <View style={{ borderTopWidth: 0.5, borderTopColor: SV.rule }} />
      </View>

      {/* Health threshold panel — dark inverse block */}
      <View style={[ss.panelInk, { marginTop: 14 }]}>
        <Text style={ss.panelInkEyebrow}>Health threshold for entry</Text>
        <Text style={ss.panelInkBody}>
          Hip scores: <Text style={{ fontWeight: 'bold' }}>BVA/ANKC ≤ 20</Text> with no more than 12 on either side, or SV &lsquo;a&rsquo;-stamp.
          Elbow scores: <Text style={{ fontWeight: 'bold' }}>BVA/ANKC 0 or 1</Text>, or SV &lsquo;a&rsquo;-stamp. Exhibits outside this range are not eligible to compete.
          DNA recording is mandatory from Yearling upwards — <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic' }}>parentage proven</Text> is recommended.
        </Text>
      </View>

      {/* Two-column footer — Long Coat / Age */}
      <View style={{ marginTop: 14, flexDirection: 'row' }}>
        <View style={{ width: '50%', paddingRight: 8 }}>
          <Text style={[ss.display, { fontSize: 11, marginBottom: 3 }]}>Long Coat class</Text>
          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink2, lineHeight: 1.45 }}>
            Open to dogs whose long coat shows a present <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'italic' }}>undercoat</Text>.
            All age, health, and Koerung requirements above apply equally.
          </Text>
        </View>
        <View style={{ width: '50%', paddingLeft: 8 }}>
          <Text style={[ss.display, { fontSize: 11, marginBottom: 3 }]}>Age — how it&apos;s calculated</Text>
          <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink2, lineHeight: 1.45 }}>
            The first day of the show is the reference. A dog reaching the upper limit of its class on show day moves to the next class.
          </Text>
        </View>
      </View>

      <Folio num={4} label="Definitions" />
    </Page>
  );
}

// ── PAGE 5 — GRADING ───────────────────────────────────────────────────────

function GradingCol({ title, rows, accentFirst }: { title: string; rows: SvGrade[]; accentFirst?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[ss.eyebrow, { marginBottom: 5 }]}>{title}</Text>
      {rows.map((g, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            paddingVertical: 2.5,
            borderTopWidth: 0.5,
            borderTopColor: SV.rule,
          }}
        >
          <View style={{ width: 28 }}>
            <Text
              style={[
                ss.display,
                { fontSize: 16, lineHeight: 1, color: accentFirst && i === 0 ? SV.accent : SV.ink },
              ]}
            >
              {g.code}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, fontWeight: 'bold', color: SV.ink }}>
              {g.english}
            </Text>
            <Text style={[ss.displayIt, { fontSize: 7.5, color: SV.ink3 }]}>{g.german}</Text>
            {g.note ? (
              <Text style={{ fontFamily: SV_FONTS.serif, fontSize: 6.5, color: SV.ink3, marginTop: 1, fontStyle: 'italic' }}>
                {g.note}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function SvGradingPage() {
  return (
    <Page size="A5" style={ss.page}>
      <CornerSplash corner="tr" />
      <Topper num={5} subject="SV grading system" />

      <View style={{ marginTop: 10 }}>
        <Text style={[ss.displayIt, { fontSize: 10, color: SV.ink3 }]}>Every dog graded —</Text>
        <Text style={[ss.display, { fontSize: 24, lineHeight: 1 }]}>the SV system.</Text>
        <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8.5, color: SV.ink2, lineHeight: 1.45, marginTop: 5, maxWidth: '92%' }}>
          At an SV regional, each exhibit is awarded a grade against the breed standard alongside its
          placement. Grades earned here are recognised by the SV and WUSV worldwide and count towards
          SV Ausland. <Text style={{ color: SV.accent }}>A grade of G or above from an SV judge fulfils the show-grade requirement of the Koerung (breed survey).</Text>
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
        <GradingCol title="Over 12 months" rows={SV_GRADING_OVER_TWELVE} accentFirst />
        <GradingCol title="Under 12 months" rows={SV_GRADING_UNDER_TWELVE} />
      </View>

      <View style={[ss.panelInk, { marginTop: 10, paddingVertical: 8 }]}>
        <Text style={ss.panelInkEyebrow}>Regional titles awarded</Text>
        <Text style={[ss.displayIt, { fontSize: 12, color: SV.paperOnInk, lineHeight: 1.3 }]}>
          Winners of their respective classes may use the titles{' '}
          <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'normal', color: SV.accentSoft }}>Regional Sieger</Text>
          {' & '}
          <Text style={{ fontFamily: SV_FONTS.serif, fontStyle: 'normal', color: SV.accentSoft }}>Regional Siegerin</Text>.
        </Text>
      </View>

      <Folio num={5} label="Grading" />
    </Page>
  );
}

// ── PAGE 6 — REGULATIONS ───────────────────────────────────────────────────

function SvRulesPage() {
  // Split rules into two columns by halving — React-PDF doesn't support CSS
  // multi-column flow, so we lay out two flex columns and split the list.
  const mid = Math.ceil(SV_RULES.length / 2);
  const left = SV_RULES.slice(0, mid);
  const right = SV_RULES.slice(mid);

  const ruleRow = (text: string, n: number) => (
    <View key={n} style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
      <Text style={[ss.displayIt, { fontSize: 11, color: SV.accent, width: 16, lineHeight: 1 }]}>
        {pad2(n)}
      </Text>
      <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink2, lineHeight: 1.45, flex: 1 }}>
        {text}
      </Text>
    </View>
  );

  return (
    <Page size="A5" style={ss.page}>
      <CornerSplash corner="bl" />
      <Topper num={6} subject="Summary of WUSV / BRG rules" />

      <View style={{ marginTop: 14 }}>
        <Text style={[ss.displayIt, { fontSize: 10, color: SV.ink3 }]}>Event regulations —</Text>
        <Text style={[ss.display, { fontSize: 26, lineHeight: 1 }]}>the small print.</Text>
        <Text style={{ fontFamily: SV_FONTS.sans, fontSize: 8, color: SV.ink3, lineHeight: 1.45, marginTop: 4, maxWidth: '92%' }}>
          A summary of the GSDL-BRG regulations governing this regional event, based on the rules of the
          Verein für Deutsche Schäferhunde.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
        <View style={{ flex: 1 }}>{left.map((r, i) => ruleRow(r, i + 1))}</View>
        <View style={{ flex: 1 }}>{right.map((r, i) => ruleRow(r, mid + i + 1))}</View>
      </View>

      <Folio num={6} label="Regulations" />
    </Page>
  );
}

// ── Top-level document ─────────────────────────────────────────────────────

export function SvShowSchedule({
  show,
  classes,
  judges,
  adverts = [],
}: {
  show: ScheduleShowInfo;
  classes: ScheduleClass[];
  judges: ScheduleJudge[];
  sponsors?: ScheduleSponsor[];
  adverts?: ScheduleAdvert[];
  panelJudges?: unknown;
}) {
  const groups = groupSvClasses(classes);
  // Total numbered classes (breed + JH) — used by the page 3 header.
  const totalClasses = groups.totalCount;
  // RKC convention: each coat counts as its own class. A 12-age × 2-coat
  // SV regional therefore renders as "24-Class" on the cover, not 12 or
  // 14 (Amanda 2026-05-22).
  const rkcClassCount = groups.breedClasses.reduce(
    (n, c) => n + c.coatRows.length,
    0,
  );
  // Awards copy is static (Amanda 2026-05-22) — see SvOverview.

  // Junior Handling judge label, if one is assigned.
  const jhJudge = judges.find((j) => j.role === 'Junior Handling') ?? null;
  const jhJudgeLabel = jhJudge
    ? jhJudge.affix
      ? `${jhJudge.name} (${jhJudge.affix})`
      : jhJudge.name
    : null;

  return (
    <Document title={`Schedule — ${show.name}`} author="Remi Show Manager">
      <SvCover show={show} judges={judges} rkcClassCount={rkcClassCount} />

      {selectAdverts(adverts, 'schedule', 'inside_front').map((ad) => (
        <AdvertPage key={`ad-if-${ad.id}`} advert={ad} />
      ))}

      <SvOverview show={show} />
      <SvClassificationPage
        breedClasses={groups.breedClasses}
        juniorHandling={groups.juniorHandling}
        juniorHandlingJudge={jhJudgeLabel}
      />
      <SvEligibilityPage />
      <SvGradingPage />
      <SvRulesPage />

      {selectAdverts(adverts, 'schedule', 'inside_back').map((ad) => (
        <AdvertPage key={`ad-ib-${ad.id}`} advert={ad} />
      ))}
      {selectAdverts(adverts, 'schedule', 'last_page').map((ad) => (
        <AdvertPage key={`ad-lp-${ad.id}`} advert={ad} />
      ))}
    </Document>
  );
}
