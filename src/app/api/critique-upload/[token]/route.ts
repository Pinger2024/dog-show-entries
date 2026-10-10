import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { critiqueDocuments } from '@/server/db/schema';
import { uploadToR2 } from '@/server/services/storage';
import { parseCritiqueDocument } from '@/lib/critique-parse';
import { matchCritiqueBlocks } from '@/lib/critique-match';
import { loadShowClassRows, toClassList, toResultsGraph } from '@/server/services/critique-results-graph';

// Token-gated, NOT session-gated — deliberately the first upload route
// authenticated purely by a magic-link credential (the judge never logs
// in). Dedicated validation here on purpose: does NOT go through
// storage.ts's validateUpload/ALLOWED_MIME_TYPES, which governs the
// session-gated upload routes' shared allowlist and has no reason to know
// about Word documents.
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const doc = await db.query.critiqueDocuments.findFirst({
    where: eq(critiqueDocuments.uploadToken, token),
  });

  if (!doc) {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
  }
  if (doc.status === 'published') {
    return NextResponse.json(
      { error: 'These critiques have already been published — ask the secretary to unpublish first.' },
      { status: 410 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 });
  }

  const file = formData.get('file');
  const pastedText = formData.get('text');

  let rawText: string;
  let originalFilename: string | null = null;
  let storageKey: string | null = null;

  if (file instanceof File) {
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'That file is too big — please keep it under 10MB.' }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    const isDocx = file.type === DOCX_MIME || lowerName.endsWith('.docx');
    const isPlainText = file.type === 'text/plain' || lowerName.endsWith('.txt');

    if (!isDocx && !isPlainText) {
      return NextResponse.json(
        { error: 'Please upload a Word document (.docx) or a plain text file (.txt).' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (isDocx) {
      // Judges upload odd files — old-format .doc renamed to .docx,
      // corrupted downloads. Those must come back as a kind 400, not a 500.
      let extracted: { value: string };
      try {
        extracted = await mammoth.extractRawText({ buffer });
      } catch {
        return NextResponse.json(
          { error: "We couldn't read that Word document — please check it opens in Word, then try again." },
          { status: 400 },
        );
      }
      rawText = extracted.value;
      originalFilename = file.name;
      // Original kept in R2 for provenance — never used for re-parsing.
      storageKey = `critiques/${doc.showId}/${doc.id}.docx`;
      await uploadToR2(storageKey, buffer, DOCX_MIME);
    } else {
      rawText = buffer.toString('utf-8');
      originalFilename = file.name;
    }
  } else if (typeof pastedText === 'string' && pastedText.trim()) {
    if (Buffer.byteLength(pastedText, 'utf-8') > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'That text is too long.' }, { status: 400 });
    }
    rawText = pastedText;
  } else {
    return NextResponse.json(
      { error: 'Please attach a file, or paste your critiques into the box.' },
      { status: 400 },
    );
  }

  if (!rawText.trim()) {
    return NextResponse.json(
      { error: "That doesn't seem to have any text in it — please check and try again." },
      { status: 400 },
    );
  }

  const rows = await loadShowClassRows(db, doc.showId);
  const classList = toClassList(rows);
  const resultsGraph = toResultsGraph(rows);

  const parsed = parseCritiqueDocument(rawText, classList);
  const matched = matchCritiqueBlocks(parsed, resultsGraph);

  // Re-upload replaces rawText/parsedJson/originalFilename/storageKey
  // wholesale — status is left exactly as it was (invited or submitted).
  await db
    .update(critiqueDocuments)
    .set({ rawText, parsedJson: matched, originalFilename, storageKey })
    .where(eq(critiqueDocuments.id, doc.id));

  const critiqueBlocks = matched.blocks.filter((b) => b.kind === 'critique');
  const counts = {
    total: matched.blocks.length,
    critiques: critiqueBlocks.length,
    exact: critiqueBlocks.filter((b) => b.confidence === 'exact').length,
    check: critiqueBlocks.filter((b) => b.confidence === 'check').length,
    unmatched:
      critiqueBlocks.filter((b) => b.confidence === 'unmatched').length +
      matched.blocks.filter((b) => b.kind === 'unmatched').length,
    hasOverview: matched.blocks.some((b) => b.kind === 'overview'),
  };

  return NextResponse.json({ ok: true, counts });
}
