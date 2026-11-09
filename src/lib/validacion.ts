// Reglas compartidas entre el navegador y el servidor.

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

/** Devuelve un mensaje que dice qué hacer, o null si el correo es válido. */
export function validarCorreo(correo: string): string | null {
  const limpio = correo.trim();
  if (!limpio) return 'Escribe tu correo electrónico.';
  if (!limpio.includes('@')) return 'Al correo le falta la @. Ejemplo: nombre@correo.com';
  if (!PATRON_CORREO.test(limpio)) return 'Revisa el correo; debe verse así: nombre@correo.com';
  if (limpio.length > 190) return 'El correo es demasiado largo.';
  return null;
}

export function validarPassword(password: string): string | null {
  if (!password) return 'Escribe tu contraseña.';
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}

/** "Gonzalo Barreto" o "gbarreto@correo.com" → "GB" */
export function iniciales(texto: string): string {
  const base = texto.includes('@') ? texto.split('@')[0] : texto;
  const palabras = base.split(/[\s._-]+/).filter(Boolean);
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

// ─── Crear cuenta ──────────────────────────────────────────────────

/** Quita espacios de más: "  Ana   Pérez " → "Ana Pérez". */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ');
}

export function validarNombre(nombre: string): string | null {
  const limpio = normalizarNombre(nombre);
  if (!limpio) return 'Escribe tu nombre completo.';
  if (limpio.length > 100) return 'El nombre es demasiado largo (máximo 100 caracteres).';
  if (!/^[\p{L}\p{M}' .-]+$/u.test(limpio)) return 'Usa solo letras, espacios, guiones o apóstrofos.';
  if (limpio.split(' ').length < 2) return 'Escribe tu nombre y al menos un apellido: así saldrá en tu certificado.';
  return null;
}

/** Requisitos de la contraseña nueva; se marcan en verde mientras se escribe. */
export const REQUISITOS_PASSWORD = [
  { id: 'largo', texto: '8 caracteres o más', falta: '8 caracteres', cumple: (p: string) => p.length >= 8 },
  { id: 'mayuscula', texto: 'Una mayúscula', falta: 'una mayúscula', cumple: (p: string) => /\p{Lu}/u.test(p) },
  { id: 'numero', texto: 'Un número', falta: 'un número', cumple: (p: string) => /\d/.test(p) },
] as const;

/** "a, b y c" */
export function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

export function validarPasswordNueva(password: string): string | null {
  if (!password) return 'Crea una contraseña.';
  if (password.length > 200) return 'La contraseña es demasiado larga (máximo 200 caracteres).';
  const faltan = REQUISITOS_PASSWORD.filter((r) => !r.cumple(password)).map((r) => r.falta);
  if (faltan.length) return `A tu contraseña le falta: ${enumerar(faltan)}.`;
  return null;
}

/** 0 = vacía, 1 débil, 2 media, 3 fuerte (cumple todo), 4 muy fuerte (y 12+ caracteres). */
export function fuerzaPassword(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const cumplidos = REQUISITOS_PASSWORD.filter((r) => r.cumple(password)).length;
  if (cumplidos === 3) return password.length >= 12 ? 4 : 3;
  return cumplidos >= 2 ? 2 : 1;
}

export function validarConfirmacion(password: string, confirmacion: string): string | null {
  if (!confirmacion) return 'Vuelve a escribir tu contraseña.';
  if (password !== confirmacion) return 'Las contraseñas no coinciden. Vuelve a escribirla igual.';
  return null;
}

// ─── Búsqueda ──────────────────────────────────────────────────────

/** Minúsculas y sin tildes, letra por letra (mantiene el largo para poder resaltar). */
export function normalizarBusqueda(texto: string): string {
  return [...texto.toLowerCase()].map((c) => c.normalize('NFD').replace(/\p{M}/gu, '') || c).join('');
}
