import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import path from 'path';

// Register Times New Roman
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'Times',
  fonts: [
    { src: path.join(fontsDir, 'times-new-roman.ttf') },
    { src: path.join(fontsDir, 'times-new-roman-bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontsDir, 'times-new-roman-italic.ttf'), fontStyle: 'italic' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export interface PrizeCardShowInfo {
  name: string;
  showType: string;
  date: string;
  organisation: string | null;
  logoUrl: string | null;
}

export interface PrizeCardClass {
  classNumber: number | null;
  className: string;
  sex: string | null;
  breedName: string | null;
  judgeName: string | null;
}

interface PrizeCardsProps {
  show: PrizeCardShowInfo;
  classes: PrizeCardClass[];
  includeJudgeName: boolean;
  /** How many placement cards per class, 1–5 (RKC podium through VHC). */
  placements: number;
  /** 'filled' = coloured background, 'outline' = white bg + coloured text/frame */
  cardStyle?: PrizeCardStyle;
}

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

// Punchy single-word/short labels matching traditional UK prize card style
// (Higham Press / MBJ etc. all set the placement as a single bold word like
// "FIRST" rather than "FIRST PLACE" — reads from across the ring).
const PLACEMENT_LABELS: Record<number, string> = {
  1: 'First',
  2: 'Second',
  3: 'Third',
  4: 'Reserve',
  5: 'Very Highly Commended',
};

// Traditional UK dog show prize card colours — red/blue/yellow/green/purple
// for 1st through VHC. No HC (orange) — research showed zero shows card
// past VHC, so the 6th colour was removed.
const PLACEMENT_COLOURS: Record<number, { accent: string; filled: string }> = {
  1: { accent: '#C41E3A', filled: '#FDE8EC' }, // Red
  2: { accent: '#1E4D8C', filled: '#E3ECF6' }, // Blue
  3: { accent: '#C5960C', filled: '#FDF6E0' }, // Yellow
  4: { accent: '#1E7A3A', filled: '#E4F5EA' }, // Green
  5: { accent: '#6B2FA0', filled: '#F3EAFA' }, // Purple
};

export type PrizeCardStyle = 'filled' | 'outline';

// Card design notes — see Amanda's prize-card feedback (2026-04-10):
//   "More impressive, you can't even see our branding, larger font, fill the
//    card, larger logo, professional pizazz".
// Every measurement here was uplifted from the previous timid layout to feel
// confident at arm's length. The reference is the Higham Press / Mixam
// traditional UK prize card style — bold club name, prominent logo, single
// dominant placement word, content that fills the card edge to edge.
const s = StyleSheet.create({
  // A5 landscape: 595 x 420 pts (A5 = 148mm × 210mm)
  page: {
    fontFamily: 'Times',
    width: '100%',
    height: '100%',
    padding: 0,
    position: 'relative',
  },
  // Decorative double border — outer is the bold accent frame, inner is a
  // hairline rule offset by 4pt to create a "matted print" look.
  outerBorder: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    borderWidth: 3,
    borderColor: '#000',
  },
  innerBorder: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    bottom: 18,
    borderWidth: 0.75,
    borderColor: '#999',
  },
  // Content area — reduced padding so content reaches near the inner frame
  content: {
    flex: 1,
    padding: '20 28',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Top zone — logo + club identity
  topZone: {
    alignItems: 'center',
    width: '100%',
  },
  // Logo — was 50pt, now 95pt (≈23% of card height — anchors the top half
  // without crowding the placement and bottom info out of the page).
  logo: {
    width: 95,
    height: 95,
    marginBottom: 4,
    objectFit: 'contain',
  },
  // Club name — was 14pt, now 22pt bold caps. The dominant identity element.
  clubName: {
    fontSize: 22,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: '#1a1a1a',
    marginBottom: 3,
    textAlign: 'center',
  },
  // Show name — was 16pt, now 14pt italic to subordinate to the club name
  // and give the placement more breathing room. Title-cased not all-caps.
  showName: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#444',
    marginBottom: 2,
    textAlign: 'center',
  },
  // Show type + date — combined into one line, was 9pt × 2 lines, now 10pt × 1
  showMeta: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  // Middle zone — the placement, the visual hero
  middleZone: {
    alignItems: 'center',
    width: '100%',
  },
  // Decorative rule — slightly bolder, fuller width
  rule: {
    width: '70%',
    borderBottomWidth: 1.25,
    marginVertical: 6,
  },
  // Placement badge — was 22pt cramped, now 36pt with generous frame
  placementContainer: {
    paddingVertical: 8,
    paddingHorizontal: 36,
    borderWidth: 2.5,
    marginVertical: 2,
  },
  placementText: {
    fontSize: 36,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 4,
    textAlign: 'center',
  },
  // Bottom zone — class info, judge, write-in
  bottomZone: {
    alignItems: 'center',
    width: '100%',
  },
  // Class info — was 11pt, now 14pt bold
  classInfo: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 2,
    textAlign: 'center',
  },
  breedInfo: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#333',
    marginBottom: 2,
    textAlign: 'center',
  },
  sexInfo: {
    fontSize: 11,
    color: '#555',
    marginBottom: 6,
    textAlign: 'center',
  },
  // Judge — was 11pt, now 13pt per Amanda 2026-04-11 (she wanted it a bit
  // larger so the judge credit reads more confidently on the card).
  judgeName: {
    fontSize: 13,
    color: '#444',
    marginBottom: 4,
    textAlign: 'center',
  },
  // Exhibitor write-in — bigger label, line tall enough for handwriting
  writeInLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  writeInLine: {
    width: '78%',
    borderBottomWidth: 0.75,
    borderBottomColor: '#888',
    height: 18,
    marginTop: 2,
  },
  // Footer — slightly visible Remi credit
  footer: {
    position: 'absolute',
    bottom: 6,
    left: 20,
    right: 20,
    textAlign: 'center',
    fontSize: 6,
    color: '#bbb',
  },
});

export function PrizeCards({ show, classes, includeJudgeName, placements, cardStyle = 'filled' }: PrizeCardsProps) {
  // Full date format with weekday + ordinal day matches the Higham Press
  // tradition (e.g. "Saturday 16 May 2026") — feels ceremonial vs the bare
  // "16 May 2026" the previous design used.
  const showDate = new Date(show.date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const showTypeLabel = SHOW_TYPE_LABELS[show.showType] ?? show.showType;
  const placementCount = Math.min(Math.max(placements, 1), 5);

  return (
    <Document title={`Prize Cards — ${show.name}`} author="Remi Show Manager">
      {classes.map((cls, classIdx) => {
        const sexLabel = cls.sex === 'dog' ? 'Dogs' : cls.sex === 'bitch' ? 'Bitches' : null;
        const classLabel = [
          cls.classNumber ? `Class ${cls.classNumber}` : null,
          cls.className,
        ]
          .filter(Boolean)
          .join(' — ');

        return Array.from({ length: placementCount }, (_, placeIdx) => {
          const placement = placeIdx + 1;
          const colours = PLACEMENT_COLOURS[placement];
          // outline style: pure white paper — no tint. Amanda saw a faint
          // grey on printed copies because the old value was #FAFAFA
          // (almost-white but not white). Printers render that as a
          // visible background wash.
          const bgColor = cardStyle === 'outline' ? '#FFFFFF' : colours.filled;

          return (
            <Page
              key={`${classIdx}-${placement}`}
              size="A5"
              orientation="landscape"
              wrap={false}
              style={{ ...s.page, backgroundColor: bgColor }}
            >
              {/* Decorative double border — outer in placement colour, inner hairline */}
              <View style={{ ...s.outerBorder, borderColor: colours.accent }} />
              <View style={s.innerBorder} />

              <View style={s.content}>
                {/* TOP ZONE — club identity */}
                <View style={s.topZone}>
                  {show.logoUrl && (
                    <Image src={show.logoUrl} style={s.logo} />
                  )}
                  {show.organisation && (
                    <Text style={s.clubName}>{show.organisation}</Text>
                  )}
                  <Text style={s.showName}>{show.name}</Text>
                  <Text style={s.showMeta}>
                    {showTypeLabel} · {showDate}
                  </Text>
                </View>

                {/* MIDDLE ZONE — the placement, visual hero */}
                <View style={s.middleZone}>
                  <View style={{ ...s.rule, borderBottomColor: colours.accent }} />
                  <View style={{ ...s.placementContainer, borderColor: colours.accent }}>
                    <Text style={{ ...s.placementText, color: colours.accent }}>
                      {PLACEMENT_LABELS[placement]}
                    </Text>
                  </View>
                  <View style={{ ...s.rule, borderBottomColor: colours.accent }} />
                </View>

                {/* BOTTOM ZONE — class details, judge, write-in */}
                <View style={s.bottomZone}>
                  <Text style={s.classInfo}>{classLabel}</Text>
                  {cls.breedName && (
                    <Text style={s.breedInfo}>{cls.breedName}</Text>
                  )}
                  {sexLabel && (
                    <Text style={s.sexInfo}>{sexLabel}</Text>
                  )}
                  {includeJudgeName && cls.judgeName && (
                    <Text style={s.judgeName}>Judge: {cls.judgeName}</Text>
                  )}
                  <Text style={s.writeInLabel}>Exhibit</Text>
                  <View style={s.writeInLine} />
                </View>
              </View>

              <Text style={s.footer}>RemiShowManager.co.uk</Text>
            </Page>
          );
        });
      })}
    </Document>
  );
}
