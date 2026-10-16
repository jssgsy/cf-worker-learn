/**
 * Worker 入口（wrangler.jsonc 中 "main" 指向的文件）。
 *
 * 一个请求从浏览器到这里的完整链路：
 *
 *   浏览器  →  Cloudflare 边缘节点  →  先尝试静态资源（public/）
 *                                        ├─ 命中（如 /、/app.js）→ 直接返回文件，不进 Worker
 *                                        └─ 未命中（如 /api/todos）→ ↓ 进入本文件
 *                                      fetch(request, env, ctx)
 *                                        → src/router.js 路由表匹配
 *                                        → 具体 handler 处理并返回 Response
 */
import { dispatch } from "./router.js";
import { json } from "./http.js";

// 演示用的 CORS 头：让页面即便换了域名/端口也能调通 API。
// 生产环境请把 origin 收紧到你自己的域名。
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export default {
  /**
   * @param {Request} request  浏览器发来的 HTTP 请求
   * @param {object} env       wrangler.jsonc 里配置的绑定，例如 env.ASSETS
   * @param {object} ctx       执行上下文，ctx.waitUntil() 可以延长后台任务
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 预检请求，直接短路返回
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    try {
      // 这行日志会打印在 `wrangler dev` 的终端，线上则用 `wrangler tail` 查看
      console.log(`[worker] ${request.method} ${url.pathname}`);

      const response = await dispatch(request, env);

      // 统一附加响应头，x-served-by 用来确认"这个响应确实来自 Worker"
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
      headers.set("x-served-by", "cf-worker-learn");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      // 所有未捕获异常兜底成 JSON 500，避免把堆栈直接吐给浏览器
      console.error("[worker] uncaught:", err);
      return json({ error: "Internal Server Error", message: err?.message ?? String(err) }, 500, CORS);
    }
  },
};
