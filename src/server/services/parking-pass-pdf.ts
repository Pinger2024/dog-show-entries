/**
 * Single source of truth for rendering a parking-pass PDF from an order id.
 * Both the download route (src/app/api/parking-pass/[orderId]/route.ts) and
 * the email sender (sendParkingPassEmail in email.ts) call THIS function —
 * never renderToBuffer directly — so the attached PDF and the downloadable
 * one can never drift (same lesson as the catalogue's two-render-paths
 * trap; see reference_catalogue_two_render_paths).
 */
import { eq } from 'drizzle-orm';
import { renderToBuffer } from '@react-pdf/renderer';
import { db } from '@/server/db';
import { orders } from '@/server/db/schema';
import { publicOrgColumns } from '@/server/trpc/public-org-columns';
import { isParkingSundry } from '@/lib/parking-utils';
import { sanitizeFilename } from '@/lib/slugify';
import { stripUnembeddedBase14Fonts } from '@/lib/pdf-pad';
import { ParkingPassPdf, type ParkingPassPdfData } from '@/components/parking-pass/parking-pass-pdf';

export type GeneratedParkingPass = {
  buffer: Buffer;
  filename: string;
  quantity: number;
  order: {
    id: string;
    exhibitor: { name: string | null; email: string | null } | null;
    show: { id: string; name: string; slug: string | null };
  };
};

/**
 * Load an order, work out how many parking passes it paid for, and render
 * the PDF. Returns `null` when the order doesn't exist or genuinely has no
 * parking sundry — callers turn that into a 404 (route) or a silent no-op
 * (cron/email), never an error.
 */
export async function generateParkingPassPdf(orderId: string): Promise<GeneratedParkingPass | null> {
  if (!db) return null;

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      exhibitor: { columns: { name: true, email: true } },
      show: {
        with: {
          venue: { columns: { name: true, address: true, postcode: true } },
          organisation: { columns: publicOrgColumns },
        },
      },
      orderSundryItems: {
        with: { sundryItem: { columns: { name: true } } },
      },
    },
  });

  if (!order) return null;

  const quantity = (order.orderSundryItems ?? [])
    .filter((osi) => osi.sundryItem?.name && isParkingSundry(osi.sundryItem.name))
    .reduce((sum, osi) => sum + osi.quantity, 0);

  if (quantity <= 0) return null;

  const data: ParkingPassPdfData = {
    showName: order.show.name,
    organisationName: order.show.organisation?.name ?? null,
    showDate: order.show.startDate,
    showEndDate: order.show.endDate,
    venueName: order.show.venue?.name ?? null,
    venueAddress: order.show.venue?.address ?? null,
    venuePostcode: order.show.venue?.postcode ?? null,
    exhibitorName: order.exhibitor?.name ?? 'Exhibitor',
    orderRef: order.id.slice(0, 8).toUpperCase(),
    quantity,
  };

  // Call the component as a plain function (like generateJudgeContractPdf
  // does) rather than React.createElement — that returns the raw <Document>
  // element the function's body produces, which types cleanly against
  // renderToBuffer's ReactElement<DocumentProps> signature. Wrapping via
  // createElement instead produces a FunctionComponentElement<Props> that
  // TypeScript can't reconcile with DocumentProps (a pre-existing mismatch
  // visible throughout pdf-generation.ts).
  const rawBuffer = await renderToBuffer(ParkingPassPdf({ data }));
  const buffer = Buffer.from(await stripUnembeddedBase14Fonts(rawBuffer));
  const filename = `${sanitizeFilename(order.show.name)}-Parking-Pass.pdf`;

  return {
    buffer,
    filename,
    quantity,
    order: {
      id: order.id,
      exhibitor: order.exhibitor,
      show: { id: order.show.id, name: order.show.name, slug: order.show.slug },
    },
  };
}
