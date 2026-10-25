/**
 * ResQ-Lane — Server-Side Provider-Neutral SMS Service Module
 * 
 * Secure server-side adapter for dispatch-to-scene links and responder emergency alerts.
 * Features:
 * - Provider abstraction (Twilio, Fast2SMS / Indian A2P Gateway, Dev Mock)
 * - E.164 phone number validation and normalization (+91 default for 10-digit Indian numbers)
 * - PII masking for safe diagnostic logging (e.g., +91 ******4321)
 * - In-memory sliding-window rate limiting to prevent abuse and SMS bombing
 * - Incident-level idempotency protection
 * - Standardized result statuses (distinguishing delivery, acceptance, rejection, and missing config)
 */

export type SmsDeliveryStatus =
  | 'DELIVERED_CONFIRMED'
  | 'ACCEPTED_BY_PROVIDER'
  | 'ALREADY_PROCESSED'
  | 'PROVIDER_REJECTED'
  | 'CONFIG_MISSING'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FAILED';

export interface SmsSendResult {
  success: boolean;
  status: SmsDeliveryStatus;
  provider: string;
  messageId?: string;
  error?: string;
  maskedRecipient: string;
}

export interface SmsSendParams {
  to: string;
  message: string;
}

export interface SmsProvider {
  name: string;
  isConfigured(): boolean;
  send(params: SmsSendParams): Promise<SmsSendResult>;
}

// ============================================================================
// 1. Phone Number Validation, Normalization & PII Masking
// ============================================================================

export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Normalizes input to E.164 format.
 * Defaults standard 10-digit mobile numbers (6xxx-9xxx) to Indian country code +91.
 */
export function normalizePhoneNumber(raw: string): PhoneValidationResult {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Phone number is required.' };
  }

  // Strip spaces, dashes, dots, parentheses
  const cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');

  // Case 1: Indian 10-digit mobile (starts with 6, 7, 8, 9)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: `+91${cleaned}` };
  }

  // Case 2: Indian 11-digit with leading 0 (09876543210)
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: `+91${cleaned.slice(1)}` };
  }

  // Case 3: Indian 12-digit with 91 prefix without plus (919876543210)
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return { valid: true, normalized: `+${cleaned}` };
  }

  // Case 4: International E.164 format (+[1-9][0-9]{7,14})
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }

  return {
    valid: false,
    error: 'Invalid phone format. Please enter a valid 10-digit mobile number or full E.164 number (e.g. +91XXXXXXXXXX).',
  };
}

/**
 * Safely masks a phone number for diagnostic logging without exposing PII.
 * Example: "+919876543210" -> "+91 ******3210"
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone) return 'unknown';
  if (phone.length <= 5) return '***';
  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-4);
  return `${prefix} ******${suffix}`;
}

// ============================================================================
// 2. In-Memory Abuse Prevention & Rate Limiting
// ============================================================================

interface RateLimitRecord {
  timestamps: number[];
}

const ipRateLimits = new Map<string, RateLimitRecord>();
const phoneRateLimits = new Map<string, RateLimitRecord>();

/**
 * Basic in-memory sliding window rate limiter.
 * Max 5 SMS requests per IP per minute.
 * Max 3 SMS requests per destination number per 5 minutes (prevents victim flooding).
 */
export function checkRateLimit(
  clientIp: string,
  destinationPhone: string
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const ONE_MINUTE = 60 * 1000;
  const FIVE_MINUTES = 5 * 60 * 1000;

  // 1. IP rate check
  const ipRecord = ipRateLimits.get(clientIp) || { timestamps: [] };
  ipRecord.timestamps = ipRecord.timestamps.filter((t) => now - t < ONE_MINUTE);
  if (ipRecord.timestamps.length >= 5) {
    return { allowed: false, reason: 'Too many SMS requests from this network. Please wait a minute.' };
  }
  ipRecord.timestamps.push(now);
  ipRateLimits.set(clientIp, ipRecord);

  // 2. Destination phone rate check
  const phoneRecord = phoneRateLimits.get(destinationPhone) || { timestamps: [] };
  phoneRecord.timestamps = phoneRecord.timestamps.filter((t) => now - t < FIVE_MINUTES);
  if (phoneRecord.timestamps.length >= 3) {
    return { allowed: false, reason: 'Too many messages sent to this phone number recently. Please wait a few minutes.' };
  }
  phoneRecord.timestamps.push(now);
  phoneRateLimits.set(destinationPhone, phoneRecord);

  return { allowed: true };
}

/**
 * Architecture & Persistence Note:
 * In-memory rate limits (IP & destination) and incident idempotency records do NOT persist
 * across server restarts, nor do they coordinate across multiple serverless/cluster instances.
 * In a multi-instance production environment, a distributed store (e.g. Redis / Upstash) or
 * a database notification log table should be introduced to enforce cluster-wide idempotency.
 */
const notifiedIncidents = new Map<string, number>();

/**
 * Ensures a responder SMS is only transmitted once per incident ID.
 * Returns true if this is the first notification attempt, false if already processed.
 */
export function markIncidentNotified(incidentId: string): boolean {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  // Housekeeping: remove entries older than 1 hour
  for (const [id, time] of notifiedIncidents.entries()) {
    if (now - time > ONE_HOUR) {
      notifiedIncidents.delete(id);
    }
  }

  if (notifiedIncidents.has(incidentId)) {
    return false; // Already notified
  }

  notifiedIncidents.set(incidentId, now);
  return true;
}

// ============================================================================
// 4. Concrete Provider Adapters
// ============================================================================

/**
 * Twilio REST API Provider (Standard Global SMS Provider).
 * Requires:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID
 */
class TwilioProvider implements SmsProvider {
  name = 'twilio';

  isConfigured(): boolean {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID)
    );
  }

  async send({ to, message }: SmsSendParams): Promise<SmsSendResult> {
    const masked = maskPhoneNumber(to);
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const bodyParams = new URLSearchParams();
    bodyParams.append('To', to);
    bodyParams.append('Body', message);

    if (messagingServiceSid) {
      bodyParams.append('MessagingServiceSid', messagingServiceSid);
    } else if (fromNumber) {
      bodyParams.append('From', fromNumber);
    }

    try {
      const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
        signal: AbortSignal.timeout(8000), // 8-second safety timeout
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          status: 'PROVIDER_REJECTED',
          provider: this.name,
          error: data.message || `Twilio error code ${data.code || response.status}`,
          maskedRecipient: masked,
        };
      }

      // Twilio returns 201 when message is accepted into queue
      return {
        success: true,
        status: 'ACCEPTED_BY_PROVIDER',
        provider: this.name,
        messageId: data.sid,
        maskedRecipient: masked,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown Twilio network error';
      return {
        success: false,
        status: 'FAILED',
        provider: this.name,
        error: errMsg,
        maskedRecipient: masked,
      };
    }
  }
}

/**
 * Fast2SMS Provider (Popular Indian Transactional Gateway).
 * Requires:
 * - FAST2SMS_API_KEY
 */
class Fast2SmsProvider implements SmsProvider {
  name = 'fast2sms';

  isConfigured(): boolean {
    return Boolean(process.env.FAST2SMS_API_KEY);
  }

  async send({ to, message }: SmsSendParams): Promise<SmsSendResult> {
    const masked = maskPhoneNumber(to);
    // Fast2SMS expects 10-digit number without +91 for domestic numbers
    const cleanNumber = to.replace(/^\+91/, '').replace(/\D/g, '');

    const apiKey = process.env.FAST2SMS_API_KEY!;
    const endpoint = 'https://www.fast2sms.com/dev/bulkV2';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          route: 'q', // Quick transactional route
          message: message,
          language: 'english',
          flash: 0,
          numbers: cleanNumber,
        }),
        signal: AbortSignal.timeout(8000),
      });

      const data = await response.json();

      if (!response.ok || data.return === false) {
        return {
          success: false,
          status: 'PROVIDER_REJECTED',
          provider: this.name,
          error: data.message ? data.message.join(', ') : 'Fast2SMS rejected request',
          maskedRecipient: masked,
        };
      }

      return {
        success: true,
        status: 'ACCEPTED_BY_PROVIDER',
        provider: this.name,
        messageId: data.request_id,
        maskedRecipient: masked,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown Fast2SMS network error';
      return {
        success: false,
        status: 'FAILED',
        provider: this.name,
        error: errMsg,
        maskedRecipient: masked,
      };
    }
  }
}

/**
 * Dev/Simulation Provider
 * Fallback when no live SMS provider credentials are provided.
 * Truthfully reports CONFIG_MISSING without claiming real message delivery.
 */
class DevMockProvider implements SmsProvider {
  name = 'dev-mock';

  isConfigured(): boolean {
    return true;
  }

  async send({ to, message }: SmsSendParams): Promise<SmsSendResult> {
    const masked = maskPhoneNumber(to);
    // Diagnostic safe log (never logs full message secrets or full PII)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ResQ-Lane SMS Simulation] To: ${masked} | Length: ${message.length} chars | Status: CONFIG_MISSING`);
    }

    return {
      success: false,
      status: 'CONFIG_MISSING',
      provider: this.name,
      error: 'No live SMS provider configured (TWILIO_* or FAST2SMS_*). Message recorded in simulation log.',
      maskedRecipient: masked,
    };
  }
}

// ============================================================================
// 5. Provider Resolver & Public Dispatch Functions
// ============================================================================

const twilio = new TwilioProvider();
const fast2sms = new Fast2SmsProvider();
const devMock = new DevMockProvider();

export function getActiveSmsProvider(): SmsProvider {
  if (twilio.isConfigured()) return twilio;
  if (fast2sms.isConfigured()) return fast2sms;
  return devMock;
}

/**
 * Primary server-side function to transmit an SMS.
 */
export async function sendSms(params: SmsSendParams): Promise<SmsSendResult> {
  const norm = normalizePhoneNumber(params.to);
  if (!norm.valid || !norm.normalized) {
    return {
      success: false,
      status: 'PROVIDER_REJECTED',
      provider: 'validation',
      error: norm.error || 'Invalid phone number format',
      maskedRecipient: maskPhoneNumber(params.to),
    };
  }

  const provider = getActiveSmsProvider();
  return await provider.send({
    to: norm.normalized,
    message: params.message.trim(),
  });
}

/**
 * Resolves the public canonical base URL of the deployment.
 * Never trusts arbitrary unvalidated host headers.
 */
export function getPublicBaseUrl(req?: Request): string {
  // 1. Explicit production environment configuration (Preferred)
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  }

  // 2. Vercel deployment URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;
  }

  // 3. Fallback for local development
  if (req) {
    const host = req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  return 'http://localhost:3000';
}
