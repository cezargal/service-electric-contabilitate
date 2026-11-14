import { NextRequest, NextResponse } from 'next/server';
import { createCipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_URL = 'https://logincert.anaf.ro/anaf-oauth2/v1/token';
const CALLBACK_URL = 'https://factura.service-electric.ro/api/anaf/callback';

function page(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;max-width:680px;margin:10vh auto;padding:24px"><h1>${title}</h1><p>${message}</p><p><a href="/">Ãnapoi Ã®n aplicaÈ›ie</a></p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } },
  );
}

function encryptToken(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAu©Ñ•¹ĞµQåÁ”œè€…ÁÁ±¥…Ñ¥½¸½àµİİÜµ™½É´µÕÉ±•¹½‘•œ°•ÁĞè€…ÁÁ±¥…Ñ¥½¸½©Í½¸œô°(€€€€€‰½‘ä°…¡”è€¹¼µÍÑ½É”œ°(€€€ô¤ì(€€€½¹ÍĞÁ…å±½…€ô…İ…¥ĞÑ½­•¹I•ÍÁ½¹Í”¹©Í½¸ ¤¹…Ñ   ¤€ôø¹Õ±°¤ì(€€€¥˜€ …Ñ½­•¹I•ÍÁ½¹Í”¹½¬ñğ€…Á…å±½…ü¹…•ÍÍ}Ñ½­•¸ñğ€…Á…å±½…ü¹É•™É•Í¡}Ñ½­•¸¤ì(€€€€€½¹Í½±”¹•ÉÉ½È 9Ñ½­•¸•á¡…¹”™…¥±•œ°Ñ½­•¹I•ÍÁ½¹Í”¹ÍÑ…ÑÕÌ°Á…å±½…ü¹•ÉÉ½È€üü€¥¹Ù…±¥‘}É•ÍÁ½¹Í”œ¤ì(€€€€€É•ÑÕÉ¸Á…” ½¹•Ñ…É•„9¹Ô„É•×"e¥Ğœ°€9¹Ô„•µ¥ÌÑ½­•¹ÕÉ¥±”¸Y•É¥™¥ƒ¹¹É•¥ÍÑÉ…É•„=ÕÑ ƒ"e¤ƒ¹¹•…É‘¥¸¹½Ô¸œ°€ÔÀÈ¤ì(€€€ô((€€€½¹ÍĞÍ…Ù”€ô…İ…¥Ğ™•Ñ ¡€‘íÍÕÁ…‰…Í•UÉ±ô½É•ÍĞ½ØÄ½ÉÁŒ½Í…Ù•}…¹…™}½…ÕÑ¡}Ñ½­•¹Í€°ì(€€€€€µ•Ñ¡½è€A=MPœ°(€€€€€¡•…‘•ÉÌèì…Á¥­•äè…¹½¹-•ä°ÕÑ¡½É¥é…Ñ¥½¸è	•…É•È€‘í…¹½¹-•åõ€°€½¹Ñ•¹ĞµQåÁ”œè€…ÁÁ±¥…Ñ¥½¸½©Í½¸œô°(€€€€€‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡ì(€€€€€€€Á}Í•É•ĞèÍÑ½É…•M•É•Ğ°(€€€€€€€Á}…•ÍÍ}Ñ½­•¹}•¹Œè•¹ÉåÁÑQ½­•¸¡Á…å±½…¹…•ÍÍ}Ñ½­•¸°­•ä¤°(€€€€€€€Á}É•™É•Í¡}Ñ½­•¹}•¹Œè•¹ÉåÁÑQ½­•¸¡Á…å±½…¹É•™É•Í¡}Ñ½­•¸°­•ä¤°(€€€€€€€Á}Ñ½­•¹}ÑåÁ”èÁ…å±½…¹Ñ½­•¹}ÑåÁ”€üü€	•…É•Èœ°(€€€€€€€Á}Í½Á”èÁ…å±½…¹Í½Á”€üü¹Õ±°°(€€€€€€€Á}•áÁ¥É•Í}…Ğè¹•Ü…Ñ”¡…Ñ”¹¹½Ü ¤€¬9Õµ‰•È¡Á…å±½…¹•áÁ¥É•Í}¥¸€üü€ÌØÀÀ¤€¨€ÄÀÀÀ¤¹Ñ½