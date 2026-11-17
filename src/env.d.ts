/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Usuario con sesión, o null si nadie inició sesión. */
    usuario: import('./lib/repositorio').Usuario | null;
    /** Idioma de la interfaz (cookie "idioma"; por defecto español). Act. 17. */
    idioma: import('./i18n').Idioma;
    /** Prueba de estrés de traducciones (?i18n=estres, solo desarrollo). */
    estres: boolean;
  }
}
