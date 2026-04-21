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

type Step = { name: string; file: string; caption: string; body: string };
const steps: Step[] = [];

// Hide fixed-position chrome that would otherwise float on every screenshot:
// Next.js dev bubble, in-app help widget, anything labelled "feedback".
const HIDE_CHROME_CSS = `
  nextjs-portal, [data-nextjs-scroll-focus-boundary],
  [aria-label*="Next.js" i], [data-nextjs-toast], [id^="__next-dev-tools"],
  [data-feedback-widget], [data-help-widget],
  button[aria-label*="help" i], button[aria-label*="feedback" i] {
    display: none !important; visibility: hidden !important;
  }
`;

async function dismissCookieBanner(page: Page) {
  // Consent is cookie-backed, so one successful click sticks for the whole
  // context. After that the Accept button is simply absent and the 500ms
  // timeout below is the no-op cost per subsequent call.
  await page.getByRole('button', { name: /^accept/i }).click({ timeout: 500 }).catch(() => {});
}

async function record(page: Page, name: string, caption: string, body: string) {
  // Re-inject the chrome-hiding stylesheet every capture — addStyleTag adds a
  // <style> element that's dropped by navigation, and Next.js's dev-tools
  // button can reappear mid-flow. Cheap and idempotent.
  await page.addStyleTag({ content: HIDE_CHROME_CSS }).catch(() => {});
  // Scroll to the top so captures lead with the page header. Without this,
  // mid-flow screenshots show bottom-of-page content because the wizard
  // keeps the primary action button in view.
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior }));
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
  if (!db) throw new Error('No DB connection — is DATABASE_URL set in .env?');
  // On an existing user, seedExhibitor() already deleted Sarah's prior dogs.
  // On a fresh user, there's nothing to delete. Either way, this is a new row.
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
  if (!db) throw new Error('No DB connection — is DATABASE_URL set in .env?');
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

// Wrap load-bearing clicks — if one of these silently misses, the next
// screenshot captures the wrong page. Warn loudly instead.
async function mustClick(locator: ReturnType<Page['getByText']>, label: string) {
  try {
    await locator.click({ timeout: 5_000 });
  } catch (err) {
    console.warn(`  ⚠ Failed to click "${label}" — subsequent screenshot may be wrong. ${(err as Error).message}`);
  }
}

async function walkFlow(context: BrowserContext, show: { slug: string }) {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('domcontentloaded');
  await dismissCookieBanner(page);

  await record(page, 'home', 'Start at remishowmanager.co.uk',
    'This is the Remi home page. Tap "Find a show" to browse upcoming events.');

  await page.goto(`${BASE_URL}/shows`);
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'shows-list', 'Browse upcoming shows',
    'Every show open for entries appears here. Tap a show card to see the full schedule and enter online.');

  await page.goto(`${BASE_URL}/shows/${show.slug}`);
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'show-detail', 'Read the show details',
    'Each show page carries the schedule, the judges, the classes on offer, and the closing date. When you\'re ready, scroll down and tap "Enter this show".');

  // Jump straight to /login with callbackUrl — the middleware would redirect
  // us there from /enter anyway, but going direct avoids a flash of the
  // unauthenticated enter page.
  await page.goto(
    `${BASE_URL}/login?callbackUrl=${encodeURIComponent(`/shows/${show.slug}/enter`)}`,
  );
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'login', 'Sign in — or create an account',
    'First time? Tap "Create a free account" at the bottom. Already have a Remi account? Enter your email and password (or use the magic-link option).');

  await page.getByRole('button', { name: /sign in with password/i }).click({ timeout: 5_000 }).catch(() => {});
  await page.getByLabel(/email address/i).fill(GUIDE_EMAIL);
  await page.waitForSelector('input[type="password"]:visible', { timeout: 5_000 });
  await page.getByLabel(/^password$/i).fill(GUIDE_PASSWORD);
  await record(page, 'login-filled', 'Enter your email and password',
    'Tap "Sign in" once your details are filled in. Remi will remember you on this device.');
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await page.waitForURL(new RegExp(`/shows/${show.slug}/enter`), { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  // Profile-completion gate — first-time users must give name + address
  // before the wizard lets them start. The RKC requires both on every
  // entry form, so we surface this as its own guide step.
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
    await page.waitForTimeout(500);
  }

  // Entry-type step — shown when the show has Junior Handler classes. Most
  // exhibitors pick "Enter a Dog".
  const typeHeading = page.getByText(/what type of entry/i).first();
  if (await typeHeading.isVisible().catch(() => false)) {
    await record(page, 'entry-type', 'Choose your entry type',
      'Standard breed entry, or Junior Handler (handling-skill classes for young handlers). Most exhibitors pick "Enter a Dog".');
    await mustClick(page.getByText(/enter a dog/i).first(), 'Enter a Dog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
  }

  await record(page, 'dog-step', 'Pick the dog you\'re entering',
    'Remi shows every dog registered to your account. Tap the one you\'re entering in this show. If your dog isn\'t listed, head to "My Dogs" from the menu to add them first.');

  await mustClick(page.getByText(/Thornfield Bella|Bella/i).first(), 'Bella dog card');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /continue|next|pick classes|choose classes/i }).first()
    .click({ timeout: 5_000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await record(page, 'classes-step', 'Choose the classes to enter',
    'Tick every class you\'d like to enter. Remi lists the age and achievement classes your dog qualifies for based on their date of birth and show record.');

  const classCheckboxes = page.getByRole('checkbox');
  const classCount = Math.min(2, await classCheckboxes.count());
  for (let i = 0; i < classCount; i++) {
    try {
      await classCheckboxes.nth(i).check({ force: true });
    } catch (err) {
      console.warn(`  ⚠ Could not tick class checkbox ${i + 1} — "classes-picked" screenshot may show fewer selections. ${(err as Error).message}`);
    }
  }
  await record(page, 'classes-picked', 'Two classes selected',
    'In this example, Bella is entered in two classes. The running total updates at the bottom of the screen.');

  await mustClick(page.getByRole('button', { name: /add to cart|update/i }).first(), 'Add to Cart');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await record(page, 'cart-review', 'Review your entries',
    'Last chance to check your entries before paying. Remi shows the full RKC declaration — tick to agree, then move to payment.');

  // RKC declaration is a combined health+terms checkbox; scroll it into
  // view first because it sits below the fold on mobile.
  const declaration = page.getByText(/i agree to the above declaration/i);
  await declaration.scrollIntoViewIfNeeded().catch(() => {});
  await mustClick(declaration, 'RKC declaration checkbox');
  await page.waitForTimeout(300);

  await mustClick(
    page.getByRole('button', { name: /proceed to payment|confirm entry/i }).first(),
    'Proceed to Payment',
  );
  // Wait for the PaymentIntent to resolve + Stripe Elements iframe to mount.
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
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

    page.drawRectangle({
      x: MARGIN, y: PAGE_H - MARGIN - 28, width: 60, height: 28,
      color: primary, borderColor: primary,
    });
    page.drawText(`Step ${i + 1}`, {
      x: MARGIN + 10, y: PAGE_H - MARGIN - 20, size: 12, font: helvBold, color: rgb(1, 1, 1),
    });

    page.drawText(step.caption, {
      x: MARGIN, y: PAGE_H - MARGIN - 62, size: 18, font: helvBold, color: ink,
    });

    const wrapped = wrapText(step.body, 68);
    wrapped.forEach((line, idx) => {
      page.drawText(line, {
        x: MARGIN, y: PAGE_H - MARGIN - 90 - idx * 16, size: 11, font: helv, color: muted,
      });
    });

    const captionHeight = 120 + wrapped.length * 16;
    const available = {
      w: PAGE_W - MARGIN * 2,
      h: PAGE_H - MARGIN * 2 - captionHeight,
    };
    const scale = Math.min(available.w / image.width, available.h / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const x = (PAGE_W - w) / 2;
    const y = MARGIN + (available.h - h) / 2;

    // Light-grey frame gives the screenshot a subtle shadow against the page.
    page.drawRectangle({
      x: x - 2, y: y - 2, width: w + 4, height: h + 4,
      color: rgb(0.9, 0.9, 0.92),
    });
    page.drawImage(image, { x, y, width: w, height: h });

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
  if (existsSync(FRAMES_DIR)) rmSync(FRAMES_DIR, { recursive: true });
  mkdirSync(FRAMES_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('→ Seeding guide exhibitor…');
  const userId = await seedExhibitor();

  console.log('→ Seeding dog + locating target show…');
  const [, show] = await Promise.all([seedBella(userId), findTargetShow()]);

  console.log('→ Launching Chromium (mobile viewport)…');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      isMobile: true,
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
