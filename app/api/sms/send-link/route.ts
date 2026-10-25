import { NextRequest, NextResponse } from 'next/server';
import {
  sendSms,
  normalizePhoneNumber,
  checkRateLimit,
  getPublicBaseUrl,
  maskPhoneNumber,
  getActiveSmsProvider,
} from '@/lib/sms';

/**
 * POST /api/sms/send-link
 * Operator-initiated workflow: sends the public /sos emergency link to a caller.
 * 
 * Security Policy:
 * 1. The client sends NO secret tokens or API keys in request headers or body.
 * 2. Because this prototype does not yet feature a server-side session/auth system,
 *    live outbound SMS carrier dispatch is locked to prevent open-relay abuse.
 * 3. In simulation mode (dev-mock), it validates, rate-limits, and returns simulated status.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Operator Authorization Check
    // If a real external SMS provider is configured, outbound sending is locked until
    // verified server-side operator session authentication (e.g. Supabase Auth) is implemented.
    const activeProvider = getActiveSmsProvider();
    const isLiveProviderConfigured = activeProvider.name !== 'dev-mock';

    if (isLiveProviderConfigured) {
      // In a production system with Supabase Auth, verify the session cookie here.
      // Since no operator session exists yet, keep real sending safely locked.
      return NextResponse.json(
        {
          success: false,
          status: 'UNAUTHORIZED',
          provider: activeProvider.name,
          error: 'Real carrier SMS sending is disabled: Operator session authentication is not yet integrated in this prototype. Supabase Auth must be implemented before enabling live carrier dispatch.',
        },
        { status: 403 }
      );
    }

    // 2. Parse payload
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.', status: 'PROVIDER_REJECTED' },
        { status: 400 }
      );
    }

    const { phoneNumber } = body || {};
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Recipient phone number is required.', status: 'PROVIDER_REJECTED' },
        { status: 400 }
      );
    }

    // 3. Validation & Normalization
    const norm = normalizePhoneNumber(phoneNumber);
    if (!norm.valid || !norm.normalized) {
      return NextResponse.json(
        {
          error: norm.error || 'Invalid phone number format.',
          status: 'PROVIDER_REJECTED',
          recipient: maskPhoneNumber(phoneNumber),
        },
        { status: 400 }
      );
    }

    // 4. Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const rateCheck = checkRateLimit(clientIp, norm.normalized);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: rateCheck.reason,
          status: 'RATE_LIMITED',
          recipient: maskPhoneNumber(norm.normalized),
        },
        { status: 429 }
      );
    }

    // 5. Construct secure public SOS URL
    const baseUrl = getPublicBaseUrl(req);
    const sosUrl = `${baseUrl}/sos`;

    // 6. Format emergency message
    const message = `ResQ-Lane emergency assistance: Open this link to share your current highway location and travel direction: ${sosUrl}`;

    // 7. Dispatch via provider adapter
    const result = await sendSms({
      to: norm.normalized,
      message,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : result.status === 'CONFIG_MISSING' ? 200 : 502,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMsg, status: 'FAILED' },
      { status: 500 }
    );
  }
}
