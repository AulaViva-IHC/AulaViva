// Sesión en cookie httpOnly (7 días). La cookie lleva un token aleatorio;
// en el repositorio solo se guarda su HMAC con SESSION_SECRET.
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { AstroCookies } from 'astro';
import { crearSesion, buscarSesion, eliminarSesion, type Usuario } from './repositorio';

export const COOKIE_SESION = 'av_sesion';
const DURACION_MS = 7 * 24 * 60 * 60 * 1000;

// Node lee el .env por sí mismo; las variables del sistema tienen prioridad.
if (!process.env.SESSION_SECRET && existsSync('.env')) process.loadEnvFile('.env');

function secreto(): string {
  const valor = process.env.SESSION_SECRET;
  if (!valor || valor.length < 32) {
    throw new Error('Falta SESSION_SECRET en .env (mínimo 32 caracteres). Revisa .env.example.');
  }
  return valor;
}

function idDeToken(token: string): string {
  return createHmac('sha256', secreto()).update(token).digest('hex');
}

function opcionesCookie() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: import.meta.env.PROD,
  };
}

export async function iniciarSesion(cookies: AstroCookies, usuario: Usuario): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiraEn = new Date(Date.now() + DURACION_MS);
  await crearSesion(idDeToken(token), usuario.id, expiraEn);
  cookies.set(COOKIE_SESION, token, { ...opcionesCookie(), expires: expiraEn });
}

export async function usuarioDeCookie(cookies: AstroCookies): Promise<Usuario | null> {
  const token = cookies.get(COOKIE_SESION)?.value;
  if (!token) return null;
  const encontrada = await buscarSesion(idDeToken(token));
  if (!encontrada) {
    cookies.delete(COOKIE_SESION, opcionesCookie());
    return null;
  }
  return encontrada.usuario;
}

export async function cerrarSesion(cookies: AstroCookies): Promise<void> {
  const token = cookies.get(COOKIE_SESION)?.value;
  if (token) await eliminarSesion(idDeToken(token));
  cookies.delete(COOKIE_SESION, opcionesCookie());
}
