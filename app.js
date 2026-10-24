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
const limeById = (id) => LIMES.find((l) => l.id === id) || LIMES[0];

// ---------- Liming ----------
// With exchangeable acidity (Al+H) we use Kamprath: 1.5 t CaCO3 per cmol/kg.
// Without it, a rough estimate of 2 t CaCO3 per pH unit for a loam soil.
// Both are referred to 20 cm and 1.3 g/cm3, then scaled to the user's layer.
function calculateLime(input, crop) {
  if (input.ph === null || input.ph >= crop.ph[0]) return null;
  const target = Math.min(crop.ph[0] + 0.5, (crop.ph[0] + crop.ph[1]) / 2);
  const scale = (input.depth * input.density) / 26;
  const byAcidity = input.alh !== null && input.alh > 0;
  const caco3Tha = (byAcidity ? 1.5 * input.alh : (target - input.ph) * 2) * scale;
  const lime = limeById(input.limeId);
  const kgHa = (caco3Tha * 1000) / (lime.prnt / 100);
  const total = kgHa * input.area;
  const sacks = Math.ceil(total / SACK_KG - 1e-9);
  return {
    id: lime.id, name: lime.name, target, caco3Tha, kgHa, kg: total, sacks,
    method: byAcidity ? `Kamprath: 1,5 × ${input.alh} cmol/kg de Al+H` : "estimado por pH: 2 t de CaCO₃ por unidad de pH",
    cost: (total / SACK_KG) * lime.price,
    costSacks: sacks * lime.price,
  };
}

// ---------- Core calculation (Liebig's law of the minimum) ----------
function calculate(input, { withLime = true } = {}) {
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

  const lime = withLime ? calculateLime(input, crop) : null;
  const fertTotal = lines.reduce((s, l) => s + l.cost, 0);
  const fertSacks = lines.reduce((s, l) => s + l.costSacks, 0);

  return {
    crop, soil, req, deficit, lines, surplus, lime, fertTotal,
    total: fertTotal + (lime ? lime.cost : 0),
    totalSacks: fertSacks + (lime ? lime.costSacks : 0),
  };
}

// ---------- Formula comparison ----------
// Tries every P, K and N source among the 25 fertilizers and keeps the cheapest distinct mixes.
const mixKey = (lines) => lines.map((l) => `${l.id}:${l.kgHa.toFixed(1)}`).sort().join("|");

function compareOptions(input) {
  const sourcesOf = (key) => FERTILIZERS.filter((f) => f[key] > 0).map((f) => f.id);
  const best = new Map();
  for (const p of sourcesOf("p")) {
    for (const k of sourcesOf("k")) {
      for (const n of sourcesOf("n")) {
        const r = calculate({ ...input, sources: { p, k, n } }, { withLime: false });
        const key = mixKey(r.lines);
        if (!best.has(key)) {
          best.set(key, {
            key, sources: { p, k, n }, lines: r.lines, surplus: r.surplus, cost: r.fertTotal,
            sacks: r.lines.reduce((s, l) => s + l.sacks, 0),
          });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => a.cost - b.cost);
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
    alh: $("soilAlh").value === "" ? null : Math.max(0, num("soilAlh")),
    limeId: $("limeSelect").value,
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
  $("soilAlh").value = i.alh ?? "";
  $("limeSelect").value = limeById(i.limeId).id;
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

function fillLimeSelect() {
  $("limeSelect").innerHTML = LIMES
    .map((l) => `<option value="${l.id}">${l.name}, poder ${l.prnt} % ${money(l.price)}</option>`)
    .join("");
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
  $("warnings").innerHTML = buildWarnings(r, input).map((t) => `<li>${t}</li>`).join("");
}

function buildWarnings(r, input) {
  const w = [];
  const { crop } = r;
  if (input.ph !== null && (input.ph < crop.ph[0] || input.ph > crop.ph[1])) {
    w.push(`El pH ${input.ph} está fuera del rango ideal (${crop.ph[0]} a ${crop.ph[1]}). ${input.ph < crop.ph[0] ? "Encala 1 a 2 meses antes de fertilizar; la cal ya está sumada al costo." : "Considera azufre o materia orgánica para bajarlo."}`);
  }
  if (input.altitude !== null && (input.altitude < crop.alt[0] || input.altitude > crop.alt[1])) {
    w.push(`A ${input.altitude} m el ${crop.name.toLowerCase()} rinde menos: su rango es de ${crop.alt[0]} a ${crop.alt[1]} m.`);
  }
  for (const { key, label } of NUTRIENTS) {
    if (r.surplus[key] > 1) w.push(`Los abonos elegidos dejan ${kg(r.surplus[key])} kg/ha de ${label} de más.`);
  }
  if (!r.lines.length) w.push("El suelo ya cubre todo lo que pide el cultivo. No necesitas comprar abono.");
  return w;
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
  const parts = r.lime ? ` Abono ${money(r.fertTotal)} y cal ${money(r.lime.cost)}.` : "";
  $("totalSub").textContent = r.lines.length || r.lime
    ? `Comprando sacos completos: ${money(r.totalSacks)}. Por hectárea: ${money(r.total / input.area)}.${parts}`
    : "";
  const rows = r.lines.map((l) => `<tr><td>${l.name}</td><td>${kg(l.kg)}</td><td>${l.sacks}</td><td>${money(l.cost)}</td></tr>`);
  if (r.lime) rows.push(`<tr class="lime-row"><td>${r.lime.name}</td><td>${kg(r.lime.kg)}</td><td>${r.lime.sacks}</td><td>${money(r.lime.cost)}</td></tr>`);
  $("buyBody").innerHTML = rows.length ? rows.join("") : `<tr><td colspan="4" class="empty">Nada que comprar</td></tr>`;
  renderLime(r.lime, input);
  scheduleCompare(input, r);

  state.last = input;
  saveState();
  return { input, r };
}

function renderLime(lime, input) {
  $("lime").hidden = !lime;
  if (!lime) return;
  $("lime").innerHTML = `
    <p class="lime-title">Encalado <span>${kg(lime.kgHa)} kg/ha</span></p>
    <p>Tu pH ${input.ph} está bajo. Con ${lime.name.toLowerCase()} lo subes a cerca de ${lime.target.toFixed(1)}: equivale a ${lime.caco3Tha.toFixed(2)} t/ha de CaCO₃ (${lime.method}).</p>`;
}

// The comparison runs ~4 000 calculations, so it waits until typing pauses.
let compareTimer;
function scheduleCompare(input, r) {
  clearTimeout(compareTimer);
  compareTimer = setTimeout(() => renderCompare(input, r), 150);
}

function renderCompare(input, r) {
  const options = compareOptions(input);
  const mineKey = mixKey(r.lines);
  const top = options.slice(0, 5);
  const mineRank = options.findIndex((o) => o.key === mineKey);
  const shown = mineRank >= 5 ? [...top, options[mineRank]] : top;
  const mixText = (o) => o.lines.length
    ? o.lines.map((l) => `${l.name}: ${kg(l.kg)} kg`).join("<br>")
    : "Sin abono";
  const surplusText = (o) => NUTRIENTS
    .filter(({ key }) => o.surplus[key] > 1)
    .map(({ key, label }) => `${kg(o.surplus[key])} kg/ha de ${label} de más`)
    .join(", ");

  $("cmpBody").innerHTML = shown.map((o) => {
    const rank = options.indexOf(o);
    const isMine = o.key === mineKey;
    const diff = o.cost - r.fertTotal;
    const vs = isMine ? "Es la tuya"
      : diff < -0.005 ? `<span class="save">Ahorras ${money(-diff)}</span>`
      : `<span class="more">${money(diff)} más</span>`;
    const extra = surplusText(o);
    return `<tr class="${rank === 0 ? "best" : ""} ${isMine ? "mine" : ""}">
      <td class="rank">${rank + 1}</td>
      <td><div class="mix"><span>${mixText(o)}${rank === 0 ? '<span class="tag">Más barata</span>' : ""}${isMine ? '<span class="tag tag-mine">Tu elección</span>' : ""}</span>${extra ? `<small>Deja ${extra}</small>` : ""}</div></td>
      <td>${o.sacks}</td>
      <td class="cost">${money(o.cost)}</td>
      <td>${vs}</td>
      <td>${isMine ? "" : `<button type="button" class="btn btn-ghost" data-use='${JSON.stringify(o.sources)}'>Usar esta</button>`}</td>
    </tr>`;
  }).join("");
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

// ---------- Excel export (SheetJS) ----------
function exportExcel() {
  if (typeof XLSX === "undefined") {
    toast("No se pudo cargar el generador de Excel. Revisa tu conexión a internet.");
    return;
  }
  const input = readInput();
  const r = calculate(input);
  const fSrc = (key) => fertById(input.sources[key]).name;
  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  const summary = [
    ["FertiManabí: cálculo de fertilización"],
    ["Fecha", new Date().toLocaleString("es-EC")],
    ["Cultivo", `${r.crop.name} (${r.crop.sci})`],
    ["Superficie (ha)", input.area],
    [],
    ["Análisis de suelo"],
    ["Nitrógeno (ppm)", input.soilN],
    ["Fósforo P (ppm)", input.soilP],
    [`Potasio K (${input.kUnit === "cmol" ? "cmol/kg" : "ppm"})`, input.soilK],
    ["pH", input.ph ?? "No indicado"],
    ["Altitud (m s. n. m.)", input.altitude ?? "No indicada"],
    ["Profundidad (cm)", input.depth],
    ["Densidad aparente (g/cm³)", input.density],
    [],
    ["Ley de Liebig (kg/ha)", "Requerimiento", "Aporte del suelo", "Déficit", "Eficiencia (%)", "Fuente"],
    ...NUTRIENTS.map(({ key, label }) => [label, r.req[key], round(r.soil[key], 1), round(r.deficit[key], 1), input.eff[key], fSrc(key)]),
    [],
    ["Compra", "kg/ha", `kg total (${input.area} ha)`, "Sacos de 50 kg", "Precio saco (USD)", "Costo exacto (USD)", "Costo en sacos (USD)"],
    ...r.lines.map((l) => [l.name, round(l.kgHa, 1), round(l.kg, 1), l.sacks, fertById(l.id).price, round(l.cost), round(l.costSacks)]),
    ...(r.lime ? [[r.lime.name, round(r.lime.kgHa, 1), round(r.lime.kg, 1), r.lime.sacks, limeById(r.lime.id).price, round(r.lime.cost), round(r.lime.costSacks)]] : []),
    ["TOTAL", "", "", r.lines.reduce((s, l) => s + l.sacks, 0) + (r.lime ? r.lime.sacks : 0), "", round(r.total), round(r.totalSacks)],
    ["Costo por hectárea (USD)", round(r.total / input.area)],
    ...(r.lime ? [[], ["Encalado"], ["pH objetivo", round(r.lime.target, 1)], ["CaCO₃ equivalente (t/ha)", round(r.lime.caco3Tha)], ["Método", r.lime.method]] : []),
  ];

  const mineKey = mixKey(r.lines);
  const compare = [
    ["Puesto", "Combinación", "Sacos", "Costo del abono (USD)", "Diferencia frente a la elegida (USD)"],
    ...compareOptions(input).slice(0, 10).map((o, i) => [
      i + 1,
      (o.lines.map((l) => `${l.name}: ${round(l.kg, 1)} kg`).join(" + ") || "Sin abono") + (o.key === mineKey ? " (elegida)" : ""),
      o.sacks, round(o.cost), round(o.cost - r.fertTotal),
    ]),
  ];

  const ferts = [
    ["Fertilizante", "N %", "P₂O₅ %", "K₂O %", "Precio saco 50 kg (USD)"],
    ...FERTILIZERS.map((f) => [f.name, f.n, f.p, f.k, fertById(f.id).price]),
  ];
  const crops = [
    ["Cultivo", "Nombre científico", "Grupo", "Altitud mín (m)", "Altitud máx (m)", "Temp mín (°C)", "Temp máx (°C)",
      "Lluvia mín (mm)", "Lluvia máx (mm)", "pH mín", "pH máx", "Suelo", "N (kg/ha)", "P₂O₅ (kg/ha)", "K₂O (kg/ha)"],
    ...CROPS.map((c) => [c.name, c.sci, c.group, ...c.alt, ...c.temp, ...c.rain, ...c.ph, c.soil, c.n, c.p, c.k]),
  ];
  const history = [
    ["Fecha", "Cultivo", "Superficie", "Compra", "Costo (USD)"],
    ...state.history.map((e) => [new Date(e.date).toLocaleString("es-EC"), e.cropName, e.areaTxt, e.summary, round(e.total)]),
  ];

  const sheet = (rows, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    return ws;
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(summary, [30, 16, 18, 16, 18, 20, 20]), "Resultado");
  XLSX.utils.book_append_sheet(wb, sheet(compare, [8, 70, 8, 20, 30]), "Comparar fórmulas");
  XLSX.utils.book_append_sheet(wb, sheet(ferts, [30, 8, 10, 10, 22]), "Fertilizantes");
  XLSX.utils.book_append_sheet(wb, sheet(crops, [22, 26, 16, 10, 10, 10, 10, 10, 10, 8, 8, 44, 10, 12, 12]), "Cultivos");
  if (state.history.length) XLSX.utils.book_append_sheet(wb, sheet(history, [22, 22, 12, 60, 12]), "Historial");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `fertimanabi-${r.crop.id}-${date}.xlsx`);
  toast("Excel descargado");
}

// ---------- PDF export (jsPDF + AutoTable) ----------
// Built-in PDF fonts have no subscript glyphs, so P₂O₅ is written as P2O5.
const pdfText = (s) => String(s).replace(/₂/g, "2").replace(/₃/g, "3").replace(/₅/g, "5").replace(/–/g, "-");

function exportPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF.API.autoTable) {
    toast("No se pudo cargar el generador de PDF. Revisa tu conexión a internet.");
    return;
  }
  const input = readInput();
  const r = calculate(input);
  const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
  const green = [31, 74, 42];
  const page = { w: 210, h: 297, m: 14 };
  let y = 0;

  const ensureSpace = (needed) => {
    if (y + needed > page.h - 18) { doc.addPage(); y = 20; }
  };
  const heading = (text, needed = 16) => {
    ensureSpace(needed);
    y += 9;
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...green).text(pdfText(text), page.m, y);
    y += 3;
  };
  const paragraph = (text, size = 9.5) => {
    doc.setFont("helvetica", "normal").setFontSize(size).setTextColor(60);
    const lines = doc.splitTextToSize(pdfText(text), page.w - page.m * 2);
    ensureSpace(lines.length * 4.6 + 2);
    y += 5;
    doc.text(lines, page.m, y);
    y += (lines.length - 1) * 4.6;
  };
  const table = (head, body, opts = {}) => {
    doc.autoTable({
      startY: y + 3,
      head: [head.map(pdfText)],
      body: body.map((row) => row.map(pdfText)),
      theme: "striped",
      margin: { left: page.m, right: page.m },
      styles: { fontSize: 9, cellPadding: 2.2 },
      headStyles: { fillColor: green, textColor: 255 },
      ...opts,
    });
    y = doc.lastAutoTable.finalY;
  };

  // Header band
  doc.setFillColor(...green).rect(0, 0, page.w, 30, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(20).text("FertiManabí", page.m, 14);
  doc.setFont("helvetica", "normal").setFontSize(10).text("Plan de fertilización con la Ley del Mínimo de Liebig", page.m, 22);
  doc.setFontSize(9).text(new Date().toLocaleString("es-EC", { dateStyle: "long", timeStyle: "short" }), page.w - page.m, 22, { align: "right" });

  // Crop and total
  y = 44;
  doc.setTextColor(28, 43, 30).setFont("helvetica", "bold").setFontSize(16).text(r.crop.name, page.m, y);
  doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(90).text(`${r.crop.sci}. Superficie: ${input.area} ha`, page.m, y + 6);
  doc.setFont("helvetica", "normal").setFontSize(9).text("Costo total", page.w - page.m, y - 6, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...green).text(money(r.total), page.w - page.m, y + 4, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(90)
    .text(`Por hectárea: ${money(r.total / input.area)}. En sacos completos: ${money(r.totalSacks)}`, page.w - page.m, y + 10, { align: "right" });
  y += 12;

  heading("Análisis de suelo");
  table(["Dato", "Valor"], [
    ["Nitrógeno disponible", `${input.soilN} ppm`],
    ["Fósforo (P)", `${input.soilP} ppm`],
    ["Potasio (K)", `${input.soilK} ${input.kUnit === "cmol" ? "cmol/kg" : "ppm"}`],
    ["pH", input.ph ?? "No indicado"],
    ["Acidez Al+H", input.alh !== null ? `${input.alh} cmol/kg` : "No indicada"],
    ["Capa considerada", `${input.depth} cm, densidad ${input.density} g/cm³`],
  ], { columnStyles: { 0: { cellWidth: 60 } } });

  heading("Ley de Liebig: requerimiento menos suelo (kg/ha)");
  table(["Nutriente", "Requerimiento", "Aporta el suelo", "Déficit", "Fuente elegida"],
    NUTRIENTS.map(({ key, label }) => [label, kg(r.req[key]), kg(r.soil[key]), kg(r.deficit[key]), fertById(input.sources[key]).name]));

  heading(`Lista de compra para ${input.area} ha`);
  const buyRows = r.lines.map((l) => [l.name, kg(l.kg), String(l.sacks), money(l.cost)]);
  if (r.lime) buyRows.push([r.lime.name, kg(r.lime.kg), String(r.lime.sacks), money(r.lime.cost)]);
  table(["Producto", "kg", "Sacos de 50 kg", "Costo"],
    buyRows.length ? buyRows : [["Nada que comprar", "", "", ""]],
    {
      foot: [["Total", "", String(r.lines.reduce((s, l) => s + l.sacks, 0) + (r.lime ? r.lime.sacks : 0)), money(r.total)]],
      footStyles: { fillColor: [233, 237, 227], textColor: [28, 43, 30], fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    });

  if (r.lime) {
    heading("Encalado");
    paragraph(`El pH ${input.ph} está por debajo del rango del cultivo (${r.crop.ph[0]} a ${r.crop.ph[1]}). Aplicar ${kg(r.lime.kgHa)} kg/ha de ${r.lime.name.toLowerCase()} para llevarlo a cerca de ${r.lime.target.toFixed(1)}. Equivale a ${r.lime.caco3Tha.toFixed(2)} t/ha de CaCO₃ (${r.lime.method}). Aplicar 1 a 2 meses antes de fertilizar.`);
  }

  heading("Fórmulas más baratas para el mismo déficit", 60);
  const mineKey = mixKey(r.lines);
  table(["Puesto", "Combinación", "Sacos", "Costo del abono"],
    compareOptions(input).slice(0, 3).map((o, i) => [
      String(i + 1),
      (o.lines.map((l) => `${l.name}: ${kg(l.kg)} kg`).join("\n") || "Sin abono") + (o.key === mineKey ? "\n(fórmula elegida)" : ""),
      String(o.sacks), money(o.cost),
    ]), { columnStyles: { 0: { cellWidth: 16 }, 2: { halign: "right" }, 3: { halign: "right" } } });

  const warnings = buildWarnings(r, input);
  if (warnings.length) {
    heading("Observaciones");
    warnings.forEach((w) => paragraph(`- ${w}`));
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(130)
      .text("Valores referenciales. Para recomendaciones de campo, consulte a un agrónomo.", page.m, page.h - 8)
      .text(`${i} / ${pages}`, page.w - page.m, page.h - 8, { align: "right" });
  }

  doc.save(`fertimanabi-${r.crop.id}-${new Date().toISOString().slice(0, 10)}.pdf`);
  toast("PDF descargado");
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
  fillLimeSelect();
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
      summary: [...r.lines, ...(r.lime ? [r.lime] : [])].map((l) => `${l.sacks} sacos de ${l.name}`).join(", ") || "Sin abono",
      input,
    });
    state.history = state.history.slice(0, 30);
    saveState();
    renderHistory();
    toast("Guardado en el historial");
  });

  $("excelBtn").addEventListener("click", exportExcel);
  $("pdfBtn").addEventListener("click", exportPdf);

  $("cmpBody").addEventListener("click", (e) => {
    const use = e.target.dataset.use;
    if (!use) return;
    const sources = JSON.parse(use);
    for (const key of ["p", "k", "n"]) $("src" + key.toUpperCase()).value = sources[key];
    render();
    document.querySelector(".result").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Fórmula aplicada");
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
