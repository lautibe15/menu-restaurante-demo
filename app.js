// ====== CONFIG ======
const CONFIG = {
  restaurantName: "PRUEBA",
  currencySymbol: "$",
  whatsappPhone: "5493517520425",
  logoSrc: "assets/logo.png",

  // Horario de pedidos (24h)
  orderingHours: {
    enabled: true,
    tzOffsetMinutes: null, // null = usa hora del dispositivo. Ej: -180 para Argentina (GMT-3)
    start: "11:00",
    end: "23:00"
  }
};

// Pegá acá TU link CSV publicado (de Sheets "Publicar en la web" formato CSV)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQEcrYDznig15_wyrQH2pRP8hqpL3Oh50qZUMkeycGX3EImOX0oQXUabcbjdjHcZhk1bWFvoQ_fIiIZ/pub?gid=0&single=true&output=csv";
const SETTINGS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQEcrYDznig15_wyrQH2pRP8hqpL3Oh50qZUMkeycGX3EImOX0oQXUabcbjdjHcZhk1bWFvoQ_fIiIZ/pub?gid=1846980024&single=true&output=csv";

// ====== Estado ======
const LS_KEY = "restaurant_cart_v1";
const DELIVERY_FEE = 4000;
const LS_DELIVERY_MODE = "restaurant_delivery_mode_v1";     // "pickup" | "delivery"
const LS_DELIVERY_ADDRESS = "restaurant_delivery_address_v1";

let deliveryMode = loadDeliveryMode();   // pickup/delivery
let deliveryAddress = loadDeliveryAddress();
let DATA = { categories: [], items: [] };
let currentCategory = null;
let cart = loadCart();
let searchQuery = "";

function normText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita acentos
}

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
// Entrega
const elDeliveryPickup = document.getElementById("deliveryPickup");
const elDeliveryDelivery = document.getElementById("deliveryDelivery");
const elDeliveryAddressWrap = document.getElementById("deliveryAddressWrap");
const elDeliveryAddress = document.getElementById("deliveryAddress");
// Modal detalle item
const elItemModal = document.getElementById("itemModal");
const elCloseItem = document.getElementById("btnCloseItem");
const elItemTitle = document.getElementById("itemTitle");
const elItemImg = document.getElementById("itemImg");
const elItemDesc = document.getElementById("itemDesc");
const elVariantList = document.getElementById("variantList");
const elItemPrice = document.getElementById("itemPrice");
const elBtnAddItem = document.getElementById("btnAddItem");
const elBtnItemMinus = document.getElementById("btnItemMinus");
const elBtnItemPlus  = document.getElementById("btnItemPlus");
const elItemQty      = document.getElementById("itemQty");
const elBtnCartFloating = document.getElementById("btnCartFloating");
const elCartCountFloating = document.getElementById("cartCountFloating");
const elNameTop = document.getElementById("restaurantNameTop");
const elClosedBanner = document.getElementById("closedBanner");
const elSearch = document.getElementById("searchInput");
const elClearSearch = document.getElementById("btnClearSearch");
const elSearchMeta = document.getElementById("searchMeta");


let modalItem = null;
let modalVariantKey = "default";
let modalQty = 1;
let modalUnitPrice = 0;

function updateItemModalPrice() {
  elItemPrice.textContent = money(modalUnitPrice * modalQty);
}




// ====== Helpers ======
function money(n) { return `${CONFIG.currencySymbol}${Math.round(n)}`; }

function loadCart() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) ?? {}; }
  catch { return {}; }
}
function loadDeliveryMode() {
  const v = localStorage.getItem(LS_DELIVERY_MODE);
  return (v === "delivery" || v === "pickup") ? v : "pickup";
}
function saveDeliveryMode(v) {
  localStorage.setItem(LS_DELIVERY_MODE, v);
}
function loadDeliveryAddress() {
  return localStorage.getItem(LS_DELIVERY_ADDRESS) || "";
}
function saveDeliveryAddress(v) {
  localStorage.setItem(LS_DELIVERY_ADDRESS, v);
}

function cartSubtotal(c) {
  // Si ya migraste a variantes, esta función debe usar tu cartTotal actual "por key".
  // Si NO migraste, reemplazá por la lógica antigua.
  return cartTotal(c);
}

function orderTotal(c) {
  const subtotal = cartSubtotal(c);
  return subtotal + (deliveryMode === "delivery" ? DELIVERY_FEE : 0);
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
function parseHHMM(s) {
  const [h, m] = String(s).split(":").map(Number);
  return (h * 60) + (m || 0);
}

function nowMinutes(tzOffsetMinutes = null) {
  const d = new Date();
  if (tzOffsetMinutes === null) return d.getHours() * 60 + d.getMinutes();

  // Convertir "ahora" a la zona horaria fija indicada
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const local = new Date(utc + tzOffsetMinutes * 60000);
  return local.getHours() * 60 + local.getMinutes();
}

function isWithinWindow(start, end, current) {
  // ventana normal: start < end (ej 11:00-23:00)
  if (start < end) return current >= start && current < end;
  // ventana que cruza medianoche (ej 20:00-02:00)
  return current >= start || current < end;
}

function isOrderingOpen() {
  const oh = CONFIG.orderingHours;
  if (!oh?.enabled) return SETTINGS.ordersEnabled !== false;

  const start = parseHHMM(oh.start);
  const end = parseHHMM(oh.end);
  const cur = nowMinutes(oh.tzOffsetMinutes);

  const inSchedule = isWithinWindow(start, end, cur);
  const manualEnabled = (SETTINGS.ordersEnabled !== false);

  return inSchedule && manualEnabled;
}

function applyOrderingState() {
  const open = isOrderingOpen();

  // banner
 if (elClosedBanner) {
  const msg = SETTINGS.closedMessage?.trim()
    ? SETTINGS.closedMessage.trim()
    : `Estamos cerrados. Tomamos pedidos de ${CONFIG.orderingHours.start} a ${CONFIG.orderingHours.end}.`;

  elClosedBanner.innerHTML = msg;
  elClosedBanner.classList.toggle("hidden", isOrderingOpen());
}

  // botón flotante
  if (elBtnCartFloating) {
    // si está cerrado, lo ocultamos (aunque haya items)
    if (!open) elBtnCartFloating.classList.add("hidden");
  }

  // botón WhatsApp (en carrito)
  if (elBtnWA) {
    if (!open) {
      elBtnWA.style.pointerEvents = "none";
      elBtnWA.style.opacity = "0.5";
    }
  }

  return open;
}
let SETTINGS = {
  ordersEnabled: true,
  closedMessage: ""
};

async function loadSettingsFromSheet() {
  if (!SETTINGS_CSV_URL || SETTINGS_CSV_URL.includes("PEGAR_AQUI")) {
    return { ordersEnabled: true, closedMessage: "" };
  }

  const url = SETTINGS_CSV_URL + (SETTINGS_CSV_URL.includes("?") ? "&" : "?") + "_=" + Date.now();
  const res = await fetch(url, { cache: "no-store" });
  const csv = await res.text();

  const rows = parseCSV(csv);
  const header = rows.shift().map(h => h.trim());
  const idx = (name) => header.indexOf(name);

  const out = { ordersEnabled: true, closedMessage: "" };

  rows.forEach(r => {
    const key = String(r[idx("key")] ?? "").trim();
    const value = String(r[idx("value")] ?? "").trim();

    if (key === "ordersEnabled") out.ordersEnabled = toBool(value, true);
    if (key === "closedMessage") out.closedMessage = value;
  });

  return out;
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
  const n = cartCount(cart);

  // contador original
  elCartCount.textContent = n;

  // contador flotante
  if (elCartCountFloating) elCartCountFloating.textContent = n;

  // mostrar/ocultar botón flotante
  if (elBtnCartFloating) {
    if (n > 0) elBtnCartFloating.classList.remove("hidden");
    else elBtnCartFloating.classList.add("hidden");
  }
  // ✅ Esto hace que el contenido “suba” cuando aparece el botón
  document.body.classList.toggle("has-fab", n > 0);
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

function openItemModal(it) {
  modalItem = it;

  const variants = (it.variants && it.variants.length)
    ? it.variants
    : [{ key: "default", name: "", price: it.price }];

  const hasRealVariants =
    variants.length > 1 || variants.some(v => v.key !== "default");

  // cantidad inicial
  modalQty = 1;
  elItemQty.textContent = "1";
  elBtnItemMinus.disabled = true;

  // setup base del modal
  elItemTitle.textContent = it.name;
  elItemDesc.textContent = it.desc || "";
  elItemImg.src = it.imgUrl || "";
  elItemImg.alt = it.name;

  // variantes
  if (!hasRealVariants) {
    modalVariantKey = "default";
    modalUnitPrice = it.price;

    elVariantList.classList.add("hidden");
    elVariantList.innerHTML = "";
  } else {
    elVariantList.classList.remove("hidden");
    elVariantList.innerHTML = "";

    const firstVariant = variants[0];
    modalVariantKey = firstVariant.key;
    modalUnitPrice = firstVariant.price;

    variants.forEach(v => {
      const row = document.createElement("label");
      row.className = "variant-option";
      row.innerHTML = `
        <div class="variant-left">
          <input type="radio" name="variant" value="${v.key}" ${v.key === modalVariantKey ? "checked" : ""}/>
          <span class="variant-name">${v.name}</span>
        </div>
        <div class="variant-price">${money(v.price)}</div>
      `;

      row.querySelector("input").onchange = () => {
        modalVariantKey = v.key;
        modalUnitPrice = v.price;
        updateItemModalPrice();
      };

      elVariantList.appendChild(row);
    });
  }

  // precio inicial (unitario * qty)
  updateItemModalPrice();

  // handlers del contador (actualizan precio)
  elBtnItemPlus.onclick = () => {
    modalQty += 1;
    elItemQty.textContent = String(modalQty);
    elBtnItemMinus.disabled = (modalQty <= 1);
    updateItemModalPrice();
  };

  elBtnItemMinus.onclick = () => {
    if (modalQty <= 1) return;
    modalQty -= 1;
    elItemQty.textContent = String(modalQty);
    elBtnItemMinus.disabled = (modalQty <= 1);
    updateItemModalPrice();
  };

  // botón añadir
  const soldOut = it.soldOut === true;
  elBtnAddItem.disabled = soldOut;
  elBtnAddItem.textContent = soldOut ? "Agotado" : "Añadir al pedido";
  const open = isOrderingOpen();
elBtnAddItem.disabled = soldOut || !open;
if (!open) elBtnAddItem.textContent = "Fuera de horario";
else elBtnAddItem.textContent = soldOut ? "Agotado" : "Añadir al pedido";

  elBtnAddItem.onclick = () => {
  if (soldOut) return;
  if (!isOrderingOpen()) return; // doble seguridad
  addToCart(it.id, modalVariantKey, modalQty);
  closeItemModal();
};


   elItemModal.classList.remove("hidden");
  syncModalOpenClass();
}



function closeItemModal() {
   elItemModal.classList.add("hidden");
  modalItem = null;
  syncModalOpenClass();
}

function renderItems() {
  elGrid.innerHTML = "";

  const q = normText(searchQuery.trim());

  let items = DATA.items
    .filter(i => !searchQuery.trim() ? (i.category === currentCategory) : true)
    .filter(i => i.visible !== false)
    .filter(isInDateWindow)
    .filter(i => {
      if (!q) return true;
      const hay = normText(`${i.name} ${i.desc || ""}`);
      return hay.includes(q);
    })
    .sort((a,b) => (a.sort ?? 999) - (b.sort ?? 999));

  // meta (contador de resultados)
  if (elSearchMeta) {
    if (q) {
      elSearchMeta.classList.remove("hidden");
      elSearchMeta.textContent = `${items.length} resultado(s) para “${searchQuery.trim()}”`;
    } else {
      elSearchMeta.classList.add("hidden");
      elSearchMeta.textContent = "";
    }
  }

  if (items.length === 0) {
    elGrid.innerHTML = `<p style="padding:12px;color:#444">No hay resultados.</p>`;
    return;
  }

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

    card.onclick = () => openItemModal(it);
    const btn = card.querySelector("button");
    btn.onclick = (e) => { e.stopPropagation(); if (!soldOut) openItemModal(it); };

    elGrid.appendChild(card);
  });
}


function addToCart(itemId, variantKey = "default", qty = 1) {
  const key = makeCartKey(itemId, variantKey);
  cart[key] = (cart[key] ?? 0) + qty;
  saveCart(cart);
  updateTop();
}



function openCart() { renderCart(); elModal.classList.remove("hidden"); syncModalOpenClass(); }
function closeCart() { elModal.classList.add("hidden"); syncModalOpenClass(); }

function syncModalOpenClass() {
  const cartOpen = elModal && !elModal.classList.contains("hidden");
  const itemOpen = elItemModal && !elItemModal.classList.contains("hidden");
  document.body.classList.toggle("modal-open", cartOpen || itemOpen);
}


function renderCart() {
  elCartList.innerHTML = "";
  const entries = Object.entries(cart);

  if (entries.length === 0) {
    elCartList.innerHTML = `<p>Tu carrito está vacío.</p>`;
  } else {
    entries.forEach(([key, qty]) => {
      const { itemId, variantKey } = parseCartKey(key);
      const it = DATA.items.find(x => x.id === itemId);
      if (!it) return;
  
      const v = getVariant(it, variantKey);
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

      const [btnMinus, btnPlus] = row.querySelectorAll("button");

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

  // Mostrar/ocultar address
  if (deliveryMode === "delivery") {
  elDeliveryAddressWrap.classList.remove("hidden");
} else {
  elDeliveryAddressWrap.classList.add("hidden");
}


  // Total con envío
  elCartTotal.textContent = money(orderTotal(cart));
  elBtnWA.href = buildWhatsAppLink();

  // Validación: si es delivery, exigir dirección
  const needsAddress = (deliveryMode === "delivery");
  const hasAddress = (deliveryAddress || "").trim().length > 5;
  const open = isOrderingOpen();
const canSend = open && entries.length > 0 && (!needsAddress || hasAddress);

  elBtnWA.style.pointerEvents = canSend ? "auto" : "none";
  elBtnWA.style.opacity = canSend ? "1" : "0.5";
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
  lines.push("Opciones de entrega:");

  if (deliveryMode === "delivery") {
    lines.push("• Envío a domicilio");
    lines.push(`• Dirección: ${(deliveryAddress || "").trim() || "(sin dirección)"}`);
    lines.push(`• Costo de envío: ${money(DELIVERY_FEE)}`);
  } else {
    lines.push("• Retiro en el local");
  }

  lines.push("");
  lines.push(`Total: ${money(orderTotal(cart))}`);

  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${CONFIG.whatsappPhone}?text=${text}`;
}

// ====== INIT ======
async function init() {
  elLogo.src = CONFIG.logoSrc;
  if (elNameTop) elNameTop.textContent = CONFIG.restaurantName;
  if (elName) elName.textContent = "";

  try {
    DATA = await loadMenuFromSheet();
  } catch (e) {
    if (elName) elName.textContent = "Error cargando el menú (revisá SHEET_CSV_URL y el CSV publicado)";
    console.error(e);
    return;
  }

  try {
    SETTINGS = await loadSettingsFromSheet();
  } catch (e) {
    console.warn("No se pudieron cargar settings, uso default", e);
    SETTINGS = { ordersEnabled: true, closedMessage: "" };
  }

  currentCategory = DATA.categories[0] ?? "Menú";

  renderCategories();
  renderItems();
  updateTop();
  // búsqueda
if (elSearch) {
  elSearch.addEventListener("input", () => {
    searchQuery = elSearch.value;
    if (elClearSearch) elClearSearch.classList.toggle("hidden", searchQuery.trim() === "");
    renderItems();
  });
}

if (elClearSearch && elSearch) {
  elClearSearch.onclick = () => {
    elSearch.value = "";
    searchQuery = "";
    elClearSearch.classList.add("hidden");
    renderItems();
  };
}


  // carrito
  elBtnCart.onclick = openCart;
  if (elBtnCartFloating) elBtnCartFloating.onclick = openCart;

  elClose.onclick = closeCart;
  elModal.addEventListener("click", (e) => { if (e.target === elModal) closeCart(); });

  elBtnClear.onclick = () => {
    cart = {};
    saveCart(cart);
    renderCart();
    updateTop();
  };

  // modal de item
  elCloseItem.onclick = closeItemModal;
  elItemModal.addEventListener("click", (e) => { if (e.target === elItemModal) closeItemModal(); });

  // delivery radios + dirección
  elDeliveryPickup.checked = (deliveryMode === "pickup");
  elDeliveryDelivery.checked = (deliveryMode === "delivery");
  elDeliveryAddress.value = deliveryAddress;

  elDeliveryPickup.onchange = () => {
    deliveryMode = "pickup";
    saveDeliveryMode(deliveryMode);
    renderCart();
  };

  elDeliveryDelivery.onchange = () => {
    deliveryMode = "delivery";
    saveDeliveryMode(deliveryMode);
    renderCart();
  };

  elDeliveryAddress.addEventListener("input", () => {
    deliveryAddress = elDeliveryAddress.value;
    saveDeliveryAddress(deliveryAddress);

    // si el carrito está abierto, refresca para recalcular habilitación y WA
    if (elModal && !elModal.classList.contains("hidden")) renderCart();
  });

  // ✅ Aplicar estado abierto/cerrado apenas inicia
  applyOrderingState();

  // ✅ Refrescar cada 30s (o 60s si preferís)
  setInterval(() => {
    applyOrderingState();
    if (elModal && !elModal.classList.contains("hidden")) renderCart();
  }, 30000);
}

init();

