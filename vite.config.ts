import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  server: {
    port: 5180,
    proxy: {
      // 开发期把 /dev-api 转发到本地后端（默认 9527），生产期由 VITE_APP_BASE_API 覆盖
      "/dev-api": {
        target: "http://localhost:9527",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dev-api/, ""),
      },
    },
  },
});
