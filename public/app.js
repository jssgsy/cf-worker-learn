// Vue 3 应用：只负责调 Worker 的 /api/* 接口并渲染状态
import { createApp, ref, computed, onMounted } from "vue";

/** 所有请求都走同源的 /api/*，由 Worker 处理 */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

createApp({
  setup() {
    const todos = ref([]);
    const loading = ref(false);
    const pending = ref(false); // 提交中，避免重复点击
    const error = ref("");
    const newTitle = ref("");

    const remaining = computed(() => todos.value.filter((t) => !t.done).length);

    async function load() {
      loading.value = true;
      error.value = "";
      try {
        todos.value = (await api("/api/todos")).todos;
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    }

    async function add() {
      const title = newTitle.value.trim();
      if (!title) return;
      pending.value = true;
      error.value = "";
      try {
        const todo = await api("/api/todos", { method: "POST", body: JSON.stringify({ title }) });
        todos.value.unshift(todo);
        newTitle.value = "";
      } catch (e) {
        error.value = e.message;
      } finally {
        pending.value = false;
      }
    }

    async function toggle(todo) {
      error.value = "";
      const next = !todo.done;
      todo.done = next; // 乐观更新
      try {
        await api(`/api/todos/${todo.id}`, { method: "PATCH", body: JSON.stringify({ done: next }) });
      } catch (e) {
        todo.done = !next; // 失败回滚
        error.value = e.message;
      }
    }

    async function remove(todo) {
      error.value = "";
      try {
        await api(`/api/todos/${todo.id}`, { method: "DELETE" });
        todos.value = todos.value.filter((t) => t.id !== todo.id);
      } catch (e) {
        error.value = e.message;
      }
    }

    onMounted(load);

    return { todos, loading, pending, error, newTitle, remaining, add, toggle, remove };
  },
}).mount("#app");
