import { ImapFlow } from 'imapflow';
import { simpleParser, AddressObject } from 'mailparser';
import { Readable } from 'stream';

export interface InboundEmail {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  headers: Array<{ name: string; value: string }>;
}

function extractAddress(addr: AddressObject | AddressObject[] | undefined): string[] {
  if (!addr) return [];
  const list = Array.isArray(addr) ? addr : [addr];
  return list.flatMap(a => a.value.map(v => v.address ?? '').filter(Boolean));
}

export async function fetchUnreadEmails(): Promise<InboundEmail[]> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER ?? '',
      pass: process.env.GMAIL_APP_PASSWORD ?? '',
    },
    logger: false,
  });

  const results: InboundEmail[] = [];

  await client.connect();
  try {
    await client.mailboxOpen('INBOX');

    for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
      try {
        if (!msg.source) continue;
        const source = Readable.from(msg.source);
        const parsed = await simpleParser(source);

        const messageId = (parsed.messageId ?? String(msg.uid)).replace(/[<>]/g, '');
        const from = extractAddress(parsed.from)[0] ?? '';
        const to = extractAddress(parsed.to);
        const subject = parsed.subject ?? '';
        const rawHtml = parsed.html;
        const text = parsed.text ?? (typeof rawHtml === 'string' ? rawHtml : '') ?? '';

        const headers: Array<{ name: string; value: string }> = [];
        parsed.headers.forEach((value, name) => {
          headers.push({ name, value: Array.isArray(value) ? value.join(', ') : String(value) });
        });

        results.push({ messageId, from, to, subject, text, headers });

        // Mark as seen so we don't reprocess on next poll
        await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
      } catch {
        // Skip malformed messages
      }
    }
  } finally {
    await client.logout();
  }

  return results;
}
