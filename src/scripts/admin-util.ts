// Utilidades de las pantallas del administrador (Fase 7).
//   tx(clave, vars) → texto del idioma elegido (Act. 17): lo pinta el servidor en
//                     <script type="application/json" id="textos-admin"> (ver src/pages/admin/_textos.ts).
//   cargarResumen() → la franja de resumen (GET /api/admin/panel) que llevan las 4 pantallas;
//                     si falla queda en parcial con "Reconectar" y el resto de la pantalla sigue.
//   Confirmación activa (CLAUDE.md §5.3): confirmacionActiva() cuenta 3 s antes de habilitar el botón.
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { $, completarCarga, ESPERA_EXITO_MS, esperar, pedirJSON, simulacion } from './util';

let textos: Record<string, string> | null = null;

export function tx(clave: string, variables: Record<string, string | number> = {}): string {
  textos ??= JSON.parse(document.getElementById('textos-admin')?.textContent ?? '{}') as Record<string, string>;
  const texto = textos[clave] ?? clave;
  return texto.replace(/\{(\w+)\}/g, (todo, nombre: string) => (nombre in variables ? String(variables[nombre]) : todo));
}

/** "a, b y c" para la lista de lo que falta. */
export function enumerar(partes: string[]): string {
  return partes.length < 2 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

/** Sin tildes ni mayúsculas: "Huamán" se encuentra escribiendo "huaman". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Guarda filtros y búsqueda en la URL sin recargar (se conservan al volver). */
export function guardarEnUrl(valores: Record<string, string>): void {
  const url = new URL(window.location.href);
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor) url.searchParams.set(clave, valor);
    else url.searchParams.delete(clave);
  }
  history.replaceState(null, '', url);
}

/** ?simular= para las APIs. En "parcial" la parte principal carga bien y la secundaria falla. */
export function sufijos(): { principal: string; secundaria: string; simular: string } {
  const simular = simulacion();
  if (!simular) return { principal: '', secundaria: '', simular };
  if (simular === 'parcial') return { principal: '?simular=ideal', secundaria: '?simular=error', simular };
  return { principal: `?simular=${simular}`, secundaria: '?simular=ideal', simular };
}

export interface Resumen {
  cursos: { publicados: number; programados: number; deshabilitados: number };
  estudiantes: number;
  inscripciones: number;
  certificados: { validos: number; anulados: number };
}

/**
 * Franja de resumen (región gris con 3 cifras). `[data-resumen]` contiene `[data-cifra="clave"]`
 * y un EstadoParcial oculto en `[data-resumen-parcial]`.
 */
export function iniciarResumen(cifras: (r: Resumen) => Record<string, number>): void {
  const raiz = document.querySelector<HTMLElement>('[data-resumen]');
  if (!raiz) return;
  const parcial = $<HTMLElement>('[data-resumen-parcial]', raiz);
  const lista = $<HTMLElement>('[data-resumen-cifras]', raiz);
  const reconectar = $<HTMLElement>('[data-accion="reconectar"]', parcial);

  async function cargar(reintento = false): Promise<void> {
    const { secundaria, simular } = sufijos();
    if (simular === 'cargando') return; // se queda con skeleton
    const inicio = performance.now();
    try {
      const { respuesta, datos } = await pedirJSON<{ resumen: Resumen }>(`/api/admin/panel${secundaria}`);
      if (!respuesta.ok) throw new Error('servidor');
      await completarCarga(inicio);
      if (reintento) {
        retroalimentar(reconectar, 'exito', tx('comun.resumenCargado'));
        await esperar(ESPERA_EXITO_MS);
        ponerEstado(reconectar, 'normal');
      }
      for (const [clave, valor] of Object.entries(cifras(datos.resumen))) {
        const nodo = raiz!.querySelector<HTMLElement>(`[data-cifra="${clave}"]`);
        if (nodo) {
          nodo.textContent = String(valor);
          nodo.classList.remove('skeleton');
        }
      }
      lista.hidden = false;
      parcial.hidden = true;
      raiz!.removeAttribute('aria-busy');
    } catch {
      await completarCarga(inicio);
      lista.hidden = true;
      parcial.hidden = false;
      raiz!.removeAttribute('aria-busy');
      if (reintento) retroalimentar(reconectar, 'error', tx('comun.resumenSigue'));
    }
  }

  reconectar.addEventListener('click', () => {
    if (estaOcupado(reconectar)) return;
    procesar(reconectar);
    void cargar(true);
  });
  void cargar();
}

/**
 * Confirmación activa de una acción irreversible (CLAUDE.md §5.3, admin-06 a admin-09):
 * mientras `listo()` sea falso el botón queda con aria-disabled (sigue enfocable) y `faltan`
 * dice qué falta; cuando todo está listo cuenta 3 s ("Anular en 3 s… 2 s… 1 s") y recién
 * entonces se habilita. Si algo deja de cumplirse, la cuenta vuelve a empezar.
 */
export function confirmacionActiva(opciones: {
  boton: HTMLElement;
  etiqueta: HTMLElement; // el texto visible del botón
  faltan: HTMLElement;
  accion: string; // "Anular"
  textoListo: string; // "Anular certificado"
  pendientes: () => string[];
}): { actualizar: () => void; reiniciar: () => void; habilitado: () => boolean } {
  const { boton, etiqueta, faltan, accion, textoListo, pendientes } = opciones;
  let temporizador = 0;
  let restante = 0;
  let listo = false;

  function pintar(): void {
    boton.setAttribute('aria-disabled', String(!listo));
    if (listo) {
      etiqueta.textContent = textoListo;
      faltan.textContent = '';
      faltan.dataset.listo = '';
    }
  }

  function parar(): void {
    window.clearInterval(temporizador);
    temporizador = 0;
  }

  function actualizar(): void {
    if (boton.dataset.estado === 'cargando' || boton.dataset.estado === 'exito') return;
    const lista = pendientes();
    if (lista.length) {
      parar();
      listo = false;
      etiqueta.textContent = accion;
      faltan.textContent = tx('comun.faltaParaHabilitar', { falta: enumerar(lista) });
      delete faltan.dataset.listo;
      pintar();
      return;
    }
    if (listo) {
      pintar();
      return;
    }
    if (temporizador) {
      boton.setAttribute('aria-disabled', 'true'); // sigue contando
      return;
    }
    // Todo listo: espera de 3 s con cuenta regresiva visible antes de habilitar.
    restante = 3;
    etiqueta.textContent = tx('comun.esperaSegundos', { accion, n: restante });
    faltan.textContent = '';
    delete faltan.dataset.listo;
    temporizador = window.setInterval(() => {
      restante -= 1;
      if (restante > 0) {
        etiqueta.textContent = tx('comun.esperaSegundos', { accion, n: restante });
        return;
      }
      parar();
      listo = true;
      pintar();
    }, 1000);
  }

  function reiniciar(): void {
    parar();
    listo = false;
    etiqueta.textContent = accion;
    pintar();
  }

  return { actualizar, reiniciar, habilitado: () => listo };
}
