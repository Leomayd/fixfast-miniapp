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
  profile: {
    garage: [],
    activeCarId: "",
    points: 0,
  },
  myRequests: [],
  pollTimer: null,
};

// ====== TG HELPERS ======
function getInitData() {
  return tg?.initData || "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function getActiveCar() {
  const cars = state.profile?.garage || [];
  const activeId = state.profile?.activeCarId || "";
  return cars.find((c) => String(c.id) === String(activeId)) || cars[0] || null;
}

function proxifyPhoto(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  return `${API_BASE}/img?u=${encodeURIComponent(u)}`;
}

// ====== LOADERS ======
async function loadProfile() {
  const data = await apiPost("/api/profile", { initData: getInitData() });
  state.profile.garage = data.garage || [];
  state.profile.activeCarId = data.activeCarId || "";
  state.profile.points = Number(data.points || 0);
}

async function loadMyRequests() {
  const data = await apiPost("/api/my-requests", { initData: getInitData() });
  state.myRequests = data.items || [];
}

// ====== POLLING ======
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
  const cars = state.profile?.garage || [];
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
            const sel = String(c.id) === String(state.profile.activeCarId) ? "selected" : "";
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
    const chosen = cars.find((c) => String(c.id) === String(id)) || activeCar;
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

  const cars = state.profile?.garage || [];
  const activeCar = getActiveCar();
  const chosenCar = carId ? cars.find((c) => String(c.id) === String(carId)) || null : activeCar;

  const payload = {
    initData: getInitData(),
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
          vin: chosenCar.vin || "",
          color: chosenCar.color || "",
        }
      : null,
  };

  try {
    await apiPost("/api/request", payload);

    tg?.showPopup?.({
      title: "Заявка отправлена ✅",
      message: "После завершения работ вы получите 1000 бонусов. Статус появится во вкладке «В работе».",
      buttons: [{ type: "ok" }],
    });

    state.selectedCategory = null;

    try {
      await loadMyRequests();
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
            <div style="padding:10px 2px">
              <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:6px">
                <div style="font-weight:800">${escapeHtml(r.category)} • ${escapeHtml(r.carModel)}</div>
                <div style="font-weight:800">${escapeHtml(statusLabel(r.status))}</div>
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
function renderCarCard(c, isActive) {
  const photoUrl = c.photo ? proxifyPhoto(c.photo) : "";
  const plateId = `plate_${c.id}`;
  const vinId = `vin_${c.id}`;
  const colorId = `color_${c.id}`;

  const photoHtml = photoUrl
    ? `
      <img
        src="${escapeHtml(photoUrl)}"
        alt="car"
        referrerpolicy="no-referrer"
        style="width:100%;border-radius:14px;margin-top:10px;border:1px solid rgba(255,255,255,.08);display:block"
        onerror="this.style.display='none';"
      />
    `
    : "";

  return `
    <div class="card" style="padding:14px;margin-top:12px">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <div>
          <div style="font-size:18px;font-weight:900">${escapeHtml(c.title)}</div>
          <div class="small">${escapeHtml(c.carClass)}${isActive ? " • ✅ Активное" : ""}</div>
          ${
            c.plate
              ? `<div class="small" style="margin-top:6px">Номер: <b>${escapeHtml(c.plate)}</b></div>`
              : ""
          }
          ${
            c.vin
              ? `<div class="small" style="margin-top:6px">VIN: <b>${escapeHtml(c.vin)}</b></div>`
              : ""
          }
          ${
            c.color
              ? `<div class="small" style="margin-top:6px">Цвет: <b>${escapeHtml(c.color)}</b></div>`
              : ""
          }
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;min-width:140px">
          <button class="tab" data-act="set" data-id="${escapeHtml(c.id)}">Выбрать</button>
          <button class="tab" data-act="toggle" data-id="${escapeHtml(c.id)}">Свернуть</button>
          <button class="tab" data-act="del" data-id="${escapeHtml(c.id)}">✕</button>
        </div>
      </div>

      ${photoHtml}

      <div class="hr" style="margin-top:12px"></div>

      <div class="label">Госномер</div>
      <input class="input" id="${escapeHtml(plateId)}" placeholder="A123BC77" value="${escapeHtml(c.plate || "")}" />

      <div class="label">VIN</div>
      <input class="input" id="${escapeHtml(vinId)}" placeholder="17 символов" value="${escapeHtml(c.vin || "")}" />

      <div class="label">Цвет</div>
      <input class="input" id="${escapeHtml(colorId)}" placeholder="Black / White / Silver" value="${escapeHtml(c.color || "")}" />

      <div class="row" style="margin-top:12px">
        <button class="btn" data-act="save" data-id="${escapeHtml(c.id)}">Сохранить</button>
        <button class="tab" data-act="vin-photo" data-id="${escapeHtml(c.id)}">Decode VIN + фото</button>
      </div>
    </div>
  `;
}

async function renderProfile() {
  const cars = state.profile?.garage || [];
  const activeCar = getActiveCar();
  const points = Number(state.profile?.points || 0);

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Профиль</div>
      <div class="hr"></div>

      <div class="row">
        <div class="card" style="padding:12px">
          <div class="small">Баланс</div>
          <div style="font-size:18px;font-weight:900;margin-top:4px">0 ₽</div>
        </div>
        <div class="card" style="padding:12px">
          <div class="small">Бонусы</div>
          <div style="font-size:18px;font-weight:900;margin-top:4px">${points}</div>
        </div>
      </div>

      <div class="hr"></div>

      <div class="badge">Гараж</div>
      <div class="small" style="margin-top:6px">Активное авто подставляется в заявку автоматически.</div>

      ${
        cars.length
          ? cars
              .map((c) => {
                const isActive = String(c.id) === String(state.profile.activeCarId);
                return renderCarCard(c, isActive);
              })
              .join("")
          : `<div class="hr"></div><div class="small">Пока пусто. Добавьте авто ниже.</div>`
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

  // actions
  document.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const carId = btn.getAttribute("data-id");
      if (!carId) return;

      try {
        if (act === "set") {
          await apiPost("/api/garage/set-active", { initData: getInitData(), carId });
          await loadProfile();
          await renderProfile();
          return;
        }

        if (act === "del") {
          await apiPost("/api/garage/delete", { initData: getInitData(), carId });
          await loadProfile();
          await renderProfile();
          return;
        }

        if (act === "save") {
          const plate = (document.getElementById(`plate_${carId}`)?.value || "").trim().toUpperCase();
          const vin = (document.getElementById(`vin_${carId}`)?.value || "").trim().toUpperCase();
          const color = (document.getElementById(`color_${carId}`)?.value || "").trim();

          await apiPost("/api/garage/update", { initData: getInitData(), carId, plate, vin, color });
          await loadProfile();
          await renderProfile();

          tg?.showPopup?.({ title: "Готово ✅", message: "Данные авто сохранены.", buttons: [{ type: "ok" }] });
          return;
        }

        if (act === "vin-photo") {
          const vin = (document.getElementById(`vin_${carId}`)?.value || "").trim().toUpperCase();
          const color = (document.getElementById(`color_${carId}`)?.value || "").trim();

          if (!vin) {
            tg?.showPopup?.({
              title: "VIN нужен",
              message: "Введите VIN (17 символов) и повторите.",
              buttons: [{ type: "ok" }],
            });
            return;
          }

          const r = await apiPost("/api/car/vin-auto-photo", { initData: getInitData(), carId, vin, color });

          await loadProfile();
          await renderProfile();

          const lines = [];
          if (r?.decodedPretty) lines.push(`VIN: ${r.decodedPretty}`);
          if (r?.mismatch) {
            lines.push("");
            lines.push("⚠️ VIN не совпадает с названием авто в гараже.");
            lines.push(`В гараже: ${r.oldTitle}`);
          }
          if (r?.photoUrl) lines.push("", "Фото подтянуто и сохранено.");
          else lines.push("", "Фото не найдено (попробуй указать цвет и повторить).");

          tg?.showPopup?.({
            title: "Готово ✅",
            message: lines.join("\n"),
            buttons: [{ type: "ok" }],
          });
          return;
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
      await renderProfile();
      tg?.showPopup?.({ title: "Готово ✅", message: "Авто добавлено", buttons: [{ type: "ok" }] });
    } catch (e) {
      tg?.showPopup?.({ title: "Ошибка", message: e?.message || String(e), buttons: [{ type: "ok" }] });
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

    try {
      if (state.tab === "profile") await loadProfile();
      if (state.tab === "inwork") await loadMyRequests();
    } catch {}

    if (state.tab === "inwork") startPolling();
    else stopPolling();

    render();
  });
});

// ====== BOOT ======
(async function boot() {
  try {
    await loadProfile();
  } catch (e) {
    console.warn("loadProfile failed:", e?.message || e);
  }

  try {
    await loadMyRequests();
  } catch {}

  render();
})();
