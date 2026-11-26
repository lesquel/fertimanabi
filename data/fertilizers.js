// Traditional fertilizers sold in Manabí agro-stores.
// n, p, k = % N, % P2O5, % K2O. price = USD per 50 kg sack (reference values, editable in the app).
// soluble = dissolves fully in water, so it can go through drip irrigation (fertigation).
const FERTILIZERS = [
  { id: "urea", name: "Urea", n: 46, p: 0, k: 0, price: 32, soluble: true },
  { id: "nitrato-amonio", name: "Nitrato de amonio", n: 34, p: 0, k: 0, price: 34, soluble: true },
  { id: "sulfato-amonio", name: "Sulfato de amonio", n: 21, p: 0, k: 0, price: 22, soluble: true },
  { id: "nitrato-calcio", name: "Nitrato de calcio", n: 15.5, p: 0, k: 0, price: 38, soluble: true },
  { id: "nitrato-sodio", name: "Nitrato de sodio", n: 16, p: 0, k: 0, price: 33, soluble: true },
  { id: "nitrato-potasio", name: "Nitrato de potasio", n: 13, p: 0, k: 46, price: 58, soluble: true },
  { id: "dap", name: "Fosfato diamónico (DAP)", n: 18, p: 46, k: 0, price: 42, soluble: true },
  { id: "map", name: "Fosfato monoamónico (MAP)", n: 11, p: 52, k: 0, price: 46, soluble: true },
  { id: "sft", name: "Superfosfato triple", n: 0, p: 46, k: 0, price: 38 },
  { id: "sfs", name: "Superfosfato simple", n: 0, p: 20, k: 0, price: 24 },
  { id: "roca-fosforica", name: "Roca fosfórica", n: 0, p: 30, k: 0, price: 18 },
  { id: "kcl", name: "Muriato de potasio (KCl)", n: 0, p: 0, k: 60, price: 36, soluble: true },
  { id: "sop", name: "Sulfato de potasio", n: 0, p: 0, k: 50, price: 50, soluble: true },
  { id: "sulpomag", name: "Sulpomag", n: 0, p: 0, k: 22, price: 30 },
  { id: "f-10-30-10", name: "Completo 10-30-10", n: 10, p: 30, k: 10, price: 40 },
  { id: "f-15-15-15", name: "Completo 15-15-15", n: 15, p: 15, k: 15, price: 38 },
  { id: "f-8-20-20", name: "Completo 8-20-20", n: 8, p: 20, k: 20, price: 37 },
  { id: "f-10-20-20", name: "Completo 10-20-20", n: 10, p: 20, k: 20, price: 38 },
  { id: "f-12-24-12", name: "Completo 12-24-12", n: 12, p: 24, k: 12, price: 39 },
  { id: "f-17-17-17", name: "Completo 17-17-17", n: 17, p: 17, k: 17, price: 41 },
  { id: "f-18-18-18", name: "Completo 18-18-18", n: 18, p: 18, k: 18, price: 43 },
  { id: "f-20-20-20", name: "Soluble 20-20-20", n: 20, p: 20, k: 20, price: 65, soluble: true },
  { id: "f-16-20-0", name: "Fórmula 16-20-0", n: 16, p: 20, k: 0, price: 35 },
  { id: "f-15-3-31", name: "Bananero 15-3-31", n: 15, p: 3, k: 31, price: 42 },
  { id: "gallinaza", name: "Gallinaza (orgánico)", n: 3, p: 2.5, k: 2, price: 5 },
];

// Liming materials. prnt = effective neutralizing power relative to pure CaCO3 (%).
// price = USD per 50 kg sack (reference values).
const LIMES = [
  { id: "caco3", name: "Carbonato de calcio (cal agrícola)", prnt: 90, price: 6 },
  { id: "dolomita", name: "Cal dolomita", prnt: 95, price: 7 },
  { id: "cal-apagada", name: "Cal apagada (hidróxido de calcio)", prnt: 130, price: 10 },
  { id: "cal-viva", name: "Cal viva (óxido de calcio)", prnt: 170, price: 13 },
];
