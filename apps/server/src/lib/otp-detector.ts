import type { ParsedMessage } from '../types';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { env } from '../env';

const OTP_PATTERNS = [
  // Service-specific patterns
  /G-(\d{6})/, // Google format
  /(\d{6})\s+is your/i,
  /is\s+(\d{4,8})(?!\s*(?:px|em|rem|%|pt|vh|vw))/i, // Exclude CSS units

  // Codes with formatting
  /\b(\d{3}[-\s]\d{3})\b/, // 123-456 or 123 456
  /\b(\d{4}[-\s]\d{4})\b/, // 1234-5678
  /\b(\d{2}[-\s]\d{2}[-\s]\d{2})\b/, // 12-34-56

  // Standalone numeric codes (4-8 digits) - exclude hex colors, dates, times
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(\d{6})(?![A-Z0-9])(?!:)(?!-)(?!\s*(?:UTC|GMT|EST|PST|PDT|CDT|MDT))/, // Exactly 6 digits
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(?!19\d{2})(?!20\d{2})(\d{4})(?![A-Z0-9])(?!:)(?!-)/, // Exactly 4 digits, not years
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(\d{5})(?![A-Z0-9])(?!:)(?!-)/, // Exactly 5 digits
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(\d{7})(?![A-Z0-9])(?!:)(?!-)/, // Exactly 7 digits
  /(?<!#)(?<!:)(?<!-)(?<![A-Z0-9])(\d{8})(?![A-Z0-9])(?!:)(?!-)(?!\s*(?:UTC|GMT|EST|PST|PDT|CDT|MDT))/, // Exactly 8 digits

  // Alphanumeric codes (less common) - match mixed letters and numbers
  /(?<!#)(?<![A-Z0-9])([A-Z0-9]{6})(?![A-Z0-9])/, // 6 chars alphanumeric
  /(?<!#)(?<![A-Z0-9])([A-Z0-9]{8})(?![A-Z0-9])/, // 8 chars alphanumeric
];

const isValidOTPCode = (code: string): boolean => {
  // OTP codes should contain at least one digit
  if (!/\d/.test(code)) return false;

  // Exclude purely alphabetic strings (common words)
  if (/^[A-Za-z]+$/.test(code)) return false;

  // Exclude years (1900-2099)
  if (/^(19|20)\d{2}$/.test(code)) return false;

  // Exclude common timestamp patterns
  if (/^\d{2}:\d{2}$/.test(code)) return false; // HH:MM
  if (/^\d{6}$/.test(code) && code.match(/^([01]\d|2[0-3])([0-5]\d){2}$/)) return false; // HHMMSS

  // Exclude codes that are all the same digit (e.g., 000000, 111111)
  if (/^(\d)\1+$/.test(code)) return false;

  // Exclude sequential numbers (e.g., 123456, 987654)
  const digits = code.split('').map(Number);
  const isSequential = digits.every(
    (digit, i) => i === 0 || digit === digits[i - 1] + 1 || digit === digits[i - 1] - 1,
  );
  if (isSequential && code.length >= 4) return false;

  return true;
};

const isCodeWithinURL = (text: string, index: number, length: number): boolean => {
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  let m;
  while ((m = urlRegex.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (index >= start && index + length <= end) return true;
  }
  return false;
};

const SERVICE_PATTERNS: Record<string, RegExp[]> = {
  Google: [/google/i, /gmail/i, /youtube/i],
  Microsoft: [/microsoft/i, /outlook/i, /office/i, /azure/i],
  Amazon: [/amazon/i, /aws/i],
  Apple: [/apple/i, /icloud/i],
  Facebook: [/facebook/i, /meta/i],
  Twitter: [/twitter/i, /x\.com/i],
  GitHub: [/github/i],
  LinkedIn: [/linkedin/i],
  PayPal: [/paypal/i],
  Stripe: [/stripe/i],
  Discord: [/discord/i],
  Slack: [/slack/i],
  Notion: [/notion/i],
  Vercel: [/vercel/i],
  Cloudflare: [/cloudflare/i],
};

interface OTPResult {
  code: string;
  service: string;
  expiresAt: Date;
}

export interface MagicLinkResult {
  url: string;
  service: string;
}

export const detectOTPFromThread = (thread: { messages: ParsedMessage[] }): OTPResult | null => {
  const latestMessage = thread.messages?.[0];
  if (!latestMessage) return null;

  // Check if this looks like an OTP email
  const otpKeywords = [
    'verification code',
    'verify',
    'otp',
    'one-time',
    '2fa',
    'two-factor',
    'security code',
    'confirmation code',
    'access code',
    'login code',
  ];

  const content =
    `${latestMessage.subject ?? ''} ${latestMessage.decodedBody || latestMessage.body || ''}`.toLowerCase();
  const hasOTPKeyword = otpKeywords.some((keyword) => content.includes(keyword));

  if (!hasOTPKeyword) return null;

  let code: string | null = null;
  const bodyText = latestMessage.decodedBody || latestMessage.body || '';

  // Try to find OTP code in the body
  for (const pattern of OTP_PATTERNS) {
    const regex = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g',
    );
    let m;
    while ((m = regex.exec(bodyText)) !== null) {
      if (!m[1]) continue;
      if (isCodeWithinURL(bodyText, m.index ?? 0, m[1].length)) continue;
      const potentialCode = m[1].replace(/[-\s]/g, '');
      if (isValidOTPCode(potentialCode)) {
        code = potentialCode;
        break;
      }
    }
    if (code) break;
  }

  if (!code) return null;

  let service = 'Unknown Service';
  const fromEmail = latestMessage.sender?.email || '';
  const fromName = latestMessage.sender?.name || '';

  for (const [serviceName, patterns] of Object.entries(SERVICE_PATTERNS)) {
    if (
      patterns.some(
        (pattern) =>
          pattern.test(fromEmail) ||
          pattern.test(fromName) ||
          pattern.test(latestMessage.subject || ''),
      )
    ) {
      service = serviceName;
      break;
    }
  }

  if (service === 'Unknown Service' && latestMessage.sender?.name) {
    service = latestMessage.sender.name.split(' ')[0];
  }

  const receivedAt = new Date(latestMessage.receivedOn);
  const expiresAt = new Date(receivedAt.getTime() + 10 * 60 * 1000);

  return {
    code,
    service,
    expiresAt,
  };
};

export const detectOTPFromThreadAI = async (thread: {
  messages: ParsedMessage[];
}): Promise<OTPResult | null> => {
  const latestMessage = thread.messages?.[0];
  if (!latestMessage) return null;

  const subject = latestMessage.subject ?? '';
  const body = latestMessage.decodedBody || latestMessage.body || '';
  const fromEmail = latestMessage.sender?.email || '';
  const fromName = latestMessage.sender?.name || '';

  const systemPrompt = `
You are an assistant that extracts one-time passcodes (OTP) from emails. Strict rules:
- Only return a JSON object with: {"code":"string","service":"string"}.
- If no valid OTP is found, return exactly {}.
- Valid codes are 4-8 digits OR 6-8 alphanumeric (A-Z, 0-9).
- Do not use numbers inside URLs, timestamps, years, hex colors, or sequential/repeated digits.
- Prefer codes explicitly referenced as verification/OTP/security/login/2FA/PIN codes.
`;

  const userPrompt = `Subject: ${subject}\nFrom: ${fromName} <${fromEmail}>\n\nBody:\n${body}`;

  try {
    const { text: raw } = await generateText({
      model: openai(env.OPENAI_MODEL || 'gpt-4o'),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0,
    });
    if (!raw || typeof raw !== 'string') return null;

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.code) return null;

    const potentialCode: string = String(parsed.code).replace(/[-\s]/g, '');
    if (!isValidOTPCode(potentialCode)) return null;

    const content = `${subject} ${body}`;
    const idx = content.indexOf(potentialCode);
    if (idx >= 0 && isCodeWithinURL(content, idx, potentialCode.length)) return null;

    let service =
      typeof parsed.service === 'string' && parsed.service.trim().length
        ? parsed.service.trim()
        : 'Unknown Service';
    if (service === 'Unknown Service' && fromName) {
      service = fromName.split(' ')[0];
    }

    const receivedAt = new Date(latestMessage.receivedOn);
    const expiresAt = new Date(receivedAt.getTime() + 10 * 60 * 1000);

    return { code: potentialCode, service, expiresAt };
  } catch (error) {
    console.warn('[OTP_DETECTOR_AI] Failed to extract OTP via AI:', error);
    return null;
  }
};

export const detectMagicLinkFromThread = (thread: {
  messages: ParsedMessage[];
}): MagicLinkResult | null => {
  const latestMessage = thread.messages?.[0];
  if (!latestMessage) return null;
  const bodyText = latestMessage.decodedBody || latestMessage.body || '';
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const MAGIC_LINK_KEYWORDS = [
    'magic',
    'login',
    'signin',
    'sign-in',
    'sign_in',
    'token',
    'auth',
    'verify',
    'verification',
    'session',
    'key',
  ];
  const isAssetUrl = (url: string): boolean =>
    /\.(png|jpe?g|gif|webp|svg|css|js|ico)(\?|$)/i.test(url);
  const matches = [...bodyText.matchAll(urlRegex)];
  let foundUrl: string | null = null;
  for (const m of matches) {
    const url = m[0];
    if (isAssetUrl(url)) continue;
    const lowerUrl = url.toLowerCase();
    if (MAGIC_LINK_KEYWORDS.some((kw) => lowerUrl.includes(kw))) {
      foundUrl = url;
      break;
    }
  }
  if (!foundUrl) return null;
  const SERVICE_PATTERNS = {
    Google: [/google/i, /gmail/i, /youtube/i],
    Microsoft: [/microsoft/i, /outlook/i, /office/i, /azure/i],
    Amazon: [/amazon/i, /aws/i],
    Apple: [/apple/i, /icloud/i],
    Facebook: [/facebook/i, /meta/i],
    Twitter: [/twitter/i, /x\.com/i],
    GitHub: [/github/i],
    LinkedIn: [/linkedin/i],
    PayPal: [/paypal/i],
    Stripe: [/stripe/i],
    Discord: [/discord/i],
    Slack: [/slack/i],
    Notion: [/notion/i],
    Vercel: [/vercel/i],
    Cloudflare: [/cloudflare/i],
  } as const;
  let service = 'Unknown Service';
  const fromEmail = latestMessage.sender?.email || '';
  const fromName = latestMessage.sender?.name || '';
  for (const [serviceName, patterns] of Object.entries(SERVICE_PATTERNS)) {
    if (
      patterns.some(
        (p) => p.test(fromEmail) || p.test(fromName) || p.test(latestMessage.subject || ''),
      )
    ) {
      service = serviceName;
      break;
    }
  }
  return { url: foundUrl, service };
};

export const detectMagicLinkFromThreadAI = async (thread: {
  messages: ParsedMessage[];
}): Promise<MagicLinkResult | null> => {
  const latestMessage = thread.messages?.[0];
  if (!latestMessage) return null;

  const subject = latestMessage.subject ?? '';
  const body = latestMessage.decodedBody || latestMessage.body || '';
  const fromEmail = latestMessage.sender?.email || '';
  const fromName = latestMessage.sender?.name || '';

  const systemPrompt = `You extract magic sign-in links from emails.
Return ONLY strict JSON: {"url":"string","service":"string"} or {} if none.
Rules:
- URL must be an http(s) link used for login/verification/session/auth.
- Ignore asset links (png,jpg,gif,webp,svg,css,js,ico), trackers, and unsubscribe.
- Prefer links with keywords: magic, login, signin, sign-in, sign_in, token, auth, verify, verification, session, key.
`;

  const userPrompt = `Subject: ${subject}\nFrom: ${fromName} <${fromEmail}>\n\nBody:\n${body}`;

  try {
    const { text: raw } = await generateText({
      model: openai(process.env.OPENAI_MODEL || 'gpt-4o'),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0,
    });

    if (!raw || typeof raw !== 'string') return null;

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.url) return null;

    const url: string = String(parsed.url);
    const urlRegex = /^https?:\/\/[\w\-._~:/?#\[\]@!$&'()*+,;=%]+$/i;
    const isAsset = /\.(png|jpe?g|gif|webp|svg|css|js|ico)(\?|$)/i.test(url);
    if (!urlRegex.test(url) || isAsset) return null;

    let service: string = typeof parsed.service === 'string' ? parsed.service.trim() : '';
    if (!service || service.toLowerCase() === 'unknown service') {
      service = fromName ? fromName.split(' ')[0] : 'Unknown Service';
    }

    return { url, service };
  } catch (error) {
    console.warn('[MAGIC_LINK_DETECTOR_AI] Failed to extract magic link via AI:', error);
    return null;
  }
};
