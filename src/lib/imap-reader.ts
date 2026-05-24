import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

export interface ParsedEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  uid: number;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function fetchUnreadEmails(): Promise<ParsedEmail[]> {
  const supabase = getSupabase();

  const { data: settings, error: settingsErr } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['gmail_imap_user', 'gmail_imap_password']);

  if (settingsErr) {
    throw new Error(`Failed to read settings: ${settingsErr.message}`);
  }

  const user = settings?.find(s => s.key === 'gmail_imap_user')?.value || '';
  const passwordRaw = settings?.find(s => s.key === 'gmail_imap_password')?.value || '';
  const password = passwordRaw.replace(/\s/g, '');

  console.log('[IMAP] credentials loaded from settings | user:', user, '| pass_len:', password.length);

  if (!user) throw new Error('gmail_imap_user not configured in settings');
  if (!password) throw new Error('gmail_imap_password not configured in settings');

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });

  const emails: ParsedEmail[] = [];

  await client.connect();
  console.log('[IMAP] connected, opening INBOX...');

  const lock = await client.getMailboxLock('INBOX');

  try {
    for await (const msg of client.fetch({ seen: false }, { uid: true, source: true })) {
      try {
        const parsed: ParsedMail = await simpleParser(msg.source as Buffer);
        const toAddr = Array.isArray(parsed.to)
          ? parsed.to[0]?.text || ''
          : parsed.to?.text || '';

        emails.push({
          messageId: parsed.messageId || '',
          from: parsed.from?.text || '',
          to: toAddr,
          subject: parsed.subject || '',
          text: (parsed.text || '').trim(),
          uid: msg.uid as number,
        });
      } catch (parseErr) {
        console.error('[IMAP] erro parsing mensagem:', parseErr);
      }
    }

    if (emails.length > 0) {
      await client.messageFlagsAdd({ seen: false }, ['\\Seen']);
    }
  } finally {
    lock.release();
    await client.logout();
  }

  console.log('[IMAP] done | fetched:', emails.length);
  return emails;
}
