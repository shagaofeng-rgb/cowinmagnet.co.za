(function () {
  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const response = await fetch(path, { credentials: "same-origin", ...options, headers });
    const data = await response.json().catch(() => ({ success: false, error: "Invalid JSON response" }));
    if (!response.ok || data.success === false) throw new Error(data.error || `Request failed: ${response.status}`);
    return data.data;
  }

  function initLogin() {
    const form = document.querySelector("[data-login-form]");
    if (!form) return;

    document.querySelector("[data-toggle-password]")?.addEventListener("click", (event) => {
      const input = form.querySelector("input[name='password']");
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      event.currentTarget.textContent = visible ? "\u663e\u793a" : "\u9690\u85cf";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = form.querySelector("[data-status]");
      status.textContent = "";
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        await api("/api/login", { method: "POST", body: JSON.stringify(payload) });
        window.location.href = "/admin/";
      } catch (error) {
        status.textContent = error.message || "\u767b\u5f55\u5931\u8d25";
      }
    });
  }

  initLogin();
})();
