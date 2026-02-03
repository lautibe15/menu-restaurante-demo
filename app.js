// ====== CONFIG ======
const CONFIG = {
  restaurantName: "BIG LAUTA",
  currencySymbol: "$",
  whatsappPhone: "5493517520425", // <-- cambialo
  logoSrc: "assets/logo.png"
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
// Modal detalle item
const elItemModal = document.getElementById("itemModal");
const elCloseItem = document.getElementById("btnCloseItem");
const elItemTitle = document.getElementById("itemTitle");
const elItemImg = document.getElementById("itemImg");
const elItemDesc = document.getElementById("itemDesc");
const elVariantList = document.getElementById("variantList");
const elItemPrice = document.getElementById("itemPrice");
const elBtnAddItem = document.getElementById("btnAddItem");

let modalItem = null;
let modalVariantKey = "default";


// ====== Helpers ======
function money(n) { return `${CONFIG.currencySymbol}${Math.round(n)}`; }

function loadCart() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) ?? {}; }
  catch { return {}; }
}
function saveCart(c) { localStorage.setItem(LS_KEY, JSON.stringify(c)); }
function cartCount(c) { return Object.values(c).reduce((a,b)=>a+b,0); }
function cartTotal(c) {
  return Object.entries(c).reduce((sum, [key, qty]) => {
    const { itemId, variantKey } = parseCartKey(key);
    const it = DATA.items.find(x => x.id === itemId);
    if (!it) return sum;
    const v = getVariant(it, variantKey);
    return sum + (v.price * qty);
  }, 0);
}

function makeCartKey(itemId, variantKey) {
  return `${itemId}__${variantKey || "default"}`;
}

function parseCartKey(key) {
  const parts = String(key).split("__");
  return { itemId: parts[0], variantKey: parts[1] || "default" };
}

function getVariant(item, variantKey) {
  const v = (item.variants || []).find(x => x.key === variantKey);
  return v || (item.variants?.[0]) || { key: "default", name: "", price: item.price };
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

  const items = rows.map(r => {
  const base = {
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
  };

  // leer variantes desde el CSV
  const v1Name = (r[idx("variant1Name")] ?? "").trim();
  const v1Price = toNum(r[idx("variant1Price")]);
  const v2Name = (r[idx("variant2Name")] ?? "").trim();
  const v2Price = toNum(r[idx("variant2Price")]);

  // construir lista de variantes
  const variants = [];
  if (v1Name && v1Price > 0) variants.push({ key: "v1", name: v1Name, price: v1Price });
  if (v2Name && v2Price > 0) variants.push({ key: "v2", name: v2Name, price: v2Price });

  // si no hay variantes, usar el precio base como opción default
  if (variants.length === 0) variants.push({ key: "default", name: "", price: base.price });

  return { ...base, variants };
}).filter(x => x.id && x.category && x.name);


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

    const minPrice = Math.min(...(it.variants || []).map(v => v.price));
    const priceText = (it.variants?.length > 1) ? `Desde ${money(minPrice)}` : money(minPrice);

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
          <div class="price">${priceText}</div>
          <button class="btn btn-primary" ${soldOut ? "disabled" : ""}>
            ${soldOut ? "No disponible" : "Elegir"}
          </button>
        </div>
      </div>
    `;

    // click en tarjeta abre detalle
    card.onclick = () => openItemModal(it);

    // click en botón también abre, sin “doble click”
    const btn = card.querySelector("button");
    btn.onclick = (e) => { e.stopPropagation(); if (!soldOut) openItemModal(it); };

    elGrid.appendChild(card);
  });
}

function addToCart(itemId, variantKey = "default") {
  const key = makeCartKey(itemId, variantKey);
  cart[key] = (cart[key] ?? 0) + 1;
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
    entries.forEach(([key, qty]) => {
      // key = "pz-1__v1" por ejemplo
      const { itemId, variantKey } = parseCartKey(key);

      // buscar el item original
      const it = DATA.items.find(x => x.id === itemId);
      if (!it) return;

      // buscar la variante elegida
      const v = getVariant(it, variantKey);

      // etiqueta de variante para mostrar
      const variantLabel = v.name ? ` (${v.name})` : "";

      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div class="cart-left">
          <div class="cart-name">${it.name}${variantLabel}</div>
          <div class="cart-sub">${qty} x ${money(v.price)} = <strong>${money(v.price * qty)}</strong></div>
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

      // + y - ahora trabajan con "key", no con "id"
      btnPlus.onclick = () => {
        cart[key] = qty + 1;
        saveCart(cart);
        renderCart();
        updateTop();
      };

      btnMinus.onclick = () => {
        if (qty <= 1) delete cart[key];
        else cart[key] = qty - 1;

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

  Object.entries(cart).forEach(([key, qty]) => {
  const { itemId, variantKey } = parseCartKey(key);
  const it = DATA.items.find(x => x.id === itemId);
  if (!it) return;
  const v = getVariant(it, variantKey);
  const variantLabel = v.name ? ` (${v.name})` : "";
  lines.push(`${qty} x ${it.name}${variantLabel} — ${money(v.price * qty)}`);
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
function openItemModal(it) {
  modalItem = it;
  const firstVariant = (it.variants && it.variants.length) ? it.variants[0] : { key:"default", name:"", price: it.price };
  modalVariantKey = firstVariant.key;

  elItemTitle.textContent = it.name;
  elItemDesc.textContent = it.desc || "";
  elItemImg.src = it.imgUrl || "";
  elItemImg.alt = it.name;

  // armar radios de variantes
  elVariantList.innerHTML = "";
  it.variants.forEach(v => {
    const row = document.createElement("label");
    row.className = "variant-option";
    row.innerHTML = `
      <div class="variant-left">
        <input type="radio" name="variant" value="${v.key}" ${v.key === modalVariantKey ? "checked" : ""}/>
        <span class="variant-name">${v.name || "Opción"}</span>
      </div>
      <div class="variant-price">${money(v.price)}</div>
    `;
    row.querySelector("input").onchange = () => {
      modalVariantKey = v.key;
      elItemPrice.textContent = money(v.price);
    };
    elVariantList.appendChild(row);
  });

  elItemPrice.textContent = money(firstVariant.price);

  // botón añadir
  elBtnAddItem.disabled = (it.soldOut === true);
  elBtnAddItem.textContent = (it.soldOut === true) ? "Agotado" : "Añadir al pedido";
  elBtnAddItem.onclick = () => {
    if (it.soldOut === true) return;
    addToCart(it.id, modalVariantKey);
    closeItemModal();
  };

  elItemModal.classList.remove("hidden");
}

function closeItemModal() {
  elItemModal.classList.add("hidden");
  modalItem = null;
}

init(elCloseItem.onclick = closeItemModal;
elItemModal.addEventListener("click", (e) => { if (e.target === elItemModal) closeItemModal(); });
);
