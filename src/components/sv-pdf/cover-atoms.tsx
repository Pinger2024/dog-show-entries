/**
 * Shared atoms for SV/WUSV cover treatment — used by both the schedule
 * (`src/components/schedule/sv-show-schedule.tsx`) and the catalogue
 * (`src/components/catalogue/catalogue-front-matter.tsx`) so the two
 * documents share the same masthead, club-brand tonal wash, and club
 * crest slot.
 *
 *   • TonalWash      — page-fill background. Pre-baked PNG buffer from
 *                      the wash baker, falls back to bundled defaults.
 *   • MastheadBand   — 52mm strip across the top of the cover with the
 *                      WUSV / GSDL / BRG institutional logos.
 *   • ClubCrestSlot  — 36mm square for the club's own crest, with an
 *                      italic placeholder when no logo is uploaded.
 *
 * Assets live in `public/sv-schedule/` (named historically because the
 * schedule shipped first — the catalogue reuses them).
 */
import { Image, Path, Svg, Text, View } from '@react-pdf/renderer';
import path from 'path';
import { SV, ss, SV_FONTS } from '@/components/schedule/shared/sv-styles';

export interface SvWashBuffers {
  cover: Buffer;
  inside: Buffer;
}

export function TonalWash({
  variant = 'inside',
  buffer,
}: {
  variant?: 'cover' | 'inside';
  /** Pre-baked wash PNG produced by `src/server/services/sv-tonal-wash.ts`
   *  using the club's brand colours. When omitted we fall back to the
   *  default Sieger dusty pink/blue PNGs in public/sv-schedule/. */
  buffer?: Buffer;
}) {
  const src =
    buffer ??
    path.join(
      process.cwd(),
      'public',
      'sv-schedule',
      variant === 'cover' ? 'wash-cover.png' : 'wash-inside.png',
    );
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} fixed>
      <Image src={src as unknown as string} style={{ width: '100%', height: '100%', objectFit: 'fill' }} />
    </View>
  );
}

export function MastheadBand() {
  const assetsDir = path.join(process.cwd(), 'public', 'sv-schedule');
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '52mm',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: '16mm',
      }}
    >
      <Image
        src={path.join(assetsDir, 'wusv-logo-tx.png')}
        style={{ height: '22mm', width: 'auto', objectFit: 'contain' }}
      />
      <View style={{ alignItems: 'center' }}>
        <Text style={[ss.eyebrow, { color: SV.ink3, fontSize: 6.5, marginBottom: 4 }]}>
          Held under the rules of
        </Text>
        <Image
          src={path.join(assetsDir, 'gsdl-logo-tx.png')}
          style={{ height: '16mm', width: 'auto', objectFit: 'contain' }}
        />
      </View>
      <Image
        src={path.join(assetsDir, 'brg-logo-tx.png')}
        style={{ height: '24mm', width: 'auto', objectFit: 'contain' }}
      />
    </View>
  );
}

export function ClubCrestSlot({ logoUrl, size = '36mm' }: { logoUrl?: string | null; size?: string }) {
  if (logoUrl) {
    // The box hugs the artwork instead of forcing it into a square. Clubs don't
    // all have a tidy round crest — North East's is a full landscape banner
    // (flag, cathedral, dogs), and squeezing that into a 36mm square left a thin
    // strip marooned in the middle of a bordered box (Mandy 2026-08-21).
    //
    // Fixed WIDTH, height follows the image, capped so a square crest can't tower
    // over the "Official Catalogue" lockup beside it. Same reasoning as the
    // class-sponsor banners in July: objectFit contain, no forced ratio, so every
    // club's artwork sits at its own proportions — nothing stretched or cropped.
    return (
      <View
        style={{
          width: '46mm',
          backgroundColor: SV.paper,
          borderWidth: 0.5,
          borderColor: SV.ink,
          padding: 4,
        }}
      >
        <Image src={logoUrl} style={{ width: '100%', maxHeight: size, objectFit: 'contain' }} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: SV.paper,
        borderWidth: 0.5,
        borderColor: SV.ink,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
      }}
    >
      <Svg width="24" height="28" viewBox="0 0 60 70">
        <Path
          d="M 30 4 L 56 12 L 56 34 Q 56 54 30 66 Q 4 54 4 34 L 4 12 Z"
          fill="none"
          stroke={SV.ink2}
          strokeWidth={1.2}
        />
      </Svg>
      <Text style={[{ fontFamily: SV_FONTS.serif, fontStyle: 'italic', color: SV.ink, fontSize: 11, marginTop: 4 }]}>Club Crest</Text>
      <Text style={[ss.eyebrow, { fontSize: 5.5, marginTop: 2 }]}>Uploaded · per show</Text>
    </View>
  );
}
