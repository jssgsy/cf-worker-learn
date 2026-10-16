# cf-worker-learn — Cloudflare Worker + Vue 3 入门示例

一个最小但完整的例子：**Worker 负责 `/api/*` 接口，静态资源层负责 Vue 页面**，
用来理解请求如何路由到 Worker，以及 `wrangler dev` / `wrangler deploy` 的用法。

## 目录结构

```
cf-worker-learn/
├── wrangler.jsonc        # Worker 配置（名字、入口、静态资源目录…）
├── package.json          # npm scripts: dev / deploy / tail
├── src/
│   ├── index.js          # Worker 入口：fetch(request, env, ctx)，所有非静态请求的落点
│   ├── router.js         # 路由表：url 路径 + 方法 → handler
│   ├── todos.js          # 业务逻辑：内存版 Todo CRUD
│   └── http.js           # json() 响应助手
└── public/               # 静态资源（Cloudflare 直接返回，不经过 Worker）
    ├── index.html        # Vue 页面，模板写在 HTML 里
    ├── app.js            # Vue 应用逻辑，调用 /api/*
    └── style.css
```

## 请求是怎么路由到 Worker 的（重点）

```
浏览器  http://localhost:8787/api/todos
   │
   ▼
Cloudflare 边缘（线上） / 本地 Miniflare+workerd（wrangler dev）
   │
   ▼  第 1 段：静态资源路由（wrangler.jsonc 的 assets 配置决定）
   ├─ 能匹配到 public/ 下的文件（/ 、/app.js、/style.css）
   │     → 静态资源层直接返回，**根本不进 Worker**
   └─ 匹配不到（/api/todos、/api/任意、随便什么不存在的路径）
         → 第 2 段：进入 Worker（src/index.js 的 fetch）
              │
              ▼  Worker 内部路由（src/router.js 的 routes 表）
              ├─ GET  /api/health      → 健康检查
              ├─ GET  /api/todos       → listTodos
              ├─ POST /api/todos       → createTodo
              ├─ PATCH  /api/todos/:id → updateTodo
              ├─ DELETE /api/todos/:id → deleteTodo
              ├─ 路径对、方法不对       → 405 + Allow 头
              └─ 都不认识              → 404 JSON
```

两个关键点：

1. **第一段路由由 `assets` 配置决定**。默认（没写 `run_worker_first`）是"静态资源优先"。
   想让 Worker 先执行、自己决定要不要吐静态文件，可以加：
   ```jsonc
   "assets": { "directory": "./public", "run_worker_first": true }
   // 此时在代码里用 env.ASSETS.fetch(request) 手动返回文件
   ```
2. **第二段路由是你自己写的代码**：`src/router.js` 里一张 `method + path → handler`
   的表，字符串逐段比较，`:id` 是路径参数。

验证响应确实来自 Worker：响应头里有 `x-served-by: cf-worker-learn`；
静态文件（如 `curl -I localhost:8787/style.css`）没有这个头。

## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/todos` | 列表 |
| POST | `/api/todos` | 新增，body `{"title":"..."}` |
| PATCH | `/api/todos/:id` | 改标题/完成状态，body `{"title"?,"done"?}` |
| DELETE | `/api/todos/:id` | 删除 |

```bash
curl localhost:8787/api/todos
curl -X POST localhost:8787/api/todos -H 'content-type: application/json' -d '{"title":"写部署脚本"}'
curl -X PATCH localhost:8787/api/todos/2 -H 'content-type: application/json' -d '{"done":true}'
curl -X DELETE localhost:8787/api/todos/2
curl -X POST localhost:8787/api/todos -H 'content-type: application/json' -d '{}'   # 400
curl localhost:8787/api/nope                                                        # 404
curl -X PUT localhost:8787/api/todos                                                # 405
```

## wrangler dev 用法

```bash
npm run dev              # 本地模拟（Miniflare + workerd），默认 http://localhost:8787
npm run dev -- --port 3000
npm run dev:remote       # --remote：跑在 Cloudflare 真实沙箱里，能访问真实绑定
npm run tail             # 线上日志流（本地 dev 时日志直接打在终端）
```

- 改 `src/*` 会**热重载**；改 `public/*` 会触发浏览器刷新。
- 本地数据是进程内存里的：重启 `wrangler dev` 后 Todo 会回到初始状态（这是正常的）。
- `.wrangler/` 是本地运行时状态目录，已 gitignore。

## 部署

```bash
npm run deploy           # = wrangler deploy，构建产物上传到 Cloudflare
```

部署后访问 `https://cf-worker-learn.<你的子域>.workers.dev`（可用
`npx wrangler deployments list` 查看，`npx wrangler dev --remote` 可对线上版本做调试）。
静态资源会随 Worker 一起上传（`public/` 由平台托管）。

## 后续可扩展

- **持久化**：`src/todos.js` 用的是模块级内存变量，多 isolate 不共享、重启即丢，
  生产环境换成 [KV](https://developers.cloudflare.com/kv/)、[D1](https://developers.cloudflare.com/d1/)
  或 Durable Objects（在 `wrangler.jsonc` 里加绑定即可，业务代码只改 `todos.js`）。
- **绑定示例**：`"kv_namespaces": [{ "binding": "TODO_KV", "id": "..." }]` → 代码里 `env.TODO_KV.get(...)`。
- **自定义域名/路由**：`wrangler.jsonc` 里配置 `"routes": [{ "pattern": "api.example.com/*" }]`
  或在 dashboard 给 Worker 绑定自定义域名，这就是**第 0 段路由**——请求根本不进静态资源，
  直接由 DNS/route 规则指到这个 Worker。
- **换打包器**：本例免构建（Vue 走 CDN importmap）。若要 npm 依赖/组件化，再引入 Vite，
  构建产物目录指给 `assets.directory` 即可，Worker 部分完全不变。
