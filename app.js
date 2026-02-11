const API_BASE = "https://fixfastautobot.onrender.com";

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const screen = document.getElementById("screen");
const tabs = document.querySelectorAll(".tab");

const CATEGORIES = ["Мойка/шиномонтаж", "ТО/Ремонт", "Детейлинг", "Кузовной ремонт", "Тюнинг"];
const CAR_CLASSES = ["Эконом", "Комфорт", "Бизнес", "Премиум", "SUV"];

let state = {
  tab: "requests",
  selectedCategory: null,
  garage: { cars: [], activeCarId: null },
  activeCar: null,
  myRequests: [],
};

function getTgUser() {
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;
  return { id: u.id, first_name: u.first_name, username: u.username };
}

function initData() {
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

function formatStatus(st) {
  if (st === "new") return "🆕 Новая";
  if (st === "inwork") return "🛠️ В работе";
  if (st === "done") return "✅ Готово";
  if (st === "canceled") return "❌ Отменено";
  return st;
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString("ru-RU");
  } catch {
    return "";
  }
}

// ---------- API helpers ----------
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.error || "Request failed");
  return data;
}

// ---------- Garage ----------
async function loadGarage() {
  const data = await apiPost("/api/garage/get", { initData: initData() });
  state.garage = data.garage || { cars: [], activeCarId: null };
  state.activeCar = state.garage.cars.find((c) => c.id === state.garage.activeCarId) || null;
}

async function addCar(title, carClass) {
  const data = await apiPost("/api/garage/add", {
    initData: initData(),
    car: { title, carClass },
  });
  state.garage = data.garage;
  state.activeCar = state.garage.cars.find((c) => c.id === state.garage.activeCarId) || null;
}

async function setActiveCar(carId) {
  const data = await apiPost("/api/garage/active", {
    initData: initData(),
    carId,
  });
  state.garage = data.garage;
  state.activeCar = state.garage.cars.find((c) => c.id === state.garage.activeCarId) || null;
}

async function deleteCar(carId) {
  const data = await apiPost("/api/garage/delete", {
    initData: initData(),
    carId,
  });
  state.garage = data.garage;
  state.activeCar = state.garage.cars.find((c) => c.id === state.garage.activeCarId) || null;
}

// ---------- Requests ----------
async function loadMyRequests() {
  const data = await apiPost("/api/my-requests", { initData: initData() });
  state.myRequests = data.items || [];
}

// ---------- Render ----------
function render() {
  if (!screen) return;
  if (state.tab === "requests") return renderRequests();
  if (state.tab === "inwork") return renderInWork();
  if (state.tab === "profile") return renderProfile();
}

function renderRequests() {
  if (state.selectedCategory) return renderRequestForm(state.selectedCategory);

  const active = state.activeCar
    ? `<div class="small" style="margin-top:8px">🚘 Активное авто: <b>${escapeHtml(
        state.activeCar.title
      )}</b> (${escapeHtml(state.activeCar.carClass)})</div>`
    : `<div class="small" style="margin-top:8px">🚘 Нет активного авто — добавь в «Профиль → Гараж»</div>`;

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Быстрый заказ</div>
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
      ${active}
      <div class="small" style="margin-top:10px">Забор/привоз авто — 5–10 тыс ₽. Работы выполняет подключенный сервис.</div>
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
  const cars = state.garage?.cars || [];
  const activeCarId = state.garage?.activeCarId || "";

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Заявка • ${escapeHtml(category)}</div>
      <div class="hr"></div>

      <div class="label">Авто из гаража</div>
      <select class="select" id="garageCar">
        <option value="">— Не выбирать —</option>
        ${cars
          .map(
            (c) =>
              `<option value="${escapeHtml(c.id)}" ${
                c.id === activeCarId ? "selected" : ""
              }>${escapeHtml(c.title)} • ${escapeHtml(c.carClass)}</option>`
          )
          .join("")}
      </select>

      <div class="label">Класс машины</div>
      <select class="select" id="carClass">
        ${CAR_CLASSES.map((cl) => `<option value="${escapeHtml(cl)}">${escapeHtml(cl)}</option>`).join("")}
      </select>

      <div class="label">Марка / модель</div>
      <input class="input" id="carModel" placeholder="Например: BMW 5, Mercedes C, Tesla Model 3" />

      <div class="label">Описание работы</div>
      <textarea class="textarea" id="description" placeholder="Что нужно сделать: опиши задачу максимально конкретно"></textarea>

      <div class="row" style="margin-top:12px">
        <button class="tab" id="backBtn">Назад</button>
        <button class="btn" id="submitBtn">Оставить заявку</button>
      </div>

      <div class="small" style="margin-top:10px">
        Нажимая «Оставить заявку», вы подтверждаете согласие на обработку данных для оформления услуги.
      </div>
    </div>
  `;

  const carSel = document.getElementById("garageCar");
  const classSel = document.getElementById("carClass");
  const modelInp = document.getElementById("carModel");

  // 1) автозаполнение из активного авто
  if (state.activeCar?.carClass) classSel.value = state.activeCar.carClass;
  if (state.activeCar?.title) modelInp.value = state.activeCar.title;

  // 2) при выборе авто в селекте — обновляем класс/модель
  carSel?.addEventListener("change", () => {
    const id = carSel.value;
    const c = cars.find((x) => x.id === id);
    if (c) {
      classSel.value = c.carClass || classSel.value;
      modelInp.value = c.title || modelInp.value;
    }
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

  const car = carId ? (state.garage.cars.find((c) => c.id === carId) || null) : state.activeCar;

  try {
    await apiPost("/api/request", {
      initData: initData(),
      category,
      carClass,
      carModel,
      description,
      car,
      tgUser: getTgUser(),
    });

    tg?.showPopup?.({
      title: "Заявка отправлена ✅",
      message: "Менеджер скоро свяжется с вами. Статус появится во вкладке «В работе».",
      buttons: [{ type: "ok" }],
    });

    state.selectedCategory = null;
    await loadMyRequests();
    render();
  } catch (e) {
    tg?.showPopup?.({
      title: "Ошибка",
      message: `Не удалось отправить заявку: ${e?.message || e}`,
      buttons: [{ type: "ok" }],
    });
  }
}

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
                <div class="reqStatus">${escapeHtml(formatStatus(r.status))}</div>
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
      render();
    } catch (e) {
      tg?.showPopup?.({
        title: "Ошибка",
        message: `Не удалось обновить: ${e?.message || e}`,
        buttons: [{ type: "ok" }],
      });
    }
  });
}

function renderProfile() {
  const u = getTgUser();
  const cars = state.garage?.cars || [];
  const activeId = state.garage?.activeCarId;

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Профиль</div>
      <div class="hr"></div>

      <div style="font-size:16px;font-weight:700">${escapeHtml(u?.first_name ?? "Гость")}</div>
      <div class="small">${u?.username ? "@" + escapeHtml(u.username) : "Откройте через Telegram"}</div>

      <div class="hr"></div>
      <div class="badge" style="margin-bottom:10px">Гараж</div>

      ${
        cars.length
          ? cars
              .map(
                (c) => `
            <div class="garageItem">
              <div>
                <div style="font-weight:800">${escapeHtml(c.title)}</div>
                <div class="small">${escapeHtml(c.carClass)} ${c.id === activeId ? "• ✅ Активное" : ""}</div>
              </div>
              <div class="garageBtns">
                <button class="chip" data-act="active" data-id="${escapeHtml(c.id)}">Выбрать</button>
                <button class="chip danger" data-act="del" data-id="${escapeHtml(c.id)}">✕</button>
              </div>
            </div>
          `
              )
              .join("")
          : `<div class="small">Авто пока нет. Добавьте ниже.</div>`
      }

      <div class="hr"></div>

      <div class="label">Марка / модель</div>
      <input class="input" id="newCarTitle" placeholder="Например: BMW 5" />

      <div class="label">Класс</div>
      <select class="select" id="newCarClass">
        ${CAR_CLASSES.map((cl) => `<option value="${escapeHtml(cl)}">${escapeHtml(cl)}</option>`).join("")}
      </select>

      <div class="row" style="margin-top:12px">
        <button class="btn" id="addCarBtn">Добавить авто</button>
      </div>

      <div class="small" style="margin-top:10px;opacity:.8">
        Активное авто автоматически подставляется в заявке.
      </div>
    </div>
  `;

  // гараж actions
  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      try {
        if (act === "active") {
          await setActiveCar(id);
          render();
        }
        if (act === "del") {
          await deleteCar(id);
          render();
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
    const carClass = (document.getElementById("newCarClass")?.value || "").trim();

    if (!title) {
      tg?.showPopup?.({ title: "Заполните", message: "Введите марку/модель", buttons: [{ type: "ok" }] });
      return;
    }

    try {
      await addCar(title, carClass || "Бизнес");
      tg?.showPopup?.({ title: "Готово ✅", message: "Авто добавлено в гараж", buttons: [{ type: "ok" }] });
      render();
    } catch (e) {
      tg?.showPopup?.({ title: "Ошибка", message: e?.message || String(e), buttons: [{ type: "ok" }] });
    }
  });
}

// tabs
tabs.forEach((btn) => {
  btn.addEventListener("click", async () => {
    tabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.tab = btn.dataset.tab;
    if (state.tab !== "requests") state.selectedCategory = null;

    // refresh on tab open
    try {
      if (state.tab === "inwork") await loadMyRequests();
      if (state.tab === "profile") await loadGarage();
    } catch (e) {
      // silent
    }

    render();
  });
});

// boot
(async function boot() {
  try {
    await loadGarage();
  } catch {}
  try {
    await loadMyRequests();
  } catch {}
  render();
})();
