// Textos del administrador (Act. 17): salen de src/i18n/es.json y qu.json (rama "admin").
// Los archivos de src/pages que empiezan con "_" no son rutas.
//   ta(clave, vars)      → texto del servidor en el idioma de la cookie ("comun.cancelar", "cursos.titulo"…)
//   textosCliente(ramas) → objeto plano { "cursos.titulo": "…" } para el JavaScript del navegador
//                          (va en <script type="application/json" id="textos-admin">, ver scripts/admin-util.ts).
import es from '../../i18n/es.json';
import { traductor, type Idioma, type Variables } from '../../i18n';

type Rama = 'comun' | 'panel' | 'cursos' | 'usuarios' | 'certificados';

export function textosAdmin(idioma: Idioma, estres = false) {
  const t = traductor(idioma, estres);
  const ta = (clave: string, variables?: Variables) => t(`admin.${clave}`, variables);
  const textosCliente = (...ramas: Rama[]): Record<string, string> => {
    const salida: Record<string, string> = {};
    for (const rama of ['comun', ...ramas] as Rama[]) {
      for (const clave of Object.keys(es.admin[rama])) salida[`${rama}.${clave}`] = ta(`${rama}.${clave}`);
    }
    return salida;
  };
  return { ta, textosCliente };
}
