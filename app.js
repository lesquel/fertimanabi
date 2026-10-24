"use strict";

// ---------- Constants ----------
const STORAGE_KEY = "fertimanabi.v1";
const SACK_KG = 50;
const P_TO_P2O5 = 2.291;
const K_TO_K2O = 1.205;
const K_CMOL_TO_PPM = 391; // 1 cmol(+)/kg of K = 391 mg/kg
const NUTRIENTS = [
  { key: "n", label: "N", name: "Nitrógeno" },
  { key: "p", label: "P₂O₅", name: "Fósforo" },
  { key: "k", label: "K₂O", name: "Potasio" },
];
const DEFAULT_SOURCES = { p: "sft", k: "kcl", n: "urea" };

const $ = (id) => document.getElementById(id);
const money = (v) => "$" + v.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = (v) => v.toLocaleString("es-EC", { maximumFractionDigits: 1 });
const num = (id, fallback = 0) => {
  const v = parseFloat($(id).value);
  return Number.isFinite(v) ? v : fallback;
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Storage (localStorage, fails safe) ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { prices: parsed.prices || {}, history: parsed.history || [], last: parsed.last || null };
  } catch {
    return { prices: {}, history: [], last: null };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the app keeps working in memory */
  }
}

const state = loadState();

// ---------- Data helpers ----------
const fertById = (id) => {
  const f = FERTILIZERS.find((x) => x.id === id);
  return f ? { ...f, price: state.prices[id] ?? f.price } : null;
};
const cropById = (id) => CROPS.find((c) => c.id === id);

// ---------- Core calculation (Liebig's law of the minimum) ----------
function calculate(input) {
  const crop = cropById(input.cropId);
  const factor = input.depth * input.density * 0.1; // ppm -> kg/ha
  const kPpm = input.kUnit === "cmol" ? input.soilK * K_CMOL_TO_PPM : input.soilK;

  const soil = {
    n: input.soilN * factor,
    p: input.soilP * factor * P_TO_P2O5,
    k: kPpm * factor * K_TO_K2O,
  };
  const req = { n: crop.n, p: crop.p, k: crop.k };
  const deficit = {};
  const toApply = {};
  for (const { key } of NUTRIENTS) {
    deficit[key] = Math.max(0, req[key] - soil[key]);
    toApply[key] = deficit[key] / (input.eff[key] / 100);
  }

  // Cover P first, then K, then N, discounting what each product already supplied.
  const remaining = { ...toApply };
  const perHa = new Map();
  for (const key of ["p", "k", "n"]) {
    const f = fertById(input.sources[key]);
    if (!f || remaining[key] <= 0 || f[key] <= 0) continue;
    const amount = remaining[key] / (f[key] / 100);
    perHa.set(f.id, (perHa.get(f.id) || 0) + amount);
    for (const { key: k2 } of NUTRIENTS) remaining[k2] -= amount * (f[k2] / 100);
  }

  const lines = [...perHa].map(([id, kgHa]) => {
    const f = fertById(id);
    const total = kgHa * input.area;
    const sacks = Math.ceil(total / SACK_KG - 1e-9);
    return { id, name: f.name, kgHa, kg: total, sacks, cost: (total / SACK_KG) * f.price, costSacks: sacks * f.price };
  });

  const surplus = {};
  for (const { key } of NUTRIENTS) surplus[key] = Math.max(0, -remaining[key]);

  return {
    crop, soil, req, deficit, lines, surplus,
    total: lines.reduce((s, l) => s + l.cost, 0),
    totalSacks: lines.reduce((s, l) => s + l.costSacks, 0),
  };
}

// ---------- Form ----------
function readInput() {
  return {
    cropId: $("cropSelect").value,
    soilN: Math.max(0, num("soilN")),
    soilP: Math.max(0, num("soilP")),
    soilK: Math.max(0, num("soilK")),
    kUnit: $("soilKUnit").value,
    ph: $("soilPh").value === "" ? null : num("soilPh"),
    altitude: $("altitude").value === "" ? null : num("altitude"),
    area: Math.max(0.01, num("area", 1)),
    depth: Math.max(1, num("depth", 20)),
    density: Math.max(0.1, num("density", 1.3)),
    eff: {
      n: Math.min(100, Math.max(10, num("effN", 100))),
      p: Math.min(100, Math.max(10, num("effP", 100))),
      k: Math.min(100, Math.max(10, num("effK", 100))),
    },
    sources: { p: $("srcP").value, k: $("srcK").value, n: $("srcN").value },
  };
}

function writeInput(i) {
  $("cropSearch").value = "";
  fillCropSelect("");
  $("cropSelect").value = i.cropId;
  $("soilN").value = i.soilN;
  $("soilP").value = i.soilP;
  $("soilK").value = i.soilK;
  $("soilKUnit").value = i.kUnit;
  $("soilPh").value = i.ph ?? "";
  $("altitude").value = i.altitude ?? "";
  $("area").value = i.area;
  $("depth").value = i.depth;
  $("density").value = i.density;
  $("effN").value = i.eff.n;
  $("effP").value = i.eff.p;
  $("effK").value = i.eff.k;
  for (const key of ["p", "k", "n"]) $("src" + key.toUpperCase()).value = i.sources[key];
}

function fillCropSelect(query) {
  const q = query.trim().toLowerCase();
  const current = $("cropSelect").value;
  const matches = CROPS.filter((c) => !q || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  const groups = [...new Set(matches.map((c) => c.group))];
  $("cropSelect").innerHTML = matches.length
    ? groups.map((g) => `<optgroup label="${g}">${matches.filter((c) => c.group === g)
        .map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</optgroup>`).join("")
    : `<option value="" disabled selected>Ningún cultivo coincide</option>`;
  if (matches.some((c) => c.id === current)) $("cropSelect").value = current;
}

function fillSourceSelects() {
  for (const key of ["p", "k", "n"]) {
    const sel = $("src" + key.toUpperCase());
    const prev = sel.value || DEFAULT_SOURCES[key];
    sel.innerHTML = FERTILIZERS.filter((f) => f[key] > 0)
      .map((f) => {
        const p = fertById(f.id);
        return `<option value="${f.id}">${f.name} (${f.n}-${f.p}-${f.k}) ${money(p.price)}</option>`;
      })
      .join("");
    sel.value = prev;
  }
}

// ---------- Rendering ----------
function renderCropCard(crop) {
  $("cropCard").innerHTML = `
    <p class="crop-name">${crop.name} <em>${crop.sci}</em></p>
    <dl>
      <div><dt>Necesita</dt><dd><b class="c-n">${crop.n}</b> N, <b class="c-p">${crop.p}</b> P₂O₅, <b class="c-k">${crop.k}</b> K₂O <small>kg/ha</small></dd></div>
      <div><dt>Clima</dt><dd>${crop.temp[0]} a ${crop.temp[1]} °C, ${crop.rain[0]} a ${crop.rain[1]} mm al año</dd></div>
      <div><dt>Altitud</dt><dd>${crop.alt[0]} a ${crop.alt[1]} m</dd></div>
      <div><dt>Suelo</dt><dd>pH ${crop.ph[0]} a ${crop.ph[1]}. ${crop.soil}</dd></div>
    </dl>`;
}

function renderColumns(r) {
  const max = Math.max(...NUTRIENTS.map(({ key }) => r.req[key]), 1);
  $("columns").innerHTML = NUTRIENTS.map(({ key, label, name }) => {
    const req = r.req[key];
    const soilPart = Math.min(r.soil[key], req);
    const covered = r.deficit[key] === 0;
    return `
      <div class="col col-${key}">
        <p class="col-val">${covered ? "Cubierto" : kg(r.deficit[key]) + " kg"}</p>
        <div class="col-bar" style="--h:${(req / max) * 100}" title="${name}: requiere ${kg(req)} kg/ha">
          <span class="col-def" style="flex-grow:${r.deficit[key]}"></span>
          <span class="col-soil" style="flex-grow:${soilPart}"></span>
        </div>
        <p class="col-label">${label}</p>
        <p class="col-meta">pide ${kg(req)}<br>suelo ${kg(r.soil[key])}</p>
      </div>`;
  }).join("");
}

function renderWarnings(r, input) {
  const w = [];
  const { crop } = r;
  if (input.ph !== null && (input.ph < crop.ph[0] || input.ph > crop.ph[1])) {
    w.push(`El pH ${input.ph} está fuera del rango ideal (${crop.ph[0]} a ${crop.ph[1]}). ${input.ph < crop.ph[0] ? "Considera encalar antes de fertilizar." : "Considera azufre o materia orgánica para bajarlo."}`);
  }
  if (input.altitude !== null && (input.altitude < crop.alt[0] || input.altitude > crop.alt[1])) {
    w.push(`A ${input.altitude} m el ${crop.name.toLowerCase()} rinde menos: su rango es de ${crop.alt[0]} a ${crop.alt[1]} m.`);
  }
  for (const { key, label } of NUTRIENTS) {
    if (r.surplus[key] > 1) w.push(`Los abonos elegidos dejan ${kg(r.surplus[key])} kg/ha de ${label} de más.`);
  }
  if (!r.lines.length) w.push("El suelo ya cubre todo lo que pide el cultivo. No necesitas comprar abono.");
  $("warnings").innerHTML = w.map((t) => `<li>${t}</li>`).join("");
}

function render() {
  const input = readInput();
  if (!input.cropId) return;
  const r = calculate(input);
  renderCropCard(r.crop);
  renderColumns(r);
  renderWarnings(r, input);

  const areaTxt = input.area === 1 ? "1 hectárea" : `${input.area.toLocaleString("es-EC")} hectáreas`;
  $("resultCrop").textContent = `${r.crop.name} en ${areaTxt}`;
  $("totalCost").textContent = money(r.total);
  $("totalSub").textContent = r.lines.length
    ? `Comprando sacos completos: ${money(r.totalSacks)}. Por hectárea: ${money(r.total / input.area)}.`
    : "";
  $("buyBody").innerHTML = r.lines.length
    ? r.lines.map((l) => `<tr><td>${l.name}</td><td>${kg(l.kg)}</td><td>${l.sacks}</td><td>${money(l.cost)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="empty">Nada que comprar</td></tr>`;

  state.last = input;
  saveState();
  return { input, r };
}

// ---------- Databases ----------
function renderFertTable() {
  $("fertBody").innerHTML = FERTILIZERS.map((f) => {
    const price = state.prices[f.id] ?? f.price;
    const edited = state.prices[f.id] !== undefined && state.prices[f.id] !== f.price;
    return `<tr>
      <td>${f.name}</td><td>${f.n}</td><td>${f.p}</td><td>${f.k}</td>
      <td><input class="price${edited ? " edited" : ""}" type="number" min="0" step="0.5" value="${price}" data-id="${f.id}" aria-label="Precio de ${f.name}"></td>
    </tr>`;
  }).join("");
}

function renderCropTable(query = "") {
  const q = query.trim().toLowerCase();
  $("cropBody").innerHTML = CROPS
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
    .map((c) => `<tr>
      <td><b>${c.name}</b><br><em>${c.sci}</em></td><td>${c.group}</td>
      <td>${c.alt[0]}–${c.alt[1]}</td><td>${c.temp[0]}–${c.temp[1]}</td><td>${c.rain[0]}–${c.rain[1]}</td>
      <td>${c.ph[0]}–${c.ph[1]}</td><td class="soil">${c.soil}</td>
      <td class="c-n">${c.n}</td><td class="c-p">${c.p}</td><td class="c-k">${c.k}</td>
    </tr>`).join("");
}

// ---------- History ----------
function renderHistory() {
  const h = state.history;
  $("historyCount").hidden = !h.length;
  $("historyCount").textContent = h.length;
  $("historyList").innerHTML = h.length
    ? h.map((e, i) => `<li>
        <div>
          <p class="h-title">${escapeHtml(e.cropName)} <span>${escapeHtml(e.areaTxt)}</span></p>
          <p class="h-meta">${new Date(e.date).toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" })}. ${escapeHtml(e.summary)}</p>
        </div>
        <p class="h-cost">${money(e.total)}</p>
        <div class="h-actions">
          <button type="button" class="btn btn-ghost" data-load="${i}">Abrir</button>
          <button type="button" class="btn btn-ghost" data-del="${i}" aria-label="Eliminar">Eliminar</button>
        </div>
      </li>`).join("")
    : `<li class="empty">Aún no guardas cálculos. Haz uno en Calcular y pulsa “Guardar en el historial”.</li>`;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Tabs ----------
function showTab(name) {
  document.querySelectorAll(".tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
  window.scrollTo({ top: 0 });
}

// ---------- Wiring ----------
function init() {
  fillCropSelect("");
  fillSourceSelects();
  $("cropSelect").value = "cacao-nacional";
  if (state.last && cropById(state.last.cropId)) {
    try { writeInput(state.last); } catch { /* ignore stale saved input */ }
  }

  $("calcForm").addEventListener("input", (e) => {
    if (e.target.id === "cropSearch") {
      fillCropSelect(e.target.value);
    }
    render();
  });
  $("calcForm").addEventListener("submit", (e) => e.preventDefault());

  $("saveBtn").addEventListener("click", () => {
    const out = render();
    if (!out) return;
    const { input, r } = out;
    state.history.unshift({
      date: Date.now(),
      cropName: r.crop.name,
      areaTxt: `${input.area} ha`,
      total: r.total,
      summary: r.lines.length ? r.lines.map((l) => `${l.sacks} sacos de ${l.name}`).join(", ") : "Sin abono",
      input,
    });
    state.history = state.history.slice(0, 30);
    saveState();
    renderHistory();
    toast("Guardado en el historial");
  });

  $("historyList").addEventListener("click", (e) => {
    const load = e.target.dataset.load;
    const del = e.target.dataset.del;
    if (load !== undefined) {
      writeInput(state.history[load].input);
      render();
      showTab("calc");
    } else if (del !== undefined) {
      state.history.splice(del, 1);
      saveState();
      renderHistory();
    }
  });
  $("clearHistory").addEventListener("click", () => {
    if (!state.history.length || !confirm("¿Borrar todo el historial?")) return;
    state.history = [];
    saveState();
    renderHistory();
  });

  $("fertBody").addEventListener("change", (e) => {
    if (!e.target.matches(".price")) return;
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v) || v < 0) return;
    state.prices[e.target.dataset.id] = v;
    saveState();
    renderFertTable();
    fillSourceSelects();
    render();
  });
  $("resetPrices").addEventListener("click", () => {
    state.prices = {};
    saveState();
    renderFertTable();
    fillSourceSelects();
    render();
  });

  $("cropFilter").addEventListener("input", (e) => renderCropTable(e.target.value));

  document.querySelectorAll("[data-tab]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); showTab(el.dataset.tab); }));

  renderFertTable();
  renderCropTable();
  renderHistory();
  render();
}

init();
