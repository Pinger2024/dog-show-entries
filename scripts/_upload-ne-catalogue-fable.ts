// Upload the rendered NE Regional catalogue to R2 for Mandy (89.3MB — too
// big for Telegram/email). Same storage the print pipeline uses. This is the
// POST-CLOSE render (entries closed 23 Aug 22:00; 4 late entries, renumbered).
import 'dotenv/config';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { uploadToR2, getPublicUrl } from '../src/server/services/storage';
const buf = readFileSync('/private/tmp/claude-501/-Users-michaeljames-Projects-dog-show-entries/c809a988-5136-48b1-9c06-4ae192b27bd2/scratchpad/ne-final-postclose.pdf');
const key = `print-files/ne-regional-catalogue-DEFINITIVE-v5-${randomUUID().slice(0, 8)}.pdf`;
uploadToR2(key, buf, 'application/pdf').then(() => {
  console.log(getPublicUrl(key));
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
