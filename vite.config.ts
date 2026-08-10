import { defineConfig } from "vite";
import { resolve } from "node:path";

// Project GitHub Pages serves from https://<user>.github.io/kkamdol/
// Override with VITE_BASE (e.g. "/" ) when using a custom domain.
const base = process.env.VITE_BASE ?? "/kkamdol/";

export default defineConfig({
  base,
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        calendar: resolve(__dirname, "calendar.html"),
        gallery: resolve(__dirname, "gallery.html"),
        event: resolve(__dirname, "event.html"),
        upload: resolve(__dirname, "upload.html"),
        "new-event": resolve(__dirname, "new-event.html"),
        import: resolve(__dirname, "import.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});
