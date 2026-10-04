/**
 * 后端地址：本项目里唯一写 IP/端口的地方，换环境只改这一行。
 *
 * 浏览器发出的请求仍然只用相对路径 `/api/v1`（见 `constants/api.ts`）与相对图片地址 `/uploads`，
 * 由 `vite.config.ts` 把这里的地址当作 dev proxy 的 target；
 * 生产环境前后端同域反向代理，构建产物里不会出现这个 IP，所以改它只影响本地开发。
 */
export const BACKEND_ORIGIN = 'http://127.0.0.1:8000'
