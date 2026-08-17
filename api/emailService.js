import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'inv-enterprise-mail-secret-key-32b'; // 32 chars
const IV_LENGTH = 16;

export function encryptPassword(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptPassword(text) {
  if (!text) return '';
  try {
    const textParts = text.split(':');
    if (textParts.length < 2) return text; // fallback if plain
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    return text;
  }
}

export function createImapClient(config) {
  return new ImapFlow({
    host: config.imap_host || 'box5644.bluehost.com',
    port: Number(config.imap_port) || 993,
    secure: config.imap_secure !== false,
    auth: {
      user: config.email,
      pass: config.decryptedPassword || decryptPassword(config.password)
    },
    logger: false
  });
}

export async function testConnection(config) {
  const client = createImapClient(config);
  try {
    await client.connect();
    const list = await client.list();
    await client.logout();
    return { success: true, mailboxes: list.map(m => m.path) };
  } catch (error) {
    return { success: false, error: error.message || 'No se pudo conectar al servidor de correo.' };
  }
}

export async function fetchMailboxes(config) {
  const client = createImapClient(config);
  try {
    await client.connect();
    const list = await client.list();
    await client.logout();
    return list.map(m => ({
      path: m.path,
      name: m.name,
      specialUse: m.specialUse
    }));
  } catch (error) {
    throw error;
  }
}

export async function fetchFolderMessages(config, folder = 'INBOX', limit = 25) {
  const client = createImapClient(config);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    const messages = [];

    try {
      const status = client.mailbox;
      const totalMessages = status.exists || 0;
      
      if (totalMessages > 0) {
        // Calculate range for last `limit` messages
        const startSeq = Math.max(1, totalMessages - limit + 1);
        const seqRange = `${startSeq}:${totalMessages}`;

        for await (let msg of client.fetch(seqRange, {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          size: true
        })) {
          const fromArr = msg.envelope?.from || [];
          const fromName = fromArr[0]?.name || fromArr[0]?.address || 'Desconocido';
          const fromAddress = fromArr[0]?.address || '';

          messages.push({
            uid: msg.uid,
            seq: msg.seq,
            subject: msg.envelope?.subject || '(Sin asunto)',
            from: { name: fromName, address: fromAddress },
            to: (msg.envelope?.to || []).map(t => ({ name: t.name || t.address, address: t.address })),
            date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
            isSeen: msg.flags.has('\\Seen'),
            isFlagged: msg.flags.has('\\Flagged'),
            isAnswered: msg.flags.has('\\Answered'),
            size: msg.size || 0
          });
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    // Return newest first
    return messages.reverse();
  } catch (error) {
    throw error;
  }
}

export async function getMessageDetails(config, folder = 'INBOX', uid) {
  const client = createImapClient(config);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    let parsedEmail = null;

    try {
      // Fetch entire RFC822 message source
      const download = await client.download(String(uid), null, { uid: true });
      if (download && download.content) {
        const parsed = await simpleParser(download.content);
        
        // Auto mark as read
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});

        parsedEmail = {
          uid: Number(uid),
          subject: parsed.subject || '(Sin asunto)',
          from: parsed.from?.value || [{ name: 'Desconocido', address: '' }],
          to: parsed.to?.value || [],
          cc: parsed.cc?.value || [],
          bcc: parsed.bcc?.value || [],
          date: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
          text: parsed.text || '',
          html: parsed.html || (parsed.text ? `<pre style="font-family: inherit; white-space: pre-wrap;">${parsed.text}</pre>` : ''),
          attachments: (parsed.attachments || []).map(att => ({
            filename: att.filename || 'adjunto',
            contentType: att.contentType,
            size: att.size,
            contentId: att.cid,
            // Only send small files in base64 if needed
            contentBase64: att.size < 5000000 ? att.content.toString('base64') : null
          }))
        };
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return parsedEmail;
  } catch (error) {
    throw error;
  }
}

export async function toggleMessageFlag(config, folder = 'INBOX', uid, flag = '\\Seen', add = true) {
  const client = createImapClient(config);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      if (add) {
        await client.messageFlagsAdd(String(uid), [flag], { uid: true });
      } else {
        await client.messageFlagsRemove(String(uid), [flag], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { success: true };
  } catch (error) {
    throw error;
  }
}

export async function deleteMessage(config, folder = 'INBOX', uid) {
  const client = createImapClient(config);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      // Find Trash mailbox name if available or flag as Deleted
      await client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
      await client.messageDelete(String(uid), { uid: true }).catch(() => {});
    } finally {
      lock.release();
    }
    await client.logout();
    return { success: true };
  } catch (error) {
    throw error;
  }
}

export async function sendEmail(config, { to, cc, bcc, subject, text, html, attachments = [] }) {
  const pass = config.decryptedPassword || decryptPassword(config.password);
  const transporter = nodemailer.createTransport({
    host: config.smtp_host || 'box5644.bluehost.com',
    port: Number(config.smtp_port) || 465,
    secure: config.smtp_secure !== false,
    auth: {
      user: config.email,
      pass
    }
  });

  const mailOptions = {
    from: config.email,
    to,
    cc,
    bcc,
    subject,
    text,
    html: html || text,
    attachments: attachments.map(att => ({
      filename: att.filename,
      content: Buffer.from(att.contentBase64, 'base64'),
      contentType: att.contentType
    }))
  };

  const info = await transporter.sendMail(mailOptions);
  return { success: true, messageId: info.messageId };
}
