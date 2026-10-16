/**
 * Todo 数据与增删改查 handler。
 *
 * ⚠️ 这里用的是**模块级内存变量**，只用于演示：
 * Worker 会在全球多个 isolate 里运行，数据既不共享也不持久，
 * 冷启动/重新部署后就没了。真实项目请换成 KV、D1 或 Durable Objects。
 */
import { json } from "./http.js";

let nextId = 3;
let todos = [
  { id: 1, title: "通读 wrangler dev 的输出", done: true, createdAt: "2026-10-16T01:00:00.000Z" },
  { id: 2, title: "用 curl 调一遍 /api/todos", done: false, createdAt: "2026-10-16T01:01:00.000Z" },
];

/** 解析请求体，格式不对返回 null 而不是抛异常 */
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** GET /api/todos */
export function listTodos() {
  return json({ count: todos.length, todos });
}

/** POST /api/todos  body: { title: string } */
export async function createTodo({ request }) {
  const body = await readJson(request);
  const title = String(body?.title ?? "").trim();
  if (!title) return json({ error: "title 不能为空" }, 400);

  const todo = { id: nextId++, title, done: false, createdAt: new Date().toISOString() };
  todos.push(todo);
  return json(todo, 201);
}

/** PATCH /api/todos/:id  body: { title?, done? } */
export async function updateTodo({ request, params }) {
  const todo = todos.find((t) => t.id === Number(params.id));
  if (!todo) return json({ error: `todo ${params.id} 不存在` }, 404);

  const body = await readJson(request);
  if (!body) return json({ error: "请求体必须是 JSON" }, 400);

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return json({ error: "title 不能为空" }, 400);
    todo.title = title;
  }
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean") return json({ error: "done 必须是布尔值" }, 400);
    todo.done = body.done;
  }
  todo.updatedAt = new Date().toISOString();

  return json(todo);
}

/** DELETE /api/todos/:id */
export function deleteTodo({ params }) {
  const before = todos.length;
  todos = todos.filter((t) => t.id !== Number(params.id));
  if (todos.length === before) return json({ error: `todo ${params.id} 不存在` }, 404);
  return json({ deleted: Number(params.id) });
}
