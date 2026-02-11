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

// ====== GARAGE STORAGE (Telegram CloudStorage -> fallback localStorage) ======
const GARAGE_KEY = "garage_v1"; // массив авто
const DEFAULT_CAR_KEY = "garage_default_car_id_v1";

function hasCloudStorage() {
  return !!tg?.CloudStorage?.getItem;
}

function cloudGet(key) {
  return new Promise((resolve) => {
    if (!hasCloudStorage()) return resolve(null);
    tg.CloudStorage.getItem(key, (err, value) => {
      if (err) return resolve(null);
      resolve(value ?? null);
    });
  });
}

function cloudSet(key, value) {
  return new Promise((resolve) => {
    if (!hasCloudStorage()) {
      try {
        localStorage.setItem(key, value);
      } catch {}
      return resolve(true);
    }
    tg.CloudStorage.setItem(key, value, (_err, ok) => resolve(!!ok));
  });
}

function localGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function getGarage() {
  let raw = null;
  if (hasCloudStorage()) raw = await cloudGet(GARAGE_KEY);
  else raw = localGet(GARAGE_KEY);

  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function setGarage(arr) {
  const raw = JSON.stringify(arr || []);
  return cloudSet(GARAGE_KEY, raw);
}

async function getDefaultCarId() {
  let raw = null;
  if (hasCloudStorage()) raw = await cloudGet(DEFAULT_CAR_KEY);
  else raw = localGet(DEFAULT_CAR_KEY);
  return raw || "";
}

async function setDefaultCarId(id) {
  return cloudSet(DEFAULT_CAR_KEY, String(id || ""));
}

function uuid() {
  // достаточно для MVP
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizePlate(s) {
  return String(s || "").trim().toUpperCase();
}

// ====== STATE ======
let state = {
  tab: "requests",
  selectedCategory: null,

  // form state
  selectedCarId: "",     // из гаража
  manualCarModel: "",    // ручной ввод
  manualCarClass: "Бизнес",
};

function getTgUser() {
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;
  return { id: u.id, first_name: u.first_name, username: u.username };
}

function render() {
  if (!screen) return;
  if (state.tab === "requests") return renderRequests();
  if (state.tab === "inwork") return renderInWork();
  if (state.tab === "profile") return renderProfile();
}

// ====== REQUESTS ======
function renderRequests() {
  if (state.selectedCategory) return renderRequestForm(state.selectedCategory);

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
      <div class="small">Забор/привоз авто — 5–10 тыс ₽. Работы выполняет подключенный сервис.</div>
    </div>
  `;

  document.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", async () => {
      const cat = el.getAttribute("data-cat");
      state.selectedCategory = cat;

      // при входе в форму: подхватить дефолтную машину
      const garage = await getGarage();
      const defId = await getDefaultCarId();
      const has = garage.length > 0;

      state.selectedCarId = has ? (defId || garage[0].id) : "";
      state.manualCarModel = "";
      state.manualCarClass = "Бизнес";

      render();
    });
  });
}

async function renderRequestForm(category) {
  const garage = await getGarage();
  const hasGarage = garage.length > 0;
  const selectedCar = hasGarage ? garage.find((c) => c.id === state.selectedCarId) : null;

  // если есть выбранная из гаража — автозаполним класс/модель в UI логикой ниже
  const initialCarClass = selectedCar?.carClass || state.manualCarClass || "Бизнес";
  const initialCarModel = selectedCar?.title || state.manualCarModel || "";

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Заявка • ${escapeHtml(category)}</div>
      <div class="hr"></div>

      ${
        hasGarage
          ? `
        <div class="label">Автомобиль (из гаража)</div>
        <select class="select" id="garageCar">
          ${garage
            .map((c) => {
              const label = [c.title, c.plate ? `• ${c.plate}` : ""].filter(Boolean).join(" ");
              const sel = c.id === state.selectedCarId ? "selected" : "";
              return `<option value="${escapeHtml(c.id)}" ${sel}>${escapeHtml(label)}</option>`;
            })
            .join("")}
          <option value="__manual__">Другое авто (ввести вручную)</option>
        </select>
        <div class="small" style="margin-top:6px">Гараж редактируется во вкладке «Профиль».</div>
        <div class="hr"></div>
      `
          : `
        <div class="small">Добавь авто в «Профиль → Гараж», чтобы не вводить каждый раз вручную.</div>
        <div class="hr"></div>
      `
      }

      <div class="label">Класс машины</div>
      <select class="select" id="carClass">
        ${["Эконом","Комфорт","Бизнес","Премиум","SUV"].map((x) => {
          const sel = x === initialCarClass ? "selected" : "";
          return `<option ${sel}>${x}</option>`;
        }).join("")}
      </select>

      <div class="label">Марка / модель</div>
      <input class="input" id="carModel" placeholder="Например: BMW 5, Mercedes C, Tesla Model 3" value="${escapeHtml(initialCarModel)}" />

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

  // если выбрали авто из гаража — сделать поля model/class readonly (чтобы не ломали данные)
  function applyGarageLock(isLocked) {
    const modelEl = document.getElementById("carModel");
    const classEl = document.getElementById("carClass");
    if (!modelEl || !classEl) return;

    modelEl.disabled = !!isLocked;
    classEl.disabled = !!isLocked;

    if (isLocked && selectedCar) {
      modelEl.value = selectedCar.title || "";
      classEl.value = selectedCar.carClass || "Бизнес";
    }
  }

  if (hasGarage && selectedCar) applyGarageLock(true);

  document.getElementById("garageCar")?.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "__manual__") {
      state.selectedCarId = "";
      state.manualCarModel = "";
      state.manualCarClass = document.getElementById("carClass")?.value || "Бизнес";
      applyGarageLock(false);
      return;
    }
    state.selectedCarId = val;

    const found = garage.find((c) => c.id === val);
    if (found) {
      applyGarageLock(true);
    }
  });

  document.getElementById("backBtn")?.addEventListener("click", () => {
    state.selectedCategory = null;
    state.selectedCarId = "";
    state.manualCarModel = "";
    render();
  });

  document.getElementById("submitBtn")?.addEventListener("click", async () => {
    // сохранить ручной ввод в state
    state.manualCarClass = (document.getElementById("carClass")?.value || "Бизнес").trim();
    state.manualCarModel = (document.getElementById("carModel")?.value || "").trim();
    await submitRequest(category);
  });
}

async function submitRequest(category) {
  const description = (document.getElementById("description")?.value || "").trim();

  const garage = await getGarage();
  const selectedCar = state.selectedCarId ? garage.find((c) => c.id === state.selectedCarId) : null;

  const carClass = selectedCar?.carClass || (document.getElementById("carClass")?.value || "").trim();
  const carModel = selectedCar?.title || (document.getElementById("carModel")?.value || "").trim();

  if (!carModel || !description) {
    tg?.showPopup?.({
      title: "Заполните поля",
      message: "Нужны «Марка/модель» и «Описание работы».",
      buttons: [{ type: "ok" }],
    });
    return;
  }

  // initData строкой
  const initData = tg?.initData || "";

  const payload = {
    category,
    carClass,
    carModel,
    description,
    car: selectedCar
      ? {
          id: selectedCar.id,
          title: selectedCar.title,
          plate: selectedCar.plate || "",
          carClass: selectedCar.carClass || "",
        }
      : null,
    tgUser: getTgUser(),
    initData,
  };

  try {
    const res = await fetch(`${API_BASE}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || "Не удалось отправить");

    tg?.showPopup?.({
      title: "Заявка отправлена ✅",
      message: "Менеджер скоро свяжется с вами.",
      buttons: [{ type: "ok" }],
    });

    state.selectedCategory = null;
    render();
  } catch (e) {
    tg?.showPopup?.({
      title: "Ошибка",
      message: `Не удалось отправить заявку: ${e?.message || e}`,
      buttons: [{ type: "ok" }],
    });
  }
}

// ====== INWORK ======
function renderInWork() {
  screen.innerHTML = `
    <div class="card">
      <div class="badge">В работе</div>
      <div class="hr"></div>
      <div class="small">Пока пусто. Здесь будут статусы: «менеджер выехал», «доставляем», «в работе», «готова к выдаче».</div>
    </div>
  `;
}

// ====== PROFILE + GARAGE UI ======
async function renderProfile() {
  const u = getTgUser();

  const garage = await getGarage();
  const defId = await getDefaultCarId();

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Профиль</div>
      <div class="hr"></div>

      <div style="font-size:16px;font-weight:700">${escapeHtml(u?.first_name ?? "Гость")}</div>
      <div class="small">${u?.username ? "@" + escapeHtml(u.username) : "Откройте через Telegram"}</div>

      <div class="hr"></div>

      <div class="badge">Гараж</div>
      <div class="small" style="margin-top:6px">
        Добавь автомобили — и в заявках будет быстрый выбор без ручного ввода.
      </div>

      <div class="hr"></div>

      <div id="garageList">
        ${
          garage.length === 0
            ? `<div class="small">Пока пусто. Нажми «Добавить авто».</div>`
            : garage
                .map((c) => {
                  const isDef = c.id === defId;
                  const line = [c.title, c.plate ? `• ${c.plate}` : ""].filter(Boolean).join(" ");
                  return `
                    <div class="item" data-car="${escapeHtml(c.id)}" style="display:flex;justify-content:space-between;align-items:center">
                      <div>
                        <div class="name">${escapeHtml(line)}</div>
                        <div class="small">${escapeHtml(c.carClass || "")}${isDef ? " • по умолчанию" : ""}</div>
                      </div>
                      <div class="arrow">›</div>
                    </div>
                  `;
                })
                .join("")
        }
      </div>

      <div class="row" style="margin-top:12px">
        <button class="btn" id="addCarBtn">➕ Добавить авто</button>
      </div>

      <div class="hr"></div>

      <div class="row">
        <div class="card" style="padding:12px">
          <div class="small">Баланс</div>
          <div style="font-size:18px;font-weight:800;margin-top:4px">0 ₽</div>
        </div>
        <div class="card" style="padding:12px">
          <div class="small">Баллы</div>
          <div style="font-size:18px;font-weight:800;margin-top:4px">0</div>
        </div>
      </div>

      <div class="hr"></div>
      <div class="small">Следующий шаг: фото авто, VIN и история заказов.</div>
    </div>
  `;

  document.getElementById("addCarBtn")?.addEventListener("click", () => openAddCarPopup());

  // клик по авто -> actions (default/delete)
  document.querySelectorAll("[data-car]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-car");
      const car = garage.find((x) => x.id === id);
      if (!car) return;

      const buttons = [
        { id: "set_default", type: "default", text: "Сделать по умолчанию" },
        { id: "delete", type: "destructive", text: "Удалить" },
        { type: "cancel" },
      ];

      tg?.showPopup?.({
        title: car.title,
        message: (car.plate ? `Номер: ${car.plate}\n` : "") + (car.carClass ? `Класс: ${car.carClass}` : ""),
        buttons,
      }, async (btnId) => {
        if (btnId === "set_default") {
          await setDefaultCarId(car.id);
          renderProfile();
        }
        if (btnId === "delete") {
          const next = garage.filter((x) => x.id !== car.id);
          await setGarage(next);
          const curDef = await getDefaultCarId();
          if (curDef === car.id) {
            await setDefaultCarId(next[0]?.id || "");
          }
          renderProfile();
        }
      });
    });
  });
}

function openAddCarPopup() {
  // Telegram showPopup не умеет вводы, поэтому рендерим "экран" ввода прямо в Profile UI (быстро и надёжно)
  // Сохраним текущий таб
  const u = getTgUser();

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Добавить авто</div>
      <div class="hr"></div>

      <div class="label">Марка / модель</div>
      <input class="input" id="g_title" placeholder="Например: BMW 5, Mercedes C, Tesla Model 3" />

      <div class="label">Госномер (необязательно)</div>
      <input class="input" id="g_plate" placeholder="A777AA77" />

      <div class="label">Класс</div>
      <select class="select" id="g_class">
        <option>Эконом</option>
        <option>Комфорт</option>
        <option selected>Бизнес</option>
        <option>Премиум</option>
        <option>SUV</option>
      </select>

      <div class="row" style="margin-top:12px">
        <button class="tab" id="g_back">Назад</button>
        <button class="btn" id="g_save">Сохранить</button>
      </div>

      <div class="small" style="margin-top:10px">
        Авто сохранится в Telegram (CloudStorage) для аккаунта ${escapeHtml(u?.first_name ?? "")}.
      </div>
    </div>
  `;

  document.getElementById("g_back")?.addEventListener("click", () => renderProfile());

  document.getElementById("g_save")?.addEventListener("click", async () => {
    const title = (document.getElementById("g_title")?.value || "").trim();
    const plate = normalizePlate(document.getElementById("g_plate")?.value || "");
    const carClass = (document.getElementById("g_class")?.value || "Бизнес").trim();

    if (!title) {
      tg?.showPopup?.({
        title: "Заполните поле",
        message: "Нужна «Марка / модель».",
        buttons: [{ type: "ok" }],
      });
      return;
    }

    const garage = await getGarage();
    const car = { id: uuid(), title, plate, carClass, createdAt: Date.now() };

    garage.unshift(car);
    await setGarage(garage);

    // если это первая машина — сделаем дефолтной
    const defId = await getDefaultCarId();
    if (!defId) await setDefaultCarId(car.id);

    tg?.showPopup?.({
      title: "Готово ✅",
      message: "Автомобиль добавлен в гараж.",
      buttons: [{ type: "ok" }],
    });

    renderProfile();
  });
}

// ====== TABS ======
tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.tab = btn.dataset.tab;
    if (state.tab !== "requests") state.selectedCategory = null;
    render();
  });
});

// ====== UTILS ======
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

render();
