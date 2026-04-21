/**
 * Exhibitor user-guide generator — produces two PDFs targeting two audiences:
 *
 *   "new"       — brand-new exhibitor: create account → email check →
 *                 onboarding welcome → fill profile → add first dog →
 *                 find a show → enter → pay.
 *   "returning" — exhibitor with an account + a dog on file: sign in →
 *                 find a show → enter → pay.
 *
 * Usage:
 *   # start the dev server in another terminal
 *   npm run dev
 *
 *   # pick a flow
 *   GUIDE_BASE_URL=http://localhost:3001 npx tsx scripts/generate-exhibitor-guide.ts --flow=new
 *   GUIDE_BASE_URL=http://localhost:3001 npx tsx scripts/generate-exhibitor-guide.ts --flow=returning
 *
 *   # or generate both in one command
 *   GUIDE_BASE_URL=http://localhost:3001 npx tsx scripts/generate-exhibitor-guide.ts --flow=both
 *
 * Output:
 *   scripts/output/exhibitor-guide-new.pdf
 *   scripts/output/exhibitor-guide-returning.pdf
 *
 * Demo data (idempotent, seeded on prod DB):
 *   - Org: "Thornfield Canine Society" with fake secretary email on
 *     example.com — no trace of Hundark / Amanda anywhere.
 *   - Show: "Thornfield Summer Open Show" in entries_open state, general
 *     scope so any breed is eligible.
 *   - For "returning" flow: pre-seeded exhibitor "Sarah Thompson"
 *     (sarah.thompson@example.com) with password + a pre-registered dog.
 *   - For "new" flow: wipes any prior Sarah Thompson + dogs so the
 *     register→onboarding walk starts from true zero.
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
import { generateShowSlug } from '@/lib/slugify.js';
import { drawBackCoverPage } from '@/lib/pdf-pad.js';

// ─── Config ──────────────────────────────────────────────────────────────

const BASE_URL = process.env.GUIDE_BASE_URL ?? 'http://localhost:3000';
const GUIDE_EMAIL = 'sarah.thompson@example.com';
const GUIDE_PASSWORD = 'Remi-Guide-2026!';
const GUIDE_NAME = 'Sarah Thompson';
const GUIDE_ADDRESS = '14 Primrose Lane, Bristol';
const GUIDE_POSTCODE = 'BS1 4QA';

const DEMO_ORG_NAME = 'Thornfield Canine Society';
const DEMO_SHOW_NAME = 'Thornfield Summer Open Show';
const DEMO_SECRETARY_NAME = 'Margaret Ashcroft';
const DEMO_SECRETARY_EMAIL = 'secretary@thornfield.example.com';

// Must match in both the seed insert (so the row exists) and the click
// selector (so Playwright can pick the card). Rename here once.
const GUIDE_DOG_NAME = 'Meadowbank Blue Belle';
const GUIDE_DOG_BREED = 'Labrador Retriever';

const VIEWPORT = { width: 390, height: 844 } as const;
const DEVICE_SCALE = 2;

const OUT_DIR = join(process.cwd(), 'scripts', 'output');
const FRAMES_ROOT = join(OUT_DIR, 'exhibitor-guide-frames');

type Flow = 'new' | 'returning';

// ─── Step recorder ───────────────────────────────────────────────────────

type Step = { name: string; file: string; caption: string; body: string };

const HIDE_CHROME_CSS = `
  nextjs-portal, [data-nextjs-scroll-focus-boundary],
  [aria-label*="Next.js" i], [data-nextjs-toast], [id^="__next-dev-tools"],
  [data-feedback-widget], [data-help-widget],
  button[aria-label*="help" i], button[aria-label*="feedback" i] {
    display: none !important; visibility: hidden !important;
  }
`;

function makeRecorder(framesDir: string) {
  const steps: Step[] = [];

  async function record(page: Page, name: string, caption: string, body: string) {
    await page.addStyleTag({ content: HIDE_CHROME_CSS }).catch(() => {});
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior }));
    await page.waitForTimeout(350);
    const file = `${String(steps.length + 1).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: join(framesDir, file), fullPage: false });
    steps.push({ name, file, caption, body });
    console.log(`  📸 ${file}  — ${caption}`);
  }

  return { steps, record };
}

async function dismissCookieBanner(page: Page) {
  await page.getByRole('button', { name: /^accept/i }).click({ timeout: 500 }).catch(() => {});
}

// Wrap load-bearing clicks/fills so silent misses surface as warnings.
// Previous screenshot already captured the screen before the action, so the
// step where the failure mattered is still in the output — this just tells
// the operator to check.
async function mustClick(locator: ReturnType<Page['getByText']>, label: string) {
  try {
    await locator.click({ timeout: 5_000 });
  } catch (err) {
    console.warn(`  ⚠ Failed to click "${label}" — subsequent screenshot may be wrong. ${(err as Error).message}`);
  }
}

async function mustFill(locator: ReturnType<Page['getByLabel']>, value: string, label: string) {
  try {
    await locator.fill(value, { timeout: 5_000 });
  } catch (err) {
    console.warn(`  ⚠ Failed to fill "${label}" — subsequent screenshot may be missing that value. ${(err as Error).message}`);
  }
}

// ─── Seeding ─────────────────────────────────────────────────────────────

async function ensureDemoOrgAndShow() {
  if (!db) throw new Error('No DB connection — is DATABASE_URL set in .env?');

  // Org
  let [org] = await db
    .select({ id: s.organisations.id })
    .from(s.organisations)
    .where(eq(s.organisations.name, DEMO_ORG_NAME))
    .limit(1);

  if (!org) {
    const id = crypto.randomUUID();
    await db.insert(s.organisations).values({
      id,
      name: DEMO_ORG_NAME,
      contactEmail: DEMO_SECRETARY_EMAIL,
    });
    org = { id };
    console.log(`✓ Created demo org "${DEMO_ORG_NAME}"`);
  }

  // Show — 56 days out so the "closes in N days" badge stays sensible
  let [show] = await db
    .select({ id: s.shows.id, slug: s.shows.slug })
    .from(s.shows)
    .where(eq(s.shows.name, DEMO_SHOW_NAME))
    .orderBy(desc(s.shows.createdAt))
    .limit(1);

  if (!show) {
    const showId = crypto.randomUUID();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 56);
    const startDateStr = startDate.toISOString().slice(0, 10);
    const closeDate = new Date();
    closeDate.setDate(closeDate.getDate() + 42);
    const slug = generateShowSlug(DEMO_SHOW_NAME, startDateStr);

    await db.insert(s.shows).values({
      id: showId,
      name: DEMO_SHOW_NAME,
      slug,
      showType: 'open',
      showScope: 'general',
      organisationId: org.id,
      startDate: startDateStr,
      endDate: startDateStr,
      startTime: '10:00',
      status: 'entries_open',
      entriesOpenDate: new Date(),
      entryCloseDate: closeDate,
      postalCloseDate: closeDate,
      kcLicenceNo: '2026/EXAMPLE',
      description:
        'An all-breeds open show hosted by Thornfield Canine Society. Puppy through Open classes, friendly atmosphere, new exhibitors welcome.',
      secretaryName: DEMO_SECRETARY_NAME,
      secretaryEmail: DEMO_SECRETARY_EMAIL,
      showOpenTime: '08:30',
      acceptsPostalEntries: false,
      firstEntryFee: 800,       // £8
      subsequentEntryFee: 500,  // £5
      nfcEntryFee: 400,          // £4
      classSexArrangement: 'separate_sex',
    });

    // A handful of generic classes covering the common age bands.
    const classDefs = await db
      .select()
      .from(s.classDefinitions)
      .where(inArray(s.classDefinitions.name, ['Puppy', 'Junior', 'Novice', 'Open']));

    let sortOrder = 0;
    for (const sex of ['dog', 'bitch'] as const) {
      for (const def of classDefs) {
        await db.insert(s.showClasses).values({
          showId,
          classDefinitionId: def.id,
          sex,
          entryFee: 800,
          sortOrder: sortOrder++,
        });
      }
    }

    show = { id: showId, slug };
    console.log(`✓ Seeded demo show "${DEMO_SHOW_NAME}" (slug=${slug})`);
  }

  if (!show.slug) throw new Error('Demo show has no slug — unexpected');
  return { id: show.id, slug: show.slug };
}

async function wipeExhibitor() {
  if (!db) throw new Error('no db');
  const [existing] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(ilike(s.users.email, GUIDE_EMAIL))
    .limit(1);
  if (!existing) return;

  // Dogs owned by Sarah → entries → entry_classes (entries cascade the
  // latter via schema, but keep explicit for belt-and-braces on old rows).
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

  // Remaining user-scoped rows have no FK dependency on each other, so
  // batch in parallel. Must finish before the users DELETE.
  await Promise.all([
    db.delete(s.entries).where(eq(s.entries.exhibitorId, existing.id)),
    db.delete(s.orders).where(eq(s.orders.exhibitorId, existing.id)),
    db.delete(s.accounts).where(eq(s.accounts.userId, existing.id)),
    db.delete(s.sessions).where(eq(s.sessions.userId, existing.id)),
  ]);
  await db.delete(s.users).where(eq(s.users.id, existing.id));
}

async function seedReturningExhibitor() {
  if (!db) throw new Error('no db');
  await wipeExhibitor();

  const passwordHash = await bcryptHash(GUIDE_PASSWORD, 10);
  const id = crypto.randomUUID();
  await db.insert(s.users).values({
    id,
    email: GUIDE_EMAIL,
    name: GUIDE_NAME,
    passwordHash,
    role: 'exhibitor',
    emailVerified: new Date(),
    onboardingCompletedAt: new Date(),
    address: GUIDE_ADDRESS,
    postcode: GUIDE_POSTCODE,
  });

  await seedGuideDogForExhibitor();
  console.log(`✓ Seeded returning exhibitor ${GUIDE_EMAIL} with a pre-registered dog`);
}

async function seedGuideDogForExhibitor() {
  if (!db) throw new Error('no db');
  const [user] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(ilike(s.users.email, GUIDE_EMAIL))
    .limit(1);
  if (!user) throw new Error(`Guide exhibitor ${GUIDE_EMAIL} not found — onboarding may not have completed`);

  // Skip if Sarah already has a dog (idempotent re-runs).
  const existingDog = await db
    .select({ id: s.dogs.id })
    .from(s.dogs)
    .where(eq(s.dogs.ownerId, user.id))
    .limit(1);
  if (existingDog.length > 0) return;

  const [lab] = await db
    .select({ id: s.breeds.id })
    .from(s.breeds)
    .where(ilike(s.breeds.name, GUIDE_DOG_BREED))
    .limit(1);
  if (!lab) throw new Error(`${GUIDE_DOG_BREED} breed row missing — expected seeded`);

  await db.insert(s.dogs).values({
    id: crypto.randomUUID(),
    registeredName: GUIDE_DOG_NAME,
    breedId: lab.id,
    sex: 'bitch',
    dateOfBirth: '2023-06-20',
    breederName: 'Example Kennels',
    colour: 'Yellow',
    ownerId: user.id,
  });
}

// ─── Flows ───────────────────────────────────────────────────────────────

async function walkReturning(
  context: BrowserContext,
  show: { slug: string },
  record: ReturnType<typeof makeRecorder>['record'],
) {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('domcontentloaded');
  await dismissCookieBanner(page);

  await record(page, 'home', 'Start at remishowmanager.co.uk',
    'This is the Remi home page. Tap "Find a show" to browse what\'s coming up.');

  await page.goto(`${BASE_URL}/shows`);
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'shows-list', 'Browse upcoming shows',
    'Every show open for entries appears here. Tap a show card to read the full schedule and enter online.');

  await page.goto(`${BASE_URL}/shows/${show.slug}`);
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'show-detail', 'Read the show details',
    'Each show page lists the schedule, judges, classes on offer, and the closing date. Scroll down and tap "Enter this show" when you\'re ready.');

  await page.goto(
    `${BASE_URL}/login?callbackUrl=${encodeURIComponent(`/shows/${show.slug}/enter`)}`,
  );
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'login', 'Sign in to your Remi account',
    'Enter your email and password, or tap "Send sign-in link" to have Remi email you a one-tap link.');

  await page.getByRole('button', { name: /sign in with password/i }).click({ timeout: 5_000 }).catch(() => {});
  await page.getByLabel(/email address/i).fill(GUIDE_EMAIL);
  await page.waitForSelector('input[type="password"]:visible', { timeout: 5_000 });
  await page.getByLabel(/^password$/i).fill(GUIDE_PASSWORD);
  await record(page, 'login-filled', 'Type in your details and tap Sign in',
    'Remi remembers you on this device — you won\'t need to sign in again next time, unless you clear your browser.');
  await page.getByRole('button', { name: /^sign in$/i }).click();

  await page.waitForURL(new RegExp(`/shows/${show.slug}/enter`), { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await runEntryWizard(page, record);
  await page.close();
}

async function walkNew(
  context: BrowserContext,
  show: { slug: string },
  record: ReturnType<typeof makeRecorder>['record'],
) {
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('domcontentloaded');
  await dismissCookieBanner(page);
  await record(page, 'home', 'Start at remishowmanager.co.uk',
    'This is the Remi home page. Tap "Create Your Free Account" to sign up.');

  await page.goto(`${BASE_URL}/register`);
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'register-empty', 'Create your free account',
    'Enter your email address. You can choose to set a password (best for exhibitors who don\'t always have email to hand), or let Remi email you a sign-in link each time.');

  await page.getByLabel(/email address/i).fill(GUIDE_EMAIL);
  await page.getByLabel(/set a password/i).check({ force: true });
  await page.waitForSelector('#password', { timeout: 3_000 });
  await page.locator('#password').fill(GUIDE_PASSWORD);
  await page.locator('#confirm-password').fill(GUIDE_PASSWORD);
  await record(page, 'register-filled', 'Fill in your email and password',
    'Passwords must be at least 8 characters. Tap "Create account" when you\'re ready — Remi will sign you in immediately and take you to the welcome screen.');

  await mustClick(page.getByRole('button', { name: /^create account$/i }), 'Create account');
  await page.waitForURL(/\/onboarding/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  await record(page, 'onboarding-welcome', 'Welcome to Remi',
    'Tell Remi what you\'re here for. "Enter shows" is the right choice for exhibitors. (You can change this later in Settings if you decide to host shows too.)');

  await mustClick(page.getByText(/i want to enter my dogs in shows|enter shows/i).first(), 'Enter shows');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  await record(page, 'onboarding-profile', 'Your details',
    'The RKC requires your full name and address on every entry form, so Remi stores them once and fills them in for you. You can edit these any time from Settings.');

  await mustFill(page.getByLabel(/^full name$/i).first(), GUIDE_NAME, 'Full name');
  // Postcode lookup is an external API — click "Enter manually" to bypass
  // if the form offers it (optional — direct-input fallback works either way).
  const enterManuallyBtn = page.getByRole('button', { name: /enter manually|manual/i });
  if (await enterManuallyBtn.isVisible().catch(() => false)) {
    await enterManuallyBtn.click({ timeout: 2_000 }).catch(() => {});
  }
  await mustFill(page.getByLabel(/address/i).first(), GUIDE_ADDRESS, 'Address');
  await mustFill(page.getByLabel(/postcode/i).first(), GUIDE_POSTCODE, 'Postcode');
  await record(page, 'onboarding-profile-filled', 'Fill in your details',
    'Name, address, postcode — then tap Continue. Remi keeps these to hand so you never fill them in again.');

  await mustClick(page.getByRole('button', { name: /save.*continue|continue|save/i }).first(), 'Save & Continue (profile)');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  await record(page, 'onboarding-dog-empty', 'Add your first dog',
    'Enter your dog\'s RKC registered name, breed, date of birth and sex. If your dog is registered with the RKC, you can paste their registration number and tap "Lookup on RKC Website" to auto-fill the pedigree. You can also tap "Skip for now" and add your dogs later from the My Dogs page.');

  // Skip the form — reliably filling the calendar + breed combobox + sex
  // select in a headless walkthrough is fragile, and the "Skip for now"
  // button here genuinely mirrors a real user's option. We inject the
  // demo dog into the DB after onboarding completes so the Entry wizard
  // has a dog to pick.
  await mustClick(page.getByRole('button', { name: /skip for now/i }), 'Skip dog for now');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  await record(page, 'onboarding-done', 'You\'re all set',
    'Account ready. Tap "Find a show" to start browsing. (Remember to add your dogs from the menu before you try to enter one!)');

  // Seed the demo dog silently now that onboarding has finished — so the
  // "returning user" section of the entry flow can proceed with a
  // populated dog list.
  await seedGuideDogForExhibitor();

  await page.goto(`${BASE_URL}/shows`);
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'shows-list', 'Browse upcoming shows',
    'Every show open for entries appears here. Tap a show card to read the full schedule and enter online.');

  await page.goto(`${BASE_URL}/shows/${show.slug}`);
  await page.waitForLoadState('domcontentloaded');
  await record(page, 'show-detail', 'Read the show details',
    'Check the date, venue, judges, and the list of classes. Scroll down and tap "Enter this show" when you\'re ready.');

  await page.goto(`${BASE_URL}/shows/${show.slug}/enter`);
  await page.waitForLoadState('networkidle');
  await runEntryWizard(page, record);
  await page.close();
}

// The entry-wizard tail is shared by both flows from the /enter page onwards.
async function runEntryWizard(
  page: Page,
  record: ReturnType<typeof makeRecorder>['record'],
) {
  const typeHeading = page.getByText(/what type of entry/i).first();
  if (await typeHeading.isVisible().catch(() => false)) {
    await record(page, 'entry-type', 'Choose your entry type',
      'Standard breed entry is the right answer for most exhibitors. Junior Handler is for young handlers being judged on handling skill rather than the dog.');
    await mustClick(page.getByText(/enter a dog/i).first(), 'Enter a Dog');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
  }

  await record(page, 'dog-step', 'Pick the dog you\'re entering',
    'Remi shows every dog registered to your account. Tap the one you\'re entering. Need to register another? "+ Add a new dog" takes you to the dog form.');

  // Selecting the dog card auto-advances the wizard via the cart's
  // step-transition on selection — no separate "Continue" tap needed.
  await mustClick(page.getByText(GUIDE_DOG_NAME).first(), 'Dog card');
  await page.waitForLoadState('networkidle');

  await record(page, 'classes-step', 'Choose the classes to enter',
    'Tick every class you\'d like to enter. Remi lists the age and achievement classes your dog qualifies for, based on their date of birth and show record.');

  const classCheckboxes = page.getByRole('checkbox');
  const classCount = Math.min(2, await classCheckboxes.count());
  for (let i = 0; i < classCount; i++) {
    try {
      await classCheckboxes.nth(i).check({ force: true });
    } catch (err) {
      console.warn(`  ⚠ Could not tick class checkbox ${i + 1}: ${(err as Error).message}`);
    }
  }
  await record(page, 'classes-picked', 'Two classes selected',
    'In this example, Belle is entered in two classes. The running total updates at the bottom of the screen.');

  await mustClick(page.getByRole('button', { name: /add to cart|update/i }).first(), 'Add to Cart');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await record(page, 'cart-review', 'Review your entries',
    'Last chance to check everything before paying. Remi shows the full RKC declaration — tick to agree, then move to payment.');

  const declaration = page.getByText(/i agree to the above declaration/i);
  await declaration.scrollIntoViewIfNeeded().catch(() => {});
  await mustClick(declaration, 'RKC declaration checkbox');
  await page.waitForTimeout(300);

  await mustClick(
    page.getByRole('button', { name: /proceed to payment|confirm entry/i }).first(),
    'Proceed to Payment',
  );
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
  await record(page, 'payment-step', 'Enter your card details',
    'Your card is charged securely by Stripe. Remi never sees or stores your full card number. The £1 + 1% handling fee covers payment processing and the transfer to the host club.');
}

// ─── PDF stitching ───────────────────────────────────────────────────────

const TITLES: Record<Flow, { headline: string; tagline: string; contents: string[] }> = {
  new: {
    headline: 'Getting started with Remi',
    tagline: 'From signing up to entering your first show — step by step.',
    contents: [
      'Creating your free account',
      'Adding your first dog',
      'Finding a show',
      'Choosing classes',
      'Reviewing and paying',
    ],
  },
  returning: {
    headline: 'Entering a show',
    tagline: 'For exhibitors with a Remi account and a dog already registered.',
    contents: [
      'Signing in',
      'Finding a show',
      'Picking your dog',
      'Choosing classes',
      'Reviewing and paying',
    ],
  },
};

async function stitchPdf(flow: Flow, steps: Step[], framesDir: string, outPath: string) {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 48;

  const primary = rgb(0x2d / 255, 0x5f / 255, 0x3f / 255);
  const ink = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.4, 0.4, 0.44);
  const cream = rgb(0.96, 0.95, 0.92);
  const { headline, tagline, contents } = TITLES[flow];

  const brandingDir = join(process.cwd(), 'public', 'branding');
  const logo = await pdf.embedPng(readFileSync(join(brandingDir, 'remi-horizontal.png')));

  // Returns the rendered height so callers can position elements below.
  function drawCenteredLogo(page: ReturnType<typeof pdf.addPage>, maxWidth: number, topY: number) {
    const scale = maxWidth / logo.width;
    const w = logo.width * scale;
    const h = logo.height * scale;
    page.drawImage(logo, {
      x: (PAGE_W - w) / 2,
      y: topY - h,
      width: w,
      height: h,
    });
    return h;
  }

  // ── Cover ────────────────────────────────────────────────────────
  const cover = pdf.addPage([PAGE_W, PAGE_H]);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: cream });

  const logoH = drawCenteredLogo(cover, (PAGE_W - MARGIN * 2) * 0.75, PAGE_H - 80);
  const headlineY = PAGE_H - 100 - logoH - 40;
  cover.drawText(headline, {
    x: MARGIN, y: headlineY, size: 28, font: helvBold, color: ink,
  });
  cover.drawText(tagline, {
    x: MARGIN, y: headlineY - 32, size: 13, font: helv, color: muted,
  });

  const tocY = headlineY - 90;
  cover.drawText('What\'s inside', {
    x: MARGIN, y: tocY, size: 16, font: helvBold, color: ink,
  });
  contents.forEach((line, i) => {
    cover.drawText(`${i + 1}.  ${line}`, {
      x: MARGIN + 8, y: tocY - 30 - i * 22, size: 13, font: helv, color: ink,
    });
  });
  cover.drawText('remishowmanager.co.uk', { x: MARGIN, y: 48, size: 11, font: helv, color: muted });

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const image = await pdf.embedPng(readFileSync(join(framesDir, step.file)));
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

    page.drawRectangle({
      x: x - 2, y: y - 2, width: w + 4, height: h + 4, color: rgb(0.9, 0.9, 0.92),
    });
    page.drawImage(image, { x, y, width: w, height: h });

    page.drawText(`${i + 1} of ${steps.length}`, {
      x: PAGE_W - MARGIN - 40, y: 24, size: 10, font: helv, color: muted,
    });
    page.drawText(`Remi — ${headline}`, {
      x: MARGIN, y: 24, size: 10, font: helv, color: muted,
    });
  }

  // ── "Need a hand?" contact page ──────────────────────────────────
  const outro = pdf.addPage([PAGE_W, PAGE_H]);
  outro.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: cream });
  const smallLogoH = drawCenteredLogo(outro, 180, PAGE_H - 80);
  outro.drawText('Need a hand?', {
    x: MARGIN, y: PAGE_H - 180 - smallLogoH, size: 28, font: helvBold, color: ink,
  });
  const outroLines = [
    'If you get stuck at any point, we\'re here to help.',
    '',
    'Email:  support@remishowmanager.co.uk',
    'Website:  remishowmanager.co.uk',
    '',
    'Every Remi email has a reply-to address that goes straight to our team.',
    'Just reply — we read every one.',
  ];
  outroLines.forEach((line, i) => {
    outro.drawText(line, { x: MARGIN, y: PAGE_H - 240 - smallLogoH - i * 20, size: 13, font: helv, color: ink });
  });

  // ── Back cover — shared brand artwork page from pdf-pad.ts ───────
  // Gives us the cached JPEG load + the consistent letterbox layout we
  // use on catalogues and schedules.
  const back = pdf.addPage([PAGE_W, PAGE_H]);
  await drawBackCoverPage(pdf, back, { width: PAGE_W, height: PAGE_H });

  const bytes = await pdf.save();
  writeFileSync(outPath, bytes);
  console.log(`✓ Guide written to ${outPath} (${(bytes.length / 1024).toFixed(0)} KB, ${steps.length} steps)`);
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

function parseFlow(): Flow[] {
  const arg = process.argv.find((a) => a.startsWith('--flow='))?.split('=')[1];
  if (arg === 'new') return ['new'];
  if (arg === 'returning') return ['returning'];
  if (arg === 'both') return ['new', 'returning'];
  return ['returning'];
}

async function runFlow(flow: Flow, show: { slug: string }) {
  console.log(`\n═══ Flow: ${flow} ═══`);
  const framesDir = join(FRAMES_ROOT, flow);
  const outPath = join(OUT_DIR, `exhibitor-guide-${flow}.pdf`);
  if (existsSync(framesDir)) rmSync(framesDir, { recursive: true });
  mkdirSync(framesDir, { recursive: true });

  if (flow === 'new') {
    await wipeExhibitor();
  } else {
    await seedReturningExhibitor();
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      isMobile: true,
    });
    const { steps, record } = makeRecorder(framesDir);

    if (flow === 'new') {
      await walkNew(context, show, record);
    } else {
      await walkReturning(context, show, record);
    }

    await stitchPdf(flow, steps, framesDir, outPath);
  } finally {
    await browser.close();
  }
}

async function main() {
  const flows = parseFlow();
  mkdirSync(OUT_DIR, { recursive: true });

  console.log('→ Ensuring demo org + show…');
  const show = await ensureDemoOrgAndShow();

  for (const flow of flows) {
    await runFlow(flow, show);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
