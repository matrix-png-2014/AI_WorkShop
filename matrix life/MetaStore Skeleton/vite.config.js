import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Vite 开发环境配置
 * ------------------------------------------------------------------
 * - base 使用相对路径，保证 build 产物可在任意子路径部署
 * - 预留 alias '@' -> src，便于深路径引用
 * - 静态资源（models / textures / draco）统一放 public/ 下
 */
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true, // 局域网可访问，便于手机端陀螺仪调试
    port: 5173,
    strictPort: true, // 端口被占用时报错而非漂移，保证 .command 启动器 URL 恒定
    open: false,
  },
  build: {
    chunkSizeWarningLimit: 1500,
    target: 'es2020',
  },
});
