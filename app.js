// ====== CONFIG ======
const CONFIG = {
  restaurantName: "Restaurante Demo",
  currencySymbol: "$",
  whatsappPhone: "5493517520425", // <-- cambialo
  logoSrc: "https://via.placeholder.com/220x80?text=LOGO"
};

// Pegá acá TU link CSV publicado (de Sheets "Publicar en la web" formato CSV)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQEcrYDznig15_wyrQH2pRP8hqpL3Oh50qZUMkeycGX3EImOX0oQXUabcbjdjHcZhk1bWFvoQ_fIiIZ/pub?gid=0&single=true&output=csv";

// ====== Estado ======
const LS_KEY = "restaurant_cart_v1";
let DATA = { categories: [], items: [] };
let currentCategory = null;
let cart = loadCart();

// ====== DOM ======
const elLogo = document.getElementById("logo");
const elName = document.getElementById("restaurantName");
const elBar = document.getElementById("categoryBar");
const elGrid = document.getElementById("itemsGrid");
const elBtnCart = document.getElementById("btnCart");
const elCartCount = document.getElementById("cartCount");
const elModal = document.getElementById("cartModal");
const elClose = document.getElementById("btnCloseCart");
const elCartList = document.getElementById("cartList");
const elCartTotal = document.getElementById("cartTotal");
const elBtnClear = document.getElementById("btnClear");
const elBtnWA = document.getElementById("btnWhatsApp");

// ====== Helpers ======
function money(n) { return `${CONFIG.currencySymbol}${Math.round(n)}`; }

function loadCart() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) ?? {}; }
  catch { return {}; }
}
function saveCart(c) { localStorage.setItem(LS_KEY, JSON.stringify(c)); }
function cartCount(c) { return Object.values(c).reduce((a,b)=>a+b,0); }
function cartTotal(c) {
  return Object.entries(c).reduce((sum,[id,qty]) => {
    const it = DATA.items.find(x => x.id === id);
    return sum + (it ? it.price * qty : 0);
  }, 0);
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function isInDateWindow(it) {
  const t = todayISO();
  const from = (it.availableFrom || "").trim();
  const to = (it.availableTo || "").trim();
  if (!from && !to) return true;
  if (from && t < from) return false;
  if (to && t > to) return false;
  return true;
}

// ====== CSV parse (soporta comillas) ======
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && inQuotes && next === '"') { field += '"'; i++; continue; }
    if (c === '"') { inQuotes = !inQuotes; continue; }

    if (c === "," && !inQuotes) { row.push(field); field = ""; continue; }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (field !== "" || row.length) row.push(field);
      field = "";
      if (row.length) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}

function toBool(v, defaultVal = true) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "") return defaultVal;
  return s === "true" || s === "1" || s === "yes" || s === "si" || s === "sí";
}
function toNum(v) {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

async function loadMenuFromSheet() {
  if (!SHEET_CSV_URL || SHEET_CSV_URL.includes("PEGAR_AQUI")) {
    throw new Error("Falta pegar el link CSV en SHEET_CSV_URL");
  }

  // cache-busting para ver cambios rápido
  const url = SHEET_CSV_URL + (SHEET_CSV_URL.includes("?") ? "&" : "?") + "_=" + Date.now();

  const res = await fetch(url, { cache: "no-store" });
  const csv = await res.text();

  const rows = parseCSV(csv);
  const header = rows.shift().map(h => h.trim());

  const idx = (name) => header.indexOf(name);

  const items = rows.map(r => ({
    id: (r[idx("id")] ?? "").trim(),
    category: (r[idx("category")] ?? "").trim(),
    name: (r[idx("name")] ?? "").trim(),
    desc: (r[idx("desc")] ?? "").trim(),
    price: toNum(r[idx("price")]),
    imgUrl: (r[idx("imgUrl")] ?? "").trim(),
    visible: toBool(r[idx("visible")], true),
    soldOut: toBool(r[idx("soldOut")], false),
    availableFrom: (r[idx("availableFrom")] ?? "").trim(),
    availableTo: (r[idx("availableTo")] ?? "").trim(),
    sort: toNum(r[idx("sort")])
  })).filter(x => x.id && x.category && x.name);

  // categorías en orden de aparición
  const categories = [];
  for (const it of items) if (!categories.includes(it.category)) categories.push(it.category);

  return { categories, items };
}

// ====== UI ======
function updateTop() {
  elCartCount.textContent = cartCount(cart);
}

function renderCategories() {
  elBar.innerHTML = "";
  DATA.categories.forEach(cat => {
    const b = document.createElement("button");
    b.className = "cat" + (cat === currentCategory ? " active" : "");
    b.textContent = cat;
    b.onclick = () => {
      currentCategory = cat;
      renderCategories();
      renderItems();
    };
    elBar.appendChild(b);
  });
}

function renderItems() {
  elGrid.innerHTML = "";
  const items = DATA.items
    .filter(i => i.category === currentCategory)
    .filter(i => i.visible !== false)
    .filter(isInDateWindow)
    .sort((a,b) => (a.sort ?? 999) - (b.sort ?? 999));

  items.forEach(it => {
    const soldOut = it.soldOut === true;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${it.imgUrl}" alt="${it.name}" onerror="this.style.display='none'"/>
      <div class="card-body">
        <div class="card-title">
          <span>${it.name}</span>
          ${soldOut ? `<span class="badge soldout">Agotado</span>` : ``}
        </div>
        <div class="card-desc">${it.desc ?? ""}</div>
        <div class="card-row">
          <div class="price">${money(it.price)}</div>
          <button class="btn btn-primary" ${soldOut ? "disabled" : ""}>
            ${soldOut ? "No disponible" : "Añadir"}
          </button>
        </div>
      </div>
    `;
    card.querySelector("button").onclick = () => { if (!soldOut) addToCart(it.id); };
    elGrid.appendChild(card);
  });
}

function addToCart(itemId) {
  cart[itemId] = (cart[itemId] ?? 0) + 1;
  saveCart(cart);
  updateTop();
}

function openCart() { renderCart(); elModal.classList.remove("hidden"); }
function closeCart() { elModal.classList.add("hidden"); }

function renderCart() {
  elCartList.innerHTML = "";
  const entries = Object.entries(cart);

  if (entries.length === 0) {
    elCartList.innerHTML = `<p>Tu carrito está vacío.</p>`;
  } else {
    entries.forEach(([id, qty]) => {
      const it = DATA.items.find(x => x.id === id);
      if (!it) return;

      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div class="cart-left">
          <div class="cart-name">${it.name}</div>
          <div class="cart-sub">${qty} x ${money(it.price)} = <strong>${money(it.price * qty)}</strong></div>
        </div>
        <div class="qty">
          <button class="btn" aria-label="Restar">−</button>
          <strong>${qty}</strong>
          <button class="btn" aria-label="Sumar">+</button>
        </div>
      `;

      const buttons = row.querySelectorAll("button");
      const btnMinus = buttons[0];
      const btnPlus = buttons[1];

      btnPlus.onclick = () => { cart[id] = qty + 1; saveCart(cart); renderCart(); updateTop(); };
      btnMinus.onclick = () => {
        if (qty <= 1) delete cart[id];
        else cart[id] = qty - 1;
        saveCart(cart);
        renderCart();
        updateTop();
      };

      elCartList.appendChild(row);
    });
  }

  elCartTotal.textContent = money(cartTotal(cart));
  elBtnWA.href = buildWhatsAppLink();
  elBtnWA.style.pointerEvents = entries.length === 0 ? "none" : "auto";
  elBtnWA.style.opacity = entries.length === 0 ? "0.5" : "1";
}

function buildWhatsAppLink() {
  const lines = [];
  lines.push(`Hola! Quiero hacer este pedido en ${CONFIG.restaurantName}:`);
  lines.push("");

  Object.entries(cart).forEach(([id, qty]) => {
    const it = DATA.items.find(x => x.id === id);
    if (!it) return;
    lines.push(`${qty} x ${it.name} — ${money(it.price * qty)}`);
  });

  lines.push("");
  lines.push(`Total: ${money(cartTotal(cart))}`);

  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${CONFIG.whatsappPhone}?text=${text}`;
}

// ====== INIT ======
async function init() {
  elLogo.src = CONFIG.logoSrc;
  elName.textContent = CONFIG.restaurantName;

  try {
    DATA = await loadMenuFromSheet();
  } catch (e) {
    elName.textContent = "Error cargando el menú (revisá SHEET_CSV_URL y el CSV publicado)";
    console.error(e);
    return;
  }

  currentCategory = DATA.categories[0] ?? "Menú";

  renderCategories();
  renderItems();
  updateTop();

  elBtnCart.onclick = openCart;
  elClose.onclick = closeCart;
  elModal.addEventListener("click", (e) => { if (e.target === elModal) closeCart(); });

  elBtnClear.onclick = () => {
    cart = {};
    saveCart(cart);
    renderCart();
    updateTop();
  };
}
init();
