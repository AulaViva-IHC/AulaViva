// Respuestas JSON de las APIs: sin caché, en UTF-8.

export function json(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** IP del cliente; algunos entornos no la exponen. */
export function ipDe(obtener: () => string): string {
  try {
    return obtener();
  } catch {
    return 'desconocida';
  }
}

/** Lee el cuerpo JSON como objeto; null si no es válido. */
export async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const cuerpo = await request.json();
    return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : null;
  } catch {
    return null;
  }
}

export const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');
