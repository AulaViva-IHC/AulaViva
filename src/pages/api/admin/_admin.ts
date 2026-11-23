// Ayuda común de las APIs del administrador (los archivos con "_" no son rutas).
// Cada API revisa la sesión por su cuenta: 401 sin sesión, 403 si no es admin.
import type { Usuario } from '../../../lib/repositorio';
import { json } from '../../../lib/respuestas';

export function soloAdmin(usuario: Usuario | null | undefined): Response | null {
  if (!usuario) return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Inicia sesión otra vez.' }, 401);
  if (usuario.rol !== 'admin') return json({ error: 'sin-permiso', mensaje: 'Solo el administrador puede hacer esto.' }, 403);
  return null;
}
