// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Astro 7 compacta el HTML estilo JSX y borra espacios entre etiquetas en línea;
  // usamos el comportamiento clásico para que los textos se vean como se escriben.
  compressHTML: true,
  server: { port: 4321 },
});
