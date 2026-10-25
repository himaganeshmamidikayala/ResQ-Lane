import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  sendSms,
  normalizePhoneNumber,
  markIncidentNotified,
  getPublicBaseUrl,
  maskPhoneNumber,
} from '@/lib/sms';


/**
 * POST /api/sms/notify-responder
 * Automated responder notification: triggered after an SOS incident is confirmed in Supabase.
 * - Resolves incident record server-side using incidentId (never trusts client coordinates/direction)
 * - Resolves responder phone number strictly from server-side environment variables
 * - Enforces incident-level idempotency to prevent duplicate SMS transmissions
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Parse incidentId from request
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.', status: 'PROVIDER_REJECTED' },
        { status: 400 }
      );
    }

    const { incidentId } = body || {};
    if (!incidentId || typeof incidentId !== 'string') {
      return NextResponse.json(
        { error: 'Valid incident ID is required.', status: 'PROVIDER_REJECTED' },
        { status: 400 }
      );
    }

    // 2. Validate incidentId format (UUID check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(incidentId.trim())) {
      return NextResponse.json(
        { error: 'Invalid incident ID format.', status: 'PROVIDER_REJECTED' },
        { status: 400 }
      );
    }

    // 3. Idempotency Check — Prevent duplicate SMS for the same incident
    const isFirstNotification = markIncidentNotified(incidentId.trim());
    if (!isFirstNotification) {
      return NextResponse.json({
        success: true,
        status: 'ALREADY_PROCESSED',
        message: 'Notification has already been processed for this incident ID.',
        incidentId,
      });
    }

    // 4. Verify & Fetch verified incident details server-side from Supabase
    const { data: incident, error: dbError } = await supabase
      .from('incidents')
      .select('id, corridor, heading_direction, latitude, longitude, created_at, status')
      .eq('id', incidentId.trim())
      .single();

    if (dbError || !incident) {
      return NextResponse.json(
        {
          error: 'Incident record not found in database. Notification halted for unverified incident.',
          status: 'PROVIDER_REJECTED',
        },
        { status: 404 }
      );
    }

    // 5. Read responder phone number strictly from server environment
    const responderRaw = process.env.SMS_RESPONDER_PHONE;
    if (!responderRaw) {
      return NextResponse.json({
        success: false,
        status: 'CONFIG_MISSING',
        error: 'SMS_RESPONDER_PHONE is not configured in server environment variables.',
        incidentId: incident.id,
      });
    }

    const norm = normalizePhoneNumber(responderRaw);
    if (!norm.valid || !norm.normalized) {
      return NextResponse.json({
        success: false,
        status: 'CONFIG_MISSING',
        error: 'SMS_RESPONDER_PHONE in environment is not a valid phone number.',
        incidentId: incident.id,
      });
    }

    // 6. Format verified emergency dispatch alert message
    const baseUrl = getPublicBaseUrl(req);
    const dispatchUrl = `${baseUrl}/dispatch`;
    const shortId = incident.id.slice(0, 8);
    const lat = Number(incident.latitude).toFixed(4);
    const lng = Number(incident.longitude).toFixed(4);

    const message = `ResQ-Lane ALERT: Incident #${shortId} on ${incident.corridor} (Towards ${incident.heading_direction}). Location: ${lat}, ${lng}. View Live Dispatch: ${dispatchUrl}`;

    // 7. Dispatch SMS
    const result = await sendSms({
      to: norm.normalized,
      message,
    });

    return NextResponse.json({
      ...result,
      incidentId: incident.id,
      maskedRecipient: maskPhoneNumber(norm.normalized),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMsg, status: 'FAILED' },
      { status: 500 }
    );
  }
}
