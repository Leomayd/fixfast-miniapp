// fixfast-miniapp/app.js
const API_BASE = "https://fixfastautobot.onrender.com";

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const screen = document.getElementById("screen");
const tabs = document.querySelectorAll(".tab");

const CATEGORIES = [
  "Мойка/шиномонтаж",
  "ТО/Ремонт",
  "Детейлинг",
  "Кузовной ремонт",
  "Тюнинг",
];

const CAR_CLASSES = ["Эконом", "Комфорт", "Бизнес", "Премиум", "SUV"];

// ====== STATE ======
let state = {
  tab: "requests",
  selectedCategory: null,

  // from server (Postgres)
  garage: [],
  activeCarId: "",
  points: 0,

  // requests
  myRequests: [],
  pollTimer: null,
};

// ====== TELEGRAM USER ======
function getTgUser() {
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;
  return { id: u.id, first_name: u.first_name, username: u.username };
}

function getInitData() {
  return tg?.initData || "";
}

// ====== HTML ESCAPE ======
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ====== STATUS LABELS ======
function statusLabel(st) {
  if (st === "new") return "🆕 Новая";
  if (st === "inwork") return "🛠️ В работе";
  if (st === "done") return "✅ Готово";
  if (st === "canceled") return "❌ Отменено";
  return st || "";
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString("ru-RU");
  } catch {
    return "";
  }
}

// ====== API ======
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ====== PROFILE (garage + points + activeCar) ======
async function loadProfile() {
  const data = await apiPost("/api/profile", { initData: getInitData() });

  state.garage = Array.isArray(data.garage) ? data.garage : [];
  state.activeCarId = data.activeCarId || state.garage[0]?.id || "";
  state.points = Number(data.points || 0) || 0;
}

function getActiveCar() {
  return (state.garage || []).find((c) => c.id === state.activeCarId) || null;
}

// ====== REQUESTS (server) ======
async function loadMyRequests() {
  const tgUser = getTgUser();
  if (!tgUser?.id) return;

  const data = await apiPost("/api/my-requests", { initData: getInitData() });
  state.myRequests = data.items || [];
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(async () => {
    if (state.tab !== "inwork") return;
    try {
      await loadMyRequests();
      renderInWork();
    } catch {}
  }, 5000);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

// ====== RENDER SWITCH ======
function render() {
  if (!screen) return;
  if (state.tab === "requests") return renderRequests();
  if (state.tab === "inwork") return renderInWork();
  if (state.tab === "profile") return renderProfile();
}

// ====== REQUESTS TAB ======
function renderRequests() {
  if (state.selectedCategory) return renderRequestForm(state.selectedCategory);

  const activeCar = getActiveCar();
  const activeLine = activeCar
    ? `🚘 Активное авто: <b>${escapeHtml(activeCar.title)}</b> • ${escapeHtml(activeCar.carClass)}`
    : `🚘 Добавьте авто в «Профиль → Гараж», чтобы подставлялось автоматически`;

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Выберите услугу, добавьте авто, опишите работы — мы быстро возьмём заявку.</div>
      <div class="hr"></div>

      <div class="grid">
        ${CATEGORIES.map(
          (c) => `
            <div class="item" data-cat="${escapeHtml(c)}">
              <div class="name">${escapeHtml(c)}</div>
              <div class="arrow">›</div>
            </div>
          `
        ).join("")}
      </div>

      <div class="hr"></div>
      <div class="small">${activeLine}</div>
      <div class="hr"></div>
      <div class="small">Стоимость услуги от 2 тыс ₽. Работы выполняет подключенный сервис.</div>
    </div>
  `;

  document.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", () => {
      state.selectedCategory = el.getAttribute("data-cat");
      render();
    });
  });
}

function renderRequestForm(category) {
  const cars = state.garage || [];
  const activeCar = getActiveCar();

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Заявка • ${escapeHtml(category)}</div>
      <div class="hr"></div>

      <div class="label">Авто из гаража</div>
      <select class="select" id="garageCar">
        <option value="">— Использовать активное —</option>
        ${cars
          .map((c) => {
            const sel = c.id === state.activeCarId ? "selected" : "";
            return `<option value="${escapeHtml(c.id)}" ${sel}>${escapeHtml(c.title)} • ${escapeHtml(
              c.carClass
            )}</option>`;
          })
          .join("")}
      </select>

      <div class="label">Класс машины</div>
      <select class="select" id="carClass">
        ${CAR_CLASSES.map((cl) => `<option value="${escapeHtml(cl)}">${escapeHtml(cl)}</option>`).join("")}
      </select>

      <div class="label">Марка / модель</div>
      <input class="input" id="carModel" placeholder="Например: BMW 5, Mercedes C, Tesla Model 3" />

      <div class="label">Описание работы</div>
      <textarea class="textarea" id="description" placeholder="Что нужно сделать: опишите задачу максимально конкретно"></textarea>

      <div class="row" style="margin-top:12px">
        <button class="tab" id="backBtn">Назад</button>
        <button class="btn" id="submitBtn">Оставить заявку</button>
      </div>
    </div>
  `;

  const carSel = document.getElementById("garageCar");
  const classSel = document.getElementById("carClass");
  const modelInp = document.getElementById("carModel");

  // автоподстановка из активного авто
  if (activeCar?.carClass) classSel.value = activeCar.carClass;
  if (activeCar?.title) modelInp.value = activeCar.title;

  // при выборе авто — подставляем класс/модель
  carSel?.addEventListener("change", () => {
    const id = carSel.value;
    const chosen = cars.find((c) => c.id === id) || activeCar;
    if (chosen?.carClass) classSel.value = chosen.carClass;
    if (chosen?.title) modelInp.value = chosen.title;
  });

  document.getElementById("backBtn")?.addEventListener("click", () => {
    state.selectedCategory = null;
    render();
  });

  document.getElementById("submitBtn")?.addEventListener("click", () => submitRequest(category));
}

async function submitRequest(category) {
  const carId = (document.getElementById("garageCar")?.value || "").trim();
  const carClass = (document.getElementById("carClass")?.value || "").trim();
  const carModel = (document.getElementById("carModel")?.value || "").trim();
  const description = (document.getElementById("description")?.value || "").trim();

  if (!carModel || !description) {
    tg?.showPopup?.({
      title: "Заполните поля",
      message: "Нужны «Марка/модель» и «Описание работы».",
      buttons: [{ type: "ok" }],
    });
    return;
  }

  const cars = state.garage || [];
  const activeCar = getActiveCar();
  const chosenCar = carId ? cars.find((c) => c.id === carId) || null : activeCar;

  const payload = {
    category,
    carClass,
    carModel,
    description,
    car: chosenCar
      ? {
          id: chosenCar.id,
          title: chosenCar.title,
          plate: chosenCar.plate || "",
          carClass: chosenCar.carClass || "",
        }
      : null,
    initData: getInitData(),
  };

  try {
    await apiPost("/api/request", payload);

    tg?.showPopup?.({
      title: "Заявка отправлена ✅",
      message: "После завершения работ вы получите 1000 бонусов. Статус появится во вкладке «В работе».",
      buttons: [{ type: "ok" }],
    });

    state.selectedCategory = null;

    // обновим данные
    try {
      await loadMyRequests();
    } catch {}
    try {
      await loadProfile();
    } catch {}

    render();
  } catch (e) {
    tg?.showPopup?.({
      title: "Ошибка",
      message: `Не удалось отправить заявку: ${e?.message || e}`,
      buttons: [{ type: "ok" }],
    });
  }
}

// ====== INWORK TAB ======
function renderInWork() {
  const items = state.myRequests || [];

  screen.innerHTML = `
    <div class="card">
      <div class="badge">В работе</div>
      <div class="hr"></div>

      ${
        items.length
          ? items
              .map(
                (r) => `
            <div class="req">
              <div class="reqTop">
                <div class="reqTitle">${escapeHtml(r.category)} • ${escapeHtml(r.carModel)}</div>
                <div class="reqStatus">${escapeHtml(statusLabel(r.status))}</div>
              </div>
              <div class="small">${escapeHtml(r.description)}</div>
              <div class="small" style="opacity:.75;margin-top:6px">${escapeHtml(formatDate(r.createdAt))}</div>
            </div>
          `
              )
              .join('<div class="hr"></div>')
          : `<div class="small">Пока нет заявок. Создайте заявку во вкладке «Заявки».</div>`
      }

      <div class="hr"></div>
      <button class="btn" id="refreshBtn">Обновить</button>
    </div>
  `;

  document.getElementById("refreshBtn")?.addEventListener("click", async () => {
    try {
      await loadMyRequests();
      renderInWork();
    } catch (e) {
      tg?.showPopup?.({
        title: "Ошибка",
        message: e?.message || String(e),
        buttons: [{ type: "ok" }],
      });
    }
  });
}

// ====== PROFILE TAB ======
async function renderProfile() {
  const u = getTgUser();
  const cars = state.garage || [];
  const activeCar = getActiveCar();
  const points = state.points || 0;

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Профиль</div>
      <div class="hr"></div>

      <div style="font-size:16px;font-weight:800">${escapeHtml(u?.first_name ?? "Гость")}</div>
      <div class="small">${u?.username ? "@" + escapeHtml(u.username) : "Откройте через Telegram"}</div>

      <div class="hr"></div>

      <div class="row">
        <div class="card" style="padding:12px">
          <div class="small">Баланс</div>
          <div style="font-size:18px;font-weight:900;margin-top:4px">0 ₽</div>
        </div>
        <div class="card" style="padding:12px">
          <div class="small">Баллы</div>
          <div style="font-size:18px;font-weight:900;margin-top:4px">${points}</div>
        </div>
      </div>

      <div class="hr"></div>

      <div class="badge">Гараж</div>
      <div class="small" style="margin-top:6px">Активное авто подставляется в заявку автоматически.</div>
      <div class="hr"></div>

      ${
        cars.length
          ? cars
              .map((c) => {
                const isActive = c.id === state.activeCarId;
                return `
                  <div class="item" style="cursor:default">
                    <div>
                      <div class="name">${escapeHtml(c.title)}</div>
                      <div class="small">${escapeHtml(c.carClass)}${isActive ? " • ✅ Активное" : ""}</div>
                    </div>
                    <div style="display:flex;gap:8px">
                      <button class="tab" data-act="set" data-id="${escapeHtml(c.id)}">Выбрать</button>
                      <button class="tab" data-act="del" data-id="${escapeHtml(c.id)}">✕</button>
                    </div>
                  </div>
                `;
              })
              .join("")
          : `<div class="small">Пока пусто. Добавьте авто ниже.</div>`
      }

      <div class="hr"></div>

      <div class="label">Марка / модель</div>
      <input class="input" id="newCarTitle" placeholder="Например: BMW 5" />

      <div class="label">Класс</div>
      <select class="select" id="newCarClass">
        ${CAR_CLASSES.map((cl) => `<option ${cl === "Бизнес" ? "selected" : ""}>${escapeHtml(cl)}</option>`).join("")}
      </select>

      <div class="row" style="margin-top:12px">
        <button class="btn" id="addCarBtn">Добавить авто</button>
      </div>

      <div class="small" style="margin-top:10px;opacity:.8">
        Сейчас активное авто: ${
          activeCar ? `<b>${escapeHtml(activeCar.title)}</b> • ${escapeHtml(activeCar.carClass)}` : "—"
        }
      </div>
    </div>
  `;

  // garage actions
  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if (!id) return;

      try {
        if (act === "set") {
          await apiPost("/api/garage/set-active", { initData: getInitData(), carId: id });
          await loadProfile();
          await renderProfile();
        }

        if (act === "del") {
          await apiPost("/api/garage/delete", { initData: getInitData(), carId: id });
          await loadProfile();
          await renderProfile();
        }
      } catch (e) {
        tg?.showPopup?.({
          title: "Ошибка",
          message: e?.message || String(e),
          buttons: [{ type: "ok" }],
        });
      }
    });
  });

  document.getElementById("addCarBtn")?.addEventListener("click", async () => {
    const title = (document.getElementById("newCarTitle")?.value || "").trim();
    const carClass = (document.getElementById("newCarClass")?.value || "Бизнес").trim();

    if (!title) {
      tg?.showPopup?.({
        title: "Заполните",
        message: "Введите марку/модель",
        buttons: [{ type: "ok" }],
      });
      return;
    }

    try {
      await apiPost("/api/garage/add", { initData: getInitData(), title, carClass, plate: "" });
      await loadProfile();
      tg?.showPopup?.({ title: "Готово ✅", message: "Авто добавлено", buttons: [{ type: "ok" }] });
      await renderProfile();
    } catch (e) {
      tg?.showPopup?.({
        title: "Ошибка",
        message: e?.message || String(e),
        buttons: [{ type: "ok" }],
      });
    }
  });
}

// ====== TABS ======
tabs.forEach((btn) => {
  btn.addEventListener("click", async () => {
    tabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    state.tab = btn.dataset.tab;
    if (state.tab !== "requests") state.selectedCategory = null;

    if (state.tab === "profile") {
      try {
        await loadProfile();
      } catch {}
    }

    if (state.tab === "inwork") {
      try {
        await loadMyRequests();
      } catch {}
      startPolling();
    } else {
      stopPolling();
    }

    render();
  });
});

// ====== BOOT ======
(async function boot() {
  try {
    await loadProfile();
  } catch {}

  // не включаем polling сразу — только на вкладке inwork
  try {
    await loadMyRequests();
  } catch {}

  render();
})();
