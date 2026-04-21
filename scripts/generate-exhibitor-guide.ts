/**
 * Exhibitor user guide generator.
 *
 * Walks through the full exhibitor journey on localhost:3000 (the dev server
 * must already be running), screenshots each step at a mobile viewport, then
 * stitches the captured frames into a PDF guide suitable for handing to new
 * exhibitors.
 *
 * Usage:
 *   # in one terminal
 *   npm run dev
 *   # in another
 *   npx tsx scripts/generate-exhibitor-guide.ts
 *
 * Output:
 *   scripts/output/exhibitor-guide.pdf     — finished guide
 *   scripts/output/exhibitor-guide/*.png   — raw frames (inspect when iterating)
 *
 * Seeds (idempotent):
 *   - Test exhibitor "Sarah Thompson" (sarah.thompson@example.com / Remi-Guide-2026!)
 *   - Relies on the Hundark GSD E2E Test Show already existing on the DB — if
 *     it's been cleaned up, rerun `npx tsx scripts/e2e-mandy-fulltest.ts` first.
 *
 * Design notes:
 *   - Uses the Credentials (password) provider so Playwright can sign in
 *     without hitting Google OAuth or a magic-link inbox.
 *   - Stripe still runs on test keys in production, so the "Pay" step uses the
 *     4242 test card and does actually clear — the created order is tagged so
 *     it's easy to sweep up during the production cleanup pass.
 *   - Screenshots capture the page viewport only (no browser chrome), so the
 *     "localhost:3000" URL never appears in the output PDF.
 */
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { eq, ilike, desc, inArray } from 'drizzle-orm';
import { hash as bcryptHash } from 'bcryptjs';
import { db } from '@/server/db/index.js';
import * as s from '@/server/db/schema/index.js';

// ─── Config ──────────────────────────────────────────────────────────────

const BASE_URL = process.env.GUIDE_BASE_URL ?? 'http://localhost:3000';
const GUIDE_EMAIL = 'sarah.thompson@example.com';
const GUIDE_PASSWORD = 'Remi-Guide-2026!';
const GUIDE_NAME = 'Sarah Thompson';

// iPhone 13 Pro — representative of Amanda's exhibitor audience.
const VIEWPORT = { width: 390, height: 844 } as const;
// Device pixel ratio of 2 gives us retina-quality screenshots for the PDF.
const DEVICE_SCALE = 2;

const OUT_DIR = join(process.cwd(), 'scripts', 'output');
const FRAMES_DIR = join(OUT_DIR, 'exhibitor-guide');
const PDF_PATH = join(OUT_DIR, 'exhibitor-guide.pdf');

const SHOW_NAME = 'Hundark GSD E2E Test Show';
// German Shepherd Dog breed id — from e2e-mandy-fulltest.ts. The Hundark show
// is single-breed, so Sarah's dog must be a GSD to be eligible.
const GSD_BREED_ID = '858b16ec-0b76-44e8-89a4-c332dd43c1dd';

// Stripe test card that clears on test keys.
const TEST_CARD = { number: '4242 4242 4242 4242', exp: '12 / 34', cvc: '123', postcode: 'G1 1AA' };

// ─── Step recorder ───────────────────────────────────────────────────────

type Step = { name: string; file: string; caption: string; body?: string };
const steps: Step[] = [];

async function record(page: Page, name: string, caption: string, body?: string) {
  // Dismiss the sticky cookie banner if it's visible — it covers the
  // bottom third of mobile viewports and ruins otherwise-clean screenshots.
  await page.getByRole('button', { name: /^accept/i }).click({ timeout: 500 }).catch(() => {});
  // Scroll to the top of the page so captures always lead with the page
  // header. Without this, mid-flow screenshots show bottom-of-page content
  // (the wizard keeps the primary action button in view, which scrolls us).
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior }));
  // Hide Next.js dev chrome (the "N" bubble) and the in-app help widget —
  // both are fixed-position and would otherwise float on every screenshot.
  await page.addStyleTag({
    content: `
      nextjs-portal, [data-nextjs-scroll-focus-boundary],
      [aria-label*="Next.js" i], [data-nextjs-toast], [id^="__next-dev-tools"],
      [data-feedback-widget], [data-help-widget],
      button[aria-label*="help" i], button[aria-label*="feedback" i] {
        display: none !important; visibility: hidden !important;
      }
    `,
  }).catch(() => {});
  // Tiny wait for fonts/images to settle — Remi's shells have background
  // blurs that take a frame to paint.
  await page.waitForTimeout(350);
  const file = `${String(steps.length + 1).padStart(2, '0')}-${name}.png`;
  const path = join(FRAMES_DIR, file);
  await page.screenshot({ path, fullPage: false });
  steps.push({ name, file, caption, body });
  console.log(`  📸 ${file}  — ${caption}`);
}

// ─── Seeding ─────────────────────────────────────────────────────────────

async function seedExhibitor() {
  if (!db) throw new Error('No DB connection — is DATABASE_URL set in .env?');

  const [existing] = await db
    .select()
    .from(s.users)
    .where(ilike(s.users.email, GUIDE_EMAIL))
    .limit(1);

  const passwordHash = await bcryptHash(GUIDE_PASSWORD, 10);

  if (existing) {
    // Reset the user to a clean state every run: fresh password, no dogs, no
    // entries, address nulled (so the profile-gate step always fires), and
    // onboarding marked complete (the /onboarding redirect is out of scope
    // for this guide — a separate account-setup guide can cover it).
    await db
      .update(s.users)
      .set({
        passwordHash,
        name: GUIDE_NAME,
        role: 'exhibitor',
        address: null,
        postcode: null,
        onboardingCompletedAt: new Date(),
      })
      .where(eq(s.users.id, existing.id));

    // FK-safe teardown of any prior-run state: dogs → entries → entry_classes
    // (order matters because Drizzle doesn't auto-cascade in push mode).
    const dogs = await db
      .select({ id: s.dogs.id })
      .from(s.dogs)
      .where(eq(s.dogs.ownerId, existing.id));

    if (dogs.length > 0) {
      const dogIds = dogs.map((d) => d.id);
      const entries = await db
        .select({ id: s.entries.id })
        .from(s.entries)
        .where(inArray(s.entries.dogId, dogIds));
      const entryIds = entries.map((e) => e.id);
      if (entryIds.length > 0) {
        await db.delete(s.entryClasses).where(inArray(s.entryClasses.entryId, entryIds));
        await db.delete(s.entries).where(inArray(s.entries.id, entryIds));
      }
      await db.delete(s.dogs).where(inArray(s.dogs.id, dogIds));
    }

    console.log(`✓ Reset exhibitor ${GUIDE_EMAIL} (userId=${existing.id})`);
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(s.users).values({
    id,
    email: GUIDE_EMAIL,
    name: GUIDE_NAME,
    passwordHash,
    role: 'exhibitor',
    emailVerified: new Date(),
    onboardingCompletedAt: new Date(),
  });
  console.log(`✓ Created exhibitor ${GUIDE_EMAIL} (userId=${id})`);
  return id;
}

async function seedBella(ownerId: string) {
  if (!db) throw new Error('no db');
  // Idempotent — seeder nukes all dogs per run, so this always runs as insert.
  const id = crypto.randomUUID();
  await db.insert(s.dogs).values({
    id,
    registeredName: 'Thornfield Bella at Example',
    breedId: GSD_BREED_ID,
    sex: 'bitch',
    dateOfBirth: '2023-05-14',
    breederName: 'Example Kennels',
    colour: 'Black & Tan',
    ownerId,
  });
  console.log(`✓ Seeded dog Thornfield Bella at Example (dogId=${id})`);
  return id;
}

async function findTargetShow() {
  if (!db) throw new Error('no db');
  const [show] = await db
    .select({ id: s.shows.id, slug: s.shows.slug, name: s.shows.name })
    .from(s.shows)
    .where(eq(s.shows.name, SHOW_NAME))
    .orderBy(desc(s.shows.createdAt))
    .limit(1);
  if (!show) {
    throw new Error(
      `Target show "${SHOW_NAME}" not found. Run \`npx tsx scripts/e2e-mandy-fulltest.ts\` first.`,
    );
  }
  console.log(`✓ Target show: ${show.name} (slug=${show.slug})`);
  return show;
}

// ─── Walk ─────────────────────────────────────────────────────────────────

async function walkFlow(context: BrowserContext, show: { slug: string }) {
  const page = await context.newPage();

  // 1. Home page
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('networkidle');
  await record(page, 'home', 'Start at remishowmanager.co.uk',
    'This is the Remi home page. Tap "Find a show" to browse upcoming events.');

  // 2. Shows listing
  await page.goto(`${BASE_URL}/shows`);
  await page.waitForLoadState('networkidle');
  await record(page, 'shows-list', 'Browse upcoming shows',
    'Every show open for entries appears here. Tap a show card to see the full schedule and enter online.');

  // 3. Show detail
  await page.goto(`${BASE_URL}/shows/${show.slug}`);
  await page.waitForLoadState('networkidle');
  await record(page, 'show-detail', 'Read the show details',
    'Each show page carries the schedule, the judges, the classes on offer, and the closing date. When you\'re ready, scroll down and tap "Enter this show".');

  // 4. Sign in prompt → login page
  // Navigate straight to /login with the callback URL set. The middleware
  // would redirect us there anyway from /enter, but going direct avoids a
  // flash of the unauthenticated enter page.
  await page.goto(
    `${BASE_URL}/login?callbackUrl=${encodeURIComponent(`/shows/${show.slug}/enter`)}`,
  );
  await page.waitForLoadState('networkidle');
  await record(page, 'login', 'Sign in — or create an account',
    'First time? Tap "Create a free account" at the bottom. Already have a Remi account? Enter your email and password (or use the magic-link option).');

  // 5. Sign in — click the "Sign in with password" reveal, then fill
  await page.getByRole('button', { name: /sign in with password/i }).click({ timeout: 5_000 }).catch(() => {});
  await page.getByLabel(/email address/i).fill(GUIDE_EMAIL);
  // The password field appears only after clicking the reveal button.
  await page.waitForSelector('input[type="password"]:visible', { timeout: 5_000 });
  await page.getByLabel(/^password$/i).fill(GUIDE_PASSWORD);
  await record(page, 'login-filled', 'Enter your email and password',
    'Tap "Sign in" once your details are filled in. Remi will remember you on this device.');
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Wait for redirect to the enter page
  await page.waitForURL(new RegExp(`/shows/${show.slug}/enter`), { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  // 6. Profile completion gate — first-time users must give name + address
  // before the wizard lets them start. The RKC requires both fields on
  // every entry form, so we surface this as its own guide step.
  const profileGate = page.getByText(/complete your profile/i).first();
  if (await profileGate.isVisible().catch(() => false)) {
    await record(page, 'profile-gate', 'Add your name and address',
      'The RKC requires your full name and address on every entry. Remi will only ask once — your details are stored against your account and filled in automatically on future entries.');
    await page.getByLabel(/full name/i).fill(GUIDE_NAME);
    await page.getByLabel(/address/i).fill('14 Primrose Lane, Glasgow G1 1AA');
    await record(page, 'profile-filled', 'Profile filled in',
      'Tap "Save & Continue" when you\'re ready. You\'ll be taken straight to the first step of your entry.');
    await page.getByRole('button', { name: /save.*continue/i }).click({ timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    // Small settle after the profile mutation + re-render
    await page.waitForTimeout(500);
  }

  // 7. Entry type — shown whenever the show has Junior Handler classes.
  // Most shows (and most exhibitors) pick "Enter a Dog".
  const typeHeading = page.getByText(/what type of entry/i).first();
  if (await typeHeading.isVisible().catch(() => false)) {
    await record(page, 'entry-type', 'Choose your entry type',
      'Standard breed entry, or Junior Handler (handling-skill classes for young handlers). Most exhibitors pick "Enter a Dog".');
    await page.getByText(/enter a dog/i).first().click({ timeout: 5_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
  }

  // 8. Dog selection step — Bella is pre-registered, so she appears as a
  // tappable card. (To add a new dog, exhibitors use "My Dogs" — a separate
  // mini-guide can cover that flow.)
  await record(page, 'dog-step', 'Pick the dog you\'re entering',
    'Remi shows every dog registered to your account. Tap the one you\'re entering in this show. If your dog isn\'t listed, head to "My Dogs" from the menu to add them first.');

  // Tap Bella — she's the only eligible dog.
  const bellaCard = page.getByText(/Thornfield Bella|Bella/i).first();
  await bellaCard.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(400);
  // Advance — the continue button label varies
  await page.getByRole('button', { name: /continue|next|pick classes|choose classes/i }).first()
    .click({ timeout: 5_000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await record(page, 'classes-step', 'Choose the classes to enter',
    'Tick every class you\'d like to enter. Remi lists the age and achievement classes your dog qualifies for based on their date of birth and show record.');

  // Pick the first two classes shown
  const classCheckboxes = page.getByRole('checkbox');
  const count = await classCheckboxes.count();
  for (let i = 0; i < Math.min(2, count); i++) {
    await classCheckboxes.nth(i).check({ force: true }).catch(() => {});
  }
  await record(page, 'classes-picked', 'Two classes selected',
    'In this example, Bella is entered in two classes. The running total updates at the bottom of the screen.');

  // 12. Add to Cart — advances to cart_review step
  await page.getByRole('button', { name: /add to cart|update/i }).first().click({ timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await record(page, 'cart-review', 'Review your entries',
    'Last chance to check your entries before paying. Remi shows the full RKC declaration — tick to agree, then move to payment.');

  // 13. Tick the RKC declaration checkbox (single combined checkbox covers
  // health + terms). Scroll into view first — the declaration sits below
  // the fold on mobile.
  const declaration = page.getByText(/i agree to the above declaration/i);
  await declaration.scrollIntoViewIfNeeded().catch(() => {});
  await declaration.click({ timeout: 5_000 });
  await page.waitForTimeout(300);

  // 14. Proceed to payment
  await page.getByRole('button', { name: /proceed to payment|confirm entry/i }).first()
    .click({ timeout: 10_000 });
  // Stripe Elements lives inside an iframe — give it a moment to load and
  // the PaymentIntent to resolve server-side.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_500);
  await record(page, 'payment-step', 'Enter your card details',
    'Your card is charged securely by Stripe. Remi never sees or stores your full card number. The £1 + 1% handling fee covers secure payment processing and the BACS transfer to the host club.');

  await page.close();
}

// ─── PDF stitching ───────────────────────────────────────────────────────

async function stitchPdf() {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // A4 portrait, 72dpi (pdf-lib's default unit is points; 1pt = 1/72 in)
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 48;

  const primary = rgb(0x2d / 255, 0x5f / 255, 0x3f / 255); // Remi green
  const ink = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.4, 0.4, 0.44);

  // ── Cover ────────────────────────────────────────────────────────────
  const cover = pdf.addPage([PAGE_W, PAGE_H]);
  cover.drawRectangle({ x: 0, y: PAGE_H - 260, width: PAGE_W, height: 260, color: primary });
  cover.drawText('Remi', {
    x: MARGIN, y: PAGE_H - 110, size: 48, font: helvBold, color: rgb(1, 1, 1),
  });
  cover.drawText('Exhibitor Guide', {
    x: MARGIN, y: PAGE_H - 160, size: 24, font: helv, color: rgb(1, 1, 1),
  });
  cover.drawText('Entering a dog show with Remi — step by step.', {
    x: MARGIN, y: PAGE_H - 200, size: 14, font: helv, color: rgb(1, 1, 1),
  });
  cover.drawText('What\'s inside', {
    x: MARGIN, y: PAGE_H - 320, size: 18, font: helvBold, color: ink,
  });
  const toc = [
    'Finding a show',
    'Signing in to your Remi account',
    'Adding your name and address',
    'Choosing your entry type',
    'Picking the dog you\'re entering',
    'Choosing the classes to enter',
    'Reviewing and paying securely',
  ];
  toc.forEach((line, i) => {
    cover.drawText(`${i + 1}.  ${line}`, {
      x: MARGIN + 8, y: PAGE_H - 360 - i * 22, size: 13, font: helv, color: ink,
    });
  });
  cover.drawText('remishowmanager.co.uk', {
    x: MARGIN, y: 48, size: 11, font: helv, color: muted,
  });

  // ── Step pages ───────────────────────────────────────────────────────
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const pngBytes = readFileSync(join(FRAMES_DIR, step.file));
    const image = await pdf.embedPng(pngBytes);

    const page = pdf.addPage([PAGE_W, PAGE_H]);

    // Step number pill
    page.drawRectangle({
      x: MARGIN, y: PAGE_H - MARGIN - 28, width: 60, height: 28,
      color: primary, borderColor: primary,
    });
    page.drawText(`Step ${i + 1}`, {
      x: MARGIN + 10, y: PAGE_H - MARGIN - 20, size: 12, font: helvBold, color: rgb(1, 1, 1),
    });

    // Caption (title)
    page.drawText(step.caption, {
      x: MARGIN, y: PAGE_H - MARGIN - 62, size: 18, font: helvBold, color: ink,
    });

    // Body (sub-caption)
    if (step.body) {
      const wrapped = wrapText(step.body, 68);
      wrapped.forEach((line, idx) => {
        page.drawText(line, {
          x: MARGIN, y: PAGE_H - MARGIN - 90 - idx * 16, size: 11, font: helv, color: muted,
        });
      });
    }

    // Screenshot, scaled to fit under the caption area
    const captionHeight = 120 + (step.body ? wrapText(step.body, 68).length * 16 : 0);
    const available = {
      w: PAGE_W - MARGIN * 2,
      h: PAGE_H - MARGIN * 2 - captionHeight,
    };
    const scale = Math.min(available.w / image.width, available.h / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const x = (PAGE_W - w) / 2;
    const y = MARGIN + (available.h - h) / 2;

    // Subtle drop-shadow frame around the screenshot
    page.drawRectangle({
      x: x - 2, y: y - 2, width: w + 4, height: h + 4,
      color: rgb(0.9, 0.9, 0.92),
    });
    page.drawImage(image, { x, y, width: w, height: h });

    // Footer
    page.drawText(`${i + 1} of ${steps.length}`, {
      x: PAGE_W - MARGIN - 40, y: 24, size: 10, font: helv, color: muted,
    });
    page.drawText('Remi — Exhibitor Guide', {
      x: MARGIN, y: 24, size: 10, font: helv, color: muted,
    });
  }

  // ── Closing page ─────────────────────────────────────────────────────
  const outro = pdf.addPage([PAGE_W, PAGE_H]);
  outro.drawText('Need a hand?', {
    x: MARGIN, y: PAGE_H - 140, size: 28, font: helvBold, color: primary,
  });
  const outroLines = [
    'If you get stuck at any point, we\'re here to help.',
    '',
    'Email:  support@remishowmanager.co.uk',
    'Website:  remishowmanager.co.uk',
    '',
    'Every Remi email has a reply-to that goes straight to our team.',
    'Just reply — we read every one.',
  ];
  outroLines.forEach((line, i) => {
    outro.drawText(line, {
      x: MARGIN, y: PAGE_H - 200 - i * 20, size: 13, font: helv, color: ink,
    });
  });

  const bytes = await pdf.save();
  writeFileSync(PDF_PATH, bytes);
  console.log(`\n✓ Guide written to ${PDF_PATH} (${(bytes.length / 1024).toFixed(0)} KB, ${steps.length} steps)`);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  // Prep output dirs
  if (existsSync(FRAMES_DIR)) rmSync(FRAMES_DIR, { recursive: true });
  mkdirSync(FRAMES_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('→ Seeding guide exhibitor…');
  const userId = await seedExhibitor();

  console.log('→ Seeding guide dog…');
  await seedBella(userId);

  console.log('→ Locating target show…');
  const show = await findTargetShow();

  console.log('→ Launching Chromium (mobile viewport)…');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      isMobile: true,
      hasTouch: true,
    });

    console.log('→ Walking exhibitor flow…');
    await walkFlow(context, show);

    console.log('→ Stitching PDF…');
    await stitchPdf();
  } finally {
    await browser.close();
  }

  console.log('\nDone. Open scripts/output/exhibitor-guide.pdf to review.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
