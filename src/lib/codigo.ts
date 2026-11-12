// Código de certificado: reglas compartidas navegador/servidor (CLAUDE.md §8).
// 10 caracteres en mayúsculas y números, sin caracteres ambiguos: sin O, 0, I ni 1.

export const LARGO_CODIGO = 10;
const PERMITIDO = /[A-HJ-NP-Z2-9]/;

/** Mayúsculas y sin espacios ni guiones (se aceptan pegados de "K7Q2-M9XPD4"). */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[\s-]/g, '');
}

/** Saca el código de lo que lee el QR: el enlace …/verificar?codigo=XXXX o el código solo. */
export function codigoDesdeQR(texto: string): string {
  try {
    const url = new URL(texto);
    const c = url.searchParams.get('codigo');
    if (c) return normalizarCodigo(c);
  } catch {
    /* no es un enlace */
  }
  return normalizarCodigo(texto);
}

/**
 * Mensaje que dice qué hacer, o null si el código es válido.
 * `final` = al enviar o al salir del campo (exige los 10); mientras escribe solo avisa de caracteres.
 */
export function validarCodigo(codigo: string, final = true): string | null {
  const malos = [...new Set([...codigo].filter((c) => !PERMITIDO.test(c)))];
  if (malos.length) {
    const ambiguos = malos.filter((c) => 'O0I1'.includes(c));
    if (ambiguos.length) {
      return `Los códigos no usan ${ambiguos.join(', ')} (se confunden). Revisa el certificado: quizá es ${ambiguos
        .map((c) => ({ O: 'Q o D', '0': 'Q o D', I: 'J o L', '1': 'J o L' })[c as 'O'])
        .join(' / ')}.`;
    }
    return 'El código solo tiene letras y números.';
  }
  if (!final) return null;
  if (!codigo) return 'Escribe el código de 10 caracteres que aparece en el certificado.';
  if (codigo.length < LARGO_CODIGO) {
    const faltan = LARGO_CODIGO - codigo.length;
    return `Faltan ${faltan} ${faltan === 1 ? 'carácter' : 'caracteres'}: el código tiene ${LARGO_CODIGO}.`;
  }
  if (codigo.length > LARGO_CODIGO) return `Sobran ${codigo.length - LARGO_CODIGO}: el código tiene ${LARGO_CODIGO} caracteres.`;
  return null;
}
