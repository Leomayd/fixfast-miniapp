const API_BASE = "https://fixfastautobot.onrender.com";

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const screen = document.getElementById("screen");
const tabs = document.querySelectorAll(".tab");

let state = {
  tab: "requests",
  selectedCategory: null,
};

const CATEGORIES = [
  "Мойка/шиномонтаж",
  "ТО/Ремонт",
  "Детейлинг",
  "Кузовной ремонт",
  "Тюнинг",
];

function getTgUser() {
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;
  return { id: u.id, first_name: u.first_name, username: u.username };
}

function render() {
  if (state.tab === "requests") return renderRequests();
  if (state.tab === "inwork") return renderInWork();
  if (state.tab === "profile") return renderProfile();
}

function renderRequests() {
  if (state.selectedCategory === "Детейлинг") return renderDetailingForm();

  screen.innerHTML = `
    <div class="card">
      <div class="badge">Быстрый заказ</div>
      <div class="hr"></div>
      <div class="grid">
        ${CATEGORIES.map((c) => `
          <div class="item" data-cat="${c}">
            <div class="name">${c}</div>
            <div class="arrow">›</div>
          </div>
        `).join("")}
      </div>
      <div class="hr"></div>
      <div class="small">Забор/привоз авто — 5–10 тыс ₽. Работы выполняет подключенный сервис.</div>
    </div>
  `;

  document.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", () => {
      const cat = el.getAttribute("data-cat");
      if (cat === "Детейлинг") {
        state.selectedCategory = "Детейлинг";
        render();
      } else {
        // пока остальные категории как заглушка
        tg?.showPopup?.({ title: cat, message: "Эта форма будет добавлена следующей.", buttons: [{ type: "ok" }] });
      }
    });
  });
}

function renderDetailingForm() {
  screen.innerHTML = `
    <div class="card">
      <div class="badge">Заявка • Детейлинг</div>
      <div class="hr"></div>

      <div class="label">Класс машины</div>
      <select class="select" id="carClass">
        <option>Эконом</option>
        <option>Комфорт</option>
        <option selected>Бизнес</option>
        <option>Премиум</option>
        <option>SUV</option>
      </select>

      <div class="label">Марка / модель</div>
      <input class="input" id="carModel" placeholder="Например: BMW 5, Mercedes C, Tesla Model 3" />

      <div class="label">Описание работы</div>
      <textarea class="textarea" id="description" placeholder="Что нужно сделать: химчистка, полировка, керамика, фары..."></textarea>

      <div class="row" style="margin-top:12px">
        <button class="tab" id="backBtn">Назад</button>
        <button class="btn" id="submitBtn">Оставить заявку</button>
      </div>

      <div class="small" style="margin-top:10px">
        Нажимая «Оставить заявку», вы подтверждаете согласие на обработку данных для оформления услуги.
      </div>
    </div>
  `;

  document.getElementById("backBtn").addEventListener("click", () => {
    state.selectedCategory = null;
    render();
  });

  document.getElementById("submitBtn").addEventListener("click", submitDetailing);
}

async function submitDetailing() {
  const carClass = document.getElementById("carClass").value.trim();
  const carModel = document.getElementById("carModel").value.trim();
  const description = document.getElementById("description").value.trim();

  if (!carModel || !description) {
    tg?.showPopup?.({ title: "Заполните поля", message: "Нужны «Марка/модель» и «Описание работы».", buttons: [{ type: "ok" }] });
    return;
  }

  const payload = {
    category: "Детейлинг",
    carClass,
    carModel,
    description,
    tgUser: getTgUser(),
  };

  try {
    const res = await fetch(`${API_BASE}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || "Unknown error");

    tg?.showPopup?.({
      title: "Заявка отправлена",
      message: "Менеджер скоро свяжется с вами. Можно закрыть окно.",
      buttons: [{ type: "ok" }],
    });

    // сброс формы
    state.selectedCategory = null;
    render();
  } catch (e) {
    tg?.showPopup?.({
      title: "Ошибка",
      message: `Не удалось отправить заявку: ${e.message}`,
      buttons: [{ type: "ok" }],
    });
  }
}

function renderInWork() {
  screen.innerHTML = `
    <div class="card">
      <div class="badge">В работе</div>
      <div class="hr"></div>
      <div class="small">Пока пусто. Здесь будут статусы: «менеджер выехал», «доставляем», «в работе», «готова к выдаче».</div>
    </div>
  `;
}

function renderProfile() {
  const u = getTgUser();
  screen.innerHTML = `
    <div class="card">
      <div class="badge">Профиль</div>
      <div class="hr"></div>
      <div style="font-size:16px;font-weight:700">${u?.first_name ?? "Гость"}</div>
      <div class="small">${u?.username ? "@" + u.username : "Откройте через Telegram"}</div>
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
      <div class="small">Гараж и рейтинг добавим следующим шагом.</div>
    </div>
  `;
}

tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.tab = btn.dataset.tab;
    if (state.tab !== "requests") state.selectedCategory = null;
    render();
  });
});

render();
