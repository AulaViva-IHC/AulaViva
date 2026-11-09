// Contraseñas con scrypt de node:crypto (sin dependencias nativas) y bloqueo
// por intentos fallidos. Formato guardado: scrypt$N$r$p$salt(base64)$hash(base64)
import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import {
  buscarUsuarioPorCorreo,
  intentosRecientes,
  registrarIntento,
  type IntentoLogin,
  type Usuario,
} from './repositorio';

const N = 16384;
const R = 8;
const P = 1;
const LARGO = 64;

export const MAX_FALLOS = 5;
export const VENTANA_MS = 15 * 60 * 1000; // 5 fallos en 15 minutos…
export const BLOQUEO_MS = 5 * 60 * 1000; // …bloquean 5 minutos

function derivar(password: string, salt: Buffer, opciones: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, LARGO, opciones, (err, clave) =>
      err ? reject(err) : resolve(clave),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const clave = await derivar(password, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${clave.toString('base64')}`;
}

export async function verificarPassword(password: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  const clave = await derivar(password, Buffer.from(salt, 'base64'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  // Comparación en tiempo constante: no revela cuántos bytes coinciden.
  return clave.length === esperado.length && timingSafeEqual(clave, esperado);
}

// Hash de relleno para cuando el correo no existe: la respuesta tarda lo mismo
// y no se puede deducir si un correo está registrado.
let hashFalso: Promise<string> | null = null;
function hashDeRelleno(): Promise<string> {
  hashFalso ??= hashPassword(randomBytes(16).toString('hex'));
  return hashFalso;
}

/**
 * Recorre los intentos (del más antiguo al más reciente) y calcula si hay un
 * bloqueo vigente y cuántos fallos quedan antes del siguiente.
 * Un acierto o el fin de un bloqueo reinician la cuenta.
 */
export function calcularBloqueo(intentos: IntentoLogin[], ahora = Date.now()) {
  let fallos: number[] = [];
  let bloqueadoHasta = 0;
  for (const intento of intentos) {
    const t = intento.creadoEn.getTime();
    if (intento.exito) {
      fallos = [];
      continue;
    }
    fallos = fallos.filter((f) => f > t - VENTANA_MS);
    fallos.push(t);
    if (fallos.length >= MAX_FALLOS) {
      bloqueadoHasta = t + BLOQUEO_MS;
      fallos = [];
    }
  }
  const vigentes = fallos.filter((f) => f > ahora - VENTANA_MS).length;
  return {
    segundos: Math.max(0, Math.ceil((bloqueadoHasta - ahora) / 1000)),
    restantes: MAX_FALLOS - vigentes,
  };
}

async function estadoBloqueo(correo: string) {
  const desde = new Date(Date.now() - VENTANA_MS - BLOQUEO_MS);
  return calcularBloqueo(await intentosRecientes(correo, desde));
}

export type ResultadoLogin =
  | { tipo: 'ok'; usuario: Usuario }
  | { tipo: 'incorrecto'; restantes: number }
  | { tipo: 'bloqueado'; segundos: number };

/** Revisa el bloqueo, verifica la contraseña y deja registrado el intento. */
export async function autenticar(correo: string, password: string, ip: string): Promise<ResultadoLogin> {
  const antes = await estadoBloqueo(correo);
  if (antes.segundos > 0) return { tipo: 'bloqueado', segundos: antes.segundos };

  const usuario = await buscarUsuarioPorCorreo(correo);
  const valida = await verificarPassword(password, usuario?.passwordHash ?? (await hashDeRelleno()));
  const exito = valida && usuario !== null;
  await registrarIntento({ correo, ip, exito });

  if (exito) return { tipo: 'ok', usuario };
  const despues = await estadoBloqueo(correo);
  if (despues.segundos > 0) return { tipo: 'bloqueado', segundos: despues.segundos };
  return { tipo: 'incorrecto', restantes: despues.restantes };
}

/** Página de inicio según el rol. */
export function destinoPorRol(usuario: Pick<Usuario, 'rol'>): string {
  return usuario.rol === 'admin' ? '/admin/cursos/nuevo' : '/inicio';
}

/** Acepta solo rutas internas ("/algo"), nunca "//otro-sitio" ni URLs completas. */
export function rutaSegura(ruta: unknown): string | null {
  if (typeof ruta !== 'string') return null;
  if (!ruta.startsWith('/') || ruta.startsWith('//') || ruta.startsWith('/\\')) return null;
  if (ruta.startsWith('/login') || ruta.startsWith('/registro') || ruta.startsWith('/api/')) return null;
  return ruta;
}
