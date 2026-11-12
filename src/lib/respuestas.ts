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

/** ?simular=… de una API (solo en desarrollo; lo usa /estados). */
export function simulacionDe(url: URL): string {
  return import.meta.env.DEV ? (url.searchParams.get('simular') ?? '') : '';
}

/** "Hace 1 día", "Hace 3 días", "Hace 1 semana"… (para la última visita). */
export function haceCuanto(fecha: Date, ahora = new Date()): string {
  const horas = Math.max(0, (ahora.getTime() - fecha.getTime()) / 3_600_000);
  if (horas < 1) return 'Hace un momento';
  if (horas < 24) return `Hace ${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return dias === 1 ? 'Hace 1 día' : `Hace ${dias} días`;
  const semanas = Math.floor(dias / 7);
  if (semanas < 5) return semanas === 1 ? 'Hace 1 semana' : `Hace ${semanas} semanas`;
  const meses = Math.floor(dias / 30);
  return meses <= 1 ? 'Hace 1 mes' : `Hace ${meses} meses`;
}
