/**
 * 路由表：把 url 路径 + HTTP 方法 映射到具体 handler。
 * 想新增接口？在 routes 里加一行即可。
 */
import { listTodos, createTodo, updateTodo, deleteTodo } from "./todos.js";
import { json } from "./http.js";

const routes = [
  { method: "GET", pattern: "/api/health", handler: () => json({ ok: true, now: new Date().toISOString() }) },
  { method: "GET", pattern: "/api/todos", handler: listTodos },
  { method: "POST", pattern: "/api/todos", handler: createTodo },
  { method: "PATCH", pattern: "/api/todos/:id", handler: updateTodo },
  { method: "DELETE", pattern: "/api/todos/:id", handler: deleteTodo },
];

/**
 * 把 "/api/todos/42" 与 "/api/todos/:id" 逐段比较。
 * 匹配成功返回参数对象 { id: "42" }，失败返回 null。
 */
function match(pattern, pathname) {
  const patternSegs = pattern.split("/").filter(Boolean);
  const pathSegs = pathname.split("/").filter(Boolean);
  if (patternSegs.length !== pathSegs.length) return null;

  const params = {};
  for (let i = 0; i < patternSegs.length; i++) {
    const seg = patternSegs[i];
    if (seg.startsWith(":")) {
      params[seg.slice(1)] = decodeURIComponent(pathSegs[i]);
    } else if (seg !== pathSegs[i]) {
      return null;
    }
  }
  return params;
}

/** Worker 内部路由：路径匹配 → 方法匹配 → 调用 handler */
export function dispatch(request, env) {
  const { pathname } = new URL(request.url);
  // 归一化：去掉尾部斜杠，"/" 保持不变
  const path = pathname.replace(/\/+$/, "") || "/";

  const allowed = new Set();

  for (const route of routes) {
    const params = match(route.pattern, path);
    if (!params) continue;

    allowed.add(route.method); // 路径存在，只是方法不对
    if (route.method !== request.method) continue;

    return route.handler({ request, env, params });
  }

  if (allowed.size > 0) {
    const allow = [...allowed].join(", ");
    return json({ error: "Method Not Allowed", allow }, 405, { allow });
  }
  return json({ error: "Not Found", path }, 404);
}
