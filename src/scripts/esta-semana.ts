// "Esta semana" del panel de acceso (login y registro). Se carga aparte del formulario:
// si falla, solo esta parte muestra el estado parcial con "Reconectar".
import { ponerEstado, estaOcupado } from './boton';
import { $, completarCarga, plantilla, semaforo, simulacion } from './util';

interface Tarea {
  titulo: string;
  venceEnDias: number;
}

export function iniciarEstaSemana(): void {
  const semana = $<HTMLElement>('[data-semana]');
  const cargando = $<HTMLElement>('[data-semana-cargando]', semana);
  const lista = $<HTMLUListElement>('[data-semana-lista]', semana);
  const error = $<HTMLElement>('[data-semana-error]', semana);
  const reconectar = $<HTMLButtonElement>('[data-accion="reconectar"]', error);

  function fila(tarea: Tarea): Node {
    const { tono, texto } = semaforo(tarea.venceEnDias);
    const f = plantilla(`tarea-${tono}`, semana);
    f.querySelector('[data-tarea]')!.textContent = tarea.titulo;
    f.querySelector('[data-badge-texto]')!.textContent = texto;
    return f;
  }

  async function cargar(fallar: boolean): Promise<void> {
    semana.setAttribute('aria-busy', 'true');
    error.hidden = true;
    lista.hidden = true;
    cargando.hidden = false;
    const inicio = performance.now();
    try {
      const r = await fetch(`/api/esta-semana${fallar ? '?simular=fallo' : ''}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(String(r.status));
      const { tareas } = (await r.json()) as { tareas: Tarea[] };
      await completarCarga(inicio);
      lista.replaceChildren(...tareas.slice(0, 3).map(fila));
      lista.hidden = false;
    } catch {
      await completarCarga(inicio);
      error.hidden = false;
    } finally {
      cargando.hidden = true;
      semana.setAttribute('aria-busy', 'false');
    }
  }

  reconectar.addEventListener('click', async () => {
    if (estaOcupado(reconectar)) return;
    ponerEstado(reconectar, 'cargando');
    await cargar(false);
    ponerEstado(reconectar, 'normal');
  });

  void cargar(simulacion() === 'parcial');
}
