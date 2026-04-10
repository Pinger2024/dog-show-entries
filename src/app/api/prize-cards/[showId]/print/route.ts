import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns an HTML wrapper page that embeds the prize-card PDF and
 * auto-triggers the browser's print dialog on load.
 *
 * Why this exists: mobile Safari hides "Print" under the share sheet when
 * viewing a raw PDF, so secretaries on iPads/iPhones can't find how to print.
 * An HTML page with a `window.print()` call on load sidesteps Safari's PDF
 * viewer entirely and brings up the OS print dialog directly.
 *
 * This route serves a fully static HTML shell — no DB lookup, no auth check.
 * The embedded iframe points at `/api/prize-cards/[showId]?preview=1`, which
 * does its own auth + data fetch, so anyone hitting this wrapper without a
 * valid session just gets an empty iframe. Nothing sensitive leaks from the
 * wrapper itself (it doesn't contain the show name, entries, or any PII).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const { showId } = await params;

  // Forward all the PDF customisation params (placements, judge, style) to
  // the underlying PDF route. `preview` ensures inline Content-Disposition
  // so the iframe embeds the PDF rather than triggering a download.
  const searchParams = request.nextUrl.searchParams;
  const forwarded = new URLSearchParams();
  for (const key of ['placements', 'judge', 'style']) {
    const value = searchParams.get(key);
    if (value !== null) forwarded.set(key, value);
  }
  forwarded.set('preview', '1');
  const pdfHref = `/api/prize-cards/${showId}?${forwarded.toString()}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Print Prize Cards — Remi</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100vh; background: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    iframe { border: 0; width: 100%; height: 100vh; display: block; }
    .fallback {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      padding: 24px 32px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      max-width: 360px;
    }
    .fallback h1 { font-size: 18px; margin: 0 0 8px; color: #1a1a1a; }
    .fallback p { font-size: 14px; margin: 0 0 16px; color: #555; line-height: 1.5; }
    .fallback button {
      background: #2D5F3F;
      color: #fff;
      border: 0;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    .fallback button:hover { background: #244c33; }
  </style>
</head>
<body>
  <iframe id="pdfFrame" src="${pdfHref}" title="Prize Cards"></iframe>
  <div class="fallback" id="fallback" style="display:none">
    <h1>Ready to print</h1>
    <p>Tap the button below to open the print dialog.</p>
    <button id="printBtn" type="button">Print Prize Cards</button>
  </div>
  <script>
    (function () {
      var frame = document.getElementById('pdfFrame');
      var fallback = document.getElementById('fallback');
      var printBtn = document.getElementById('printBtn');
      var printed = false;

      function tryPrint() {
        if (printed) return;
        printed = true;
        try {
          // Prefer printing from the iframe's own context so the PDF content
          // is the print target, not the wrapper HTML page.
          if (frame.contentWindow && typeof frame.contentWindow.print === 'function') {
            frame.contentWindow.focus();
            frame.contentWindow.print();
            return;
          }
        } catch (e) {
          // Cross-origin or PDF viewer quirk — fall through to window.print().
        }
        window.print();
      }

      // Give the PDF viewer a moment to mount inside the iframe, then print.
      frame.addEventListener('load', function () {
        setTimeout(tryPrint, 400);
      });

      // Safety net: if the iframe never fires load (some PDF viewers don't),
      // show a manual button after 2.5s.
      setTimeout(function () {
        if (!printed) {
          fallback.style.display = 'block';
        }
      }, 2500);

      printBtn.addEventListener('click', function () {
        printed = false;
        tryPrint();
      });
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
