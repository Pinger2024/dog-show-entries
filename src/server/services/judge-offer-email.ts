/**
 * The judge's offer email — ONE renderer, called by every path that sends an
 * offer (secretary.sendJudgeOffer, sendBulkJudgeOffers and resendJudgeOffer).
 * Those three used to hand-build their own HTML, and each said something
 * different: the bulk offer had no Classification, Show Type, expenses or the
 * RKC "formal written offer" sentence; the reminder dropped the secretary's
 * notes and the expenses already on the contract; and none of them escaped
 * what a person had typed. Built with the `html` tag
 * (src/lib/html-escape.ts) so every value a person typed is escaped.
 *
 * Also owns how a send path works out the appointment's breed line,
 * classification line and standard terms, so all three agree:
 * `judgeOfferShowWith` (what to load with the show) and `judgeOfferDetails`.
 *
 * The standard terms are rendered from the copy stored on the contract
 * (`judge_contracts.offer_terms`) — the send path stores them first, then
 * renders what it stored. The words belong to src/lib/judge-offer-terms.ts.
 */
import { html, rawHtml } from '@/lib/html-escape';
import { BRAND } from '@/lib/brand';
import { formatCurrency } from '@/lib/date-utils';
import { displayShowTypeLabel } from '@/lib/show-types';
import {
  buildJudgeBreedAndClassification,
  showBreedNamesForJudging,
  type JudgeAssignmentForClassification,
} from '@/lib/judge-breed-classification';
import {
  judgeOfferTerms,
  readStoredJudgeOfferTerms,
  SOCIETY_TERMS_HEADING,
  type JudgeOfferTerms,
} from '@/lib/judge-offer-terms';
import { emailHeader } from './email';

/** What every offer path loads with the show. Only the club's name — never the
 *  full organisation row. */
export const judgeOfferShowWith = {
  venue: true,
  organisation: { columns: { name: true } },
  breed: true,
  showClasses: { with: { breed: true } },
} as const;

export interface JudgeOfferShow {
  name: string;
  startDate: string | Date;
  showType: string | null;
  showRuleset?: string | null;
  venue?: { name: string; postcode?: string | null } | null;
  organisation?: { name: string } | null;
  breed?: { name: string } | null;
  showClasses?: { breed?: { name: string } | null }[];
}

/** The breed line, classification line and standard terms for one judge's offer. */
export function judgeOfferDetails(
  show: JudgeOfferShow,
  assignments: JudgeAssignmentForClassification[],
): { breedLine: string; classificationLine: string; terms: JudgeOfferTerms | null } {
  const { breedLine, classificationLine, breedNames } = buildJudgeBreedAndClassification(
    assignments,
    showBreedNamesForJudging(show),
    show.name,
  );
  const terms = judgeOfferTerms({
    showType: show.showType,
    showRuleset: show.showRuleset ?? null,
    breedNames,
  });
  return { breedLine, classificationLine, terms };
}

export interface JudgeOfferEmailInput {
  /** 'offer' = the first email; 'reminder' = resendJudgeOffer. */
  kind: 'offer' | 'reminder';
  show: JudgeOfferShow;
  contract: {
    judgeName: string;
    notes: string | null;
    hotelCost: number | null;
    travelCost: number | null;
    otherExpenses: number | null;
    expenseNotes: string | null;
    tokenExpiresAt: Date | null;
    /** The stored copy, `judge_contracts.offer_terms`. */
    offerTerms: unknown;
  };
  breedLine: string;
  classificationLine: string;
  /** The judge's accept page, without ?action. */
  acceptUrl: string;
}

const cellLabel = `padding: 10px 12px; border-bottom: 1px solid ${BRAND.line}; font-weight: 600; color: ${BRAND.ink}; width: 120px;`;
const cellValue = `padding: 10px 12px; border-bottom: 1px solid ${BRAND.line}; color: ${BRAND.ink};`;
const para = `font-size: 15px; color: ${BRAND.ink}; line-height: 1.6;`;

function row(label: string, value: string) {
  return html`<tr>
            <td style="${cellLabel}">${label}</td>
            <td style="${cellValue}">${value}</td>
          </tr>`;
}

function expensesText(c: JudgeOfferEmailInput['contract']): string | null {
  const parts: string[] = [];
  if (c.hotelCost && c.hotelCost > 0) parts.push(`Hotel: ${formatCurrency(c.hotelCost)}`);
  if (c.travelCost && c.travelCost > 0) parts.push(`Travel: ${formatCurrency(c.travelCost)}`);
  if (c.otherExpenses && c.otherExpenses > 0) parts.push(`Other: ${formatCurrency(c.otherExpenses)}`);
  if (parts.length === 0) return null;
  return parts.join(', ') + (c.expenseNotes ? ` (${c.expenseNotes})` : '');
}

function termsBlock(terms: JudgeOfferTerms | null) {
  if (!terms) return '';
  return html`
        <div style="margin: 24px 0; padding: 16px; border: 1px solid ${BRAND.line}; border-radius: 10px;">
          ${terms.invitationParagraphs.map((p) => html`<p style="${para} margin: 0 0 12px;">${p}</p>`)}
          ${terms.societyTerms.length > 0 ? html`
          <p style="${para} margin: 16px 0 8px; font-weight: 700;">${SOCIETY_TERMS_HEADING}</p>
          <ol style="margin: 0 0 12px; padding-left: 22px;">
            ${terms.societyTerms.map((t) => html`<li style="${para} margin-bottom: 8px;">${t}</li>`)}
          </ol>` : ''}
          ${terms.alreadyAgreedNotice ? html`<p style="${para} margin: 12px 0 0;">${terms.alreadyAgreedNotice}</p>` : ''}
        </div>`;
}

/** The judge's offer email: subject and HTML. */
export function renderJudgeOfferEmail(input: JudgeOfferEmailInput): { subject: string; html: string } {
  const { show, contract, kind } = input;
  const orgName = show.organisation?.name ?? 'the Show Society';
  const showDate = new Date(show.startDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const venue = show.venue
    ? `${show.venue.name}${show.venue.postcode ? `, ${show.venue.postcode}` : ''}`
    : 'Venue TBC';
  // A regional is stored as `championship`; the label owner prints "Regional".
  const showTypeText = show.showType ? displayShowTypeLabel(show.showType, show.showRuleset) : null;
  const expenses = expensesText(contract);
  const terms = readStoredJudgeOfferTerms(contract.offerTerms);
  const expiry = contract.tokenExpiresAt
    ? contract.tokenExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const subject = kind === 'reminder' ? `Reminder: Judging Offer — ${show.name}` : `Judging Offer — ${show.name}`;

  const body = html`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.paper}; font-family: 'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">

    ${rawHtml(emailHeader())}

    <div style="background: #ffffff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

      <div style="background: ${BRAND.deep}; padding: 24px 24px 20px; text-align: center;">
        <h2 style="margin: 0; color: ${BRAND.cream}; font-size: 22px; font-weight: 700;">Judging Appointment Offer</h2>
        <p style="margin: 8px 0 0; color: rgba(243, 236, 220, 0.78); font-size: 14px;">
          ${kind === 'reminder' ? 'Reminder from' : 'from'} ${orgName}
        </p>
      </div>

      <div style="padding: 24px;">
        <p style="${para}">Dear ${contract.judgeName},</p>
        ${kind === 'reminder'
          ? html`<p style="${para}">This is a reminder regarding our invitation for you to judge at our show. We would be delighted if you could confirm your acceptance at your earliest convenience.</p>`
          : html`<p style="${para}">On behalf of ${orgName}, I have much pleasure in inviting you to judge at our forthcoming show. The details are as follows:</p>`}

        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          ${row('Show', show.name)}
          ${row('Date', showDate)}
          ${row('Venue', venue)}
          ${row('Breed', input.breedLine)}
          ${row('Classification', input.classificationLine)}
          ${showTypeText ? row('Show Type', showTypeText) : ''}
          ${expenses ? row('Expenses', expenses) : ''}
        </table>

        ${contract.notes ? html`<p style="font-size: 14px; color: ${BRAND.ink2}; line-height: 1.6; padding: 12px; background: ${BRAND.paper}; border-radius: 8px;">${contract.notes}</p>` : ''}

        ${termsBlock(terms)}

        <p style="${para}">
          If you are willing to accept this appointment, please confirm by clicking the button below. This constitutes the formal written offer as required under Royal Kennel Club regulations.
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${input.acceptUrl}?action=accept"
             style="display: inline-block; background: ${BRAND.green}; color: ${BRAND.cream}; padding: 14px 32px; border-radius: 13px; font-size: 16px; font-weight: 700; text-decoration: none; margin-bottom: 12px;">
            Accept Appointment
          </a>
          <br>
          <a href="${input.acceptUrl}?action=decline"
             style="display: inline-block; color: ${BRAND.ink2}; padding: 8px 16px; font-size: 13px; text-decoration: underline; margin-top: 8px;">
            Decline
          </a>
        </div>

        ${expiry ? html`<p style="font-size: 13px; color: ${BRAND.ink2}; line-height: 1.5; text-align: center;">This link will expire on ${expiry}.</p>` : ''}
      </div>
    </div>

    <div style="text-align: center; padding: 24px 16px; font-size: 12px; color: ${BRAND.ink2};">
      <p style="margin: 0;">
        This offer was sent by <strong>Remi</strong> on behalf of ${orgName}.
      </p>
      <p style="margin: 8px 0 0;">
        If you have any questions, please reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html: body.toString() };
}
