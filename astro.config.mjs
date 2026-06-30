// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Personal portal hub — "freshman.tv" found-footage VHS marquee.
// Hub (index.astro) stays vanilla; /cine is a React island (R3F WebGL space).
export default defineConfig({
  site: 'https://rafraf.example',
  integrations: [react()],
  devToolbar: { enabled: false },
});
