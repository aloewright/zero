import { htmlToText } from '../thread-workflow-utils/workflow-utils';
import { generateObject, generateText } from 'ai';
import type { ParsedMessage } from '../types';
import { openai } from '@ai-sdk/openai';
import { env } from '../env';
import { z } from 'zod';

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

interface OTPResult {
  code: string;
  service: string;
  expiresAt: Date;
}

export interface MagicLinkResult {
  url: string;
  service: string;
}

export const detectOTPFromThreadAI = async (thread: {
  messages: ParsedMessage[];
}): Promise<OTPResult | null> => {
  const latestMessage = thread.messages?.[0];
  if (!latestMessage) return null;

  const subject = latestMessage.subject ?? '';
  const body = latestMessage.decodedBody ?? '';
  const fromEmail = latestMessage.sender?.email ?? '';
  const fromName = latestMessage.sender?.name ?? '';
  const title = latestMessage.title ?? '';

  const sanitize = await htmlToText(body);

  const systemPrompt = `You are an OTP extraction specialist. Your task is to identify and extract one-time passcodes (OTP) from email content.

## Output Format
Return ONLY a JSON object in one of these formats:
- If OTP found: {"code": "string", "service": "string"}
- If no OTP found: {}

## Valid OTP Patterns
1. **Numeric codes**: 4-8 consecutive digits (e.g., "1234", "567890")
2. **Alphanumeric codes**: 6-8 characters mixing letters (A-Z) and numbers (e.g., "A1B2C3", "X9Y8Z7W6")

## Service Identification
Extract the service name from:
- Email sender domain (e.g., noreply@github.com → "GitHub")
- Subject line mentions (e.g., "Your Netflix verification code")
- Body content references (e.g., "Sign in to Amazon")

## Code Context Indicators
Prioritize codes that appear near these keywords:
- "verification code", "OTP", "one-time password", "security code"
- "2FA", "two-factor", "authentication code", "PIN"
- "confirm", "verify", "login code", "access code"
- "expires in", "valid for", "use this code"

## Exclusion Rules
DO NOT extract:
- Numbers within URLs (e.g., github.com/user/123456)
- Timestamps or dates (e.g., 14:30, 2024, 20241208)
- Year values (1900-2099)
- Hex color codes (#FF5500)
- Order/invoice numbers
- Phone numbers
- Sequential digits (123456, 987654)
- Repeated digits (000000, 111111)
- Version numbers (v1.2.3)
- IP addresses or ports

## Examples
Input: "Your GitHub verification code is 845291. This code expires in 10 minutes."
Output: {"code": "845291", "service": "GitHub"}

Input: "Visit example.com/reset/123456 to reset your password"
Output: {}

Input: "Enter A9B2K7 to complete your Apple ID sign-in"
Output: {"code": "A9B2K7", "service": "Apple"}`;

  const userPrompt = `Subject: ${subject}\nFrom: ${fromName} <${fromEmail}>\n\nTitle: ${title}\n\nBody:\n${sanitize}`;

  try {
    const { object: raw } = await generateObject({
      model: openai(env.OPENAI_MODEL || 'gpt-4o'),
      system: systemPrompt,
      prompt: userPrompt,
      schema: z.object({
        code: z.string(),
        service: z.string(),
        expiresAt: z.string(),
      }),
      output: 'object',
    });

    console.log('[OTP_DETECTOR_AI] [raw]', raw);

    const potentialCode: string = String(raw.code).replace(/[-\s]/g, '');
    console.log('[OTP_DETECTOR_AI] [potentialCode]', potentialCode);
    if (!isValidOTPCode(potentialCode)) return null;

    console.log('[OTP_DETECTOR_AI] [HERE]');

    const content = `${subject} ${body}`;
    const idx = content.indexOf(potentialCode);
    if (idx >= 0 && isCodeWithinURL(content, idx, potentialCode.length)) return null;

    console.log('[OTP_DETECTOR_AI] [HERE 2]');

    let service = raw.service ? raw.service.trim() : 'Unknown Service';
    if (service === 'Unknown Service' && fromName) {
      service = fromName.split(' ')[0];
    }

    console.log('[OTP_DETECTOR_AI] [HERE 3]');

    const expiresAt = new Date(raw.expiresAt);

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

    // TODO: fix this
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const urlRegex = /^https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+$/i;
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
