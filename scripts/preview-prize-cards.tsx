import 'dotenv/config';
import { writeFileSync } from 'fs';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PrizeCards } from '@/components/prize-cards/prize-cards';
import type { PrizeCardClass } from '@/components/prize-cards/prize-cards';

// Use the Remi icon as a stand-in for the club logo so we can see how a
// realistic 110pt logo lands on the redesigned card.
const LOGO_PATH = process.cwd() + '/public/icons/icon-512.png';

const mockShow = {
  name: 'Spring Championship Show',
  showType: 'championship',
  date: '2026-05-16',
  organisation: 'Clyde Valley German Shepherd Dog Club',
  logoUrl: LOGO_PATH,
};

const mockClasses: PrizeCardClass[] = [
  {
    classNumber: 1,
    className: 'Minor Puppy',
    sex: 'dog',
    breedName: 'German Shepherd Dog',
    judgeName: 'Mark Eagleton',
  },
];

async function main() {
  for (const style of ['filled', 'outline'] as const) {
    const doc = React.createElement(PrizeCards, {
      show: mockShow,
      classes: mockClasses,
      includeJudgeName: true,
      placements: 6,
      cardStyle: style,
    });
    const buffer = await renderToBuffer(doc);
    const out = `/tmp/amanda-prize-cards/new-design-${style}.pdf`;
    writeFileSync(out, buffer);
    console.log(`✓ ${out} (${(buffer.length / 1024).toFixed(0)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
