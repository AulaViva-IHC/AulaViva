// POST /api/logout  →  cierra la sesión y vuelve al login.
import type { APIRoute } from 'astro';
import { cerrarSesion } from '../../lib/sesiones';

export const POST: APIRoute = async ({ cookies, redirect }) => {
  await cerrarSesion(cookies);
  return redirect('/login', 303);
};
