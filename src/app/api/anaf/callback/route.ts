import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_URL = 'https://logincert.anaf.ro/anaf-oauth2/v1/token';
const CALLBACK_URL = 'https://factura.service-electric.ro/api/anaf/callback';

function page(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;max-width:680px;margin:10vh auto;padding:24px"><h1>${title}</h1><p>${message}</p><p><a href="/">ÃŽnapoi Ã®n aplicaÈ›ie</a></p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } },
  );
}

function encryptToken(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString('base64')).join('.');
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const error = params.get('error');
  const state = params.get('state');
  const expectedState = request.cookies.get('anaf_oauth_state')?.value;

  if (¶»§q«^