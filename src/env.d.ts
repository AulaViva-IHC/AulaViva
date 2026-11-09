/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Usuario con sesión, o null si nadie inició sesión. */
    usuario: import('./lib/repositorio').Usuario | null;
  }
}
