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
  placements: number; // 1-5, how many placement cards per class
}

const SHOW_TYPE_LABELS: Record<string, string> = {
  companion: 'Companion Show',
  primary: 'Primary Show',
  limited: 'Limited Show',
  open: 'Open Show',
  premier_open: 'Premier Open Show',
  championship: 'Championship Show',
};

const PLACEMENT_LABELS: Record<number, string> = {
  1: 'First',
  2: 'Second',
  3: 'Third',
  4: 'Reserve',
  5: 'Very Highly Commended',
};

const PLACEMENT_ABBREVIATIONS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: 'Res',
  5: 'VHC',
};

// Elegant colour scheme for each placement
const PLACEMENT_COLOURS: Record<number, { accent: string; light: string }> = {
  1: { accent: '#B8860B', light: '#FFF8E1' }, // Gold
  2: { accent: '#708090', light: '#F0F4F8' }, // Silver
  3: { accent: '#8B4513', light: '#FFF3E0' }, // Bronze
  4: { accent: '#2E5090', light: '#E8EEF6' }, // Blue
  5: { accent: '#5B3A6B', light: '#F3EDF7' }, // Purple
};

const s = StyleSheet.create({
  // A5 landscape: 595 x 420 pts (A5 = 148mm × 210mm)
  page: {
    fontFamily: 'Times',
    width: '100%',
    height: '100%',
    padding: 0,
    position: 'relative',
  },
  // Decorative border
  outerBorder: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    bottom: 14,
    borderWidth: 2,
    borderColor: '#000',
  },
  innerBorder: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    bottom: 18,
    borderWidth: 0.5,
    borderColor: '#999',
  },
  // Content area
  content: {
    flex: 1,
    padding: '28 32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Logo
  logo: {
    width: 50,
    height: 50,
    marginBottom: 8,
  },
  // Club name
  clubName: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  // Show name
  showName: {
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  // Show type
  showType: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#555',
    marginBottom: 2,
    textAlign: 'center',
  },
  // Date
  date: {
    fontSize: 9,
    color: '#444',
    marginBottom: 14,
    textAlign: 'center',
  },
  // Decorative rule
  rule: {
    width: '60%',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    marginBottom: 14,
  },
  // Placement
  placementContainer: {
    paddingVertical: 6,
    paddingHorizontal: 24,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  placementText: {
    fontSize: 22,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 3,
    textAlign: 'center',
  },
  // Class info
  classInfo: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 3,
    textAlign: 'center',
  },
  breedInfo: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#333',
    marginBottom: 3,
    textAlign: 'center',
  },
  sexInfo: {
    fontSize: 9,
    color: '#555',
    marginBottom: 10,
    textAlign: 'center',
  },
  // Judge
  judgeName: {
    fontSize: 9,
    color: '#444',
    marginBottom: 4,
    textAlign: 'center',
  },
  // Exhibitor write-in line
  writeInLabel: {
    fontSize: 8,
    color: '#666',
    marginTop: 10,
  },
  writeInLine: {
    width: '70%',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    height: 16,
    marginTop: 2,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 8,
    left: 20,
    right: 20,
    textAlign: 'center',
    fontSize: 6,
    color: '#bbb',
  },
});

export function PrizeCards({ show, classes, includeJudgeName, placements }: PrizeCardsProps) {
  const showDate = new Date(show.date).toLocaleDateString('en-GB', {
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

          return (
            <Page
              key={`${classIdx}-${placement}`}
              size="A5"
              orientation="landscape"
              style={{ ...s.page, backgroundColor: colours.light }}
            >
              {/* Decorative double border */}
              <View style={{ ...s.outerBorder, borderColor: colours.accent }} />
              <View style={{ ...s.innerBorder, borderColor: colours.accent }} />

              <View style={s.content}>
                {/* Club logo */}
                {show.logoUrl && (
                  <Image src={show.logoUrl} style={s.logo} />
                )}

                {/* Club name */}
                {show.organisation && (
                  <Text style={s.clubName}>{show.organisation}</Text>
                )}

                {/* Show name */}
                <Text style={s.showName}>{show.name}</Text>

                {/* Show type */}
                <Text style={s.showType}>{showTypeLabel}</Text>

                {/* Date */}
                <Text style={s.date}>{showDate}</Text>

                {/* Decorative rule */}
                <View style={{ ...s.rule, borderBottomColor: colours.accent }} />

                {/* Placement badge */}
                <View style={{ ...s.placementContainer, borderColor: colours.accent }}>
                  <Text style={{ ...s.placementText, color: colours.accent }}>
                    {PLACEMENT_LABELS[placement]}
                  </Text>
                </View>

                {/* Class info */}
                <Text style={s.classInfo}>{classLabel}</Text>

                {/* Breed */}
                {cls.breedName && (
                  <Text style={s.breedInfo}>{cls.breedName}</Text>
                )}

                {/* Sex */}
                {sexLabel && (
                  <Text style={s.sexInfo}>{sexLabel}</Text>
                )}

                {/* Judge */}
                {includeJudgeName && cls.judgeName && (
                  <Text style={s.judgeName}>Judge: {cls.judgeName}</Text>
                )}

                {/* Write-in area for exhibitor/dog */}
                <Text style={s.writeInLabel}>Exhibit</Text>
                <View style={s.writeInLine} />
              </View>

              <Text style={s.footer}>Generated by Remi</Text>
            </Page>
          );
        });
      })}
    </Document>
  );
}
