import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

const AUTHORIZE_URL = 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize';
const CALLBACK_URL = 'https://factura.service-electric.ro/api/anaf/callback';

export async function GET() {
  const clientId = process.env.ANAF_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Lipsește configurarea ANAF_CLIENT_ID pe server.' }, { status: 503 });
  }

  const state = randomBytes(32).toString('hex');
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', CALLBACK_URL);
  url.searchParams.set('token_content_type', 'jwt');

  const response = NextResponse.redirect(url);
  response.cookies.set('anaf_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/anaf',
    maxAge: 600,
  });
  // ANAF's documented flow leaves state empty; retain a local nonce cookie for callback CSRF checks.
  // The callback validates the nonce only if ANAF returns it.
  return response;
}
