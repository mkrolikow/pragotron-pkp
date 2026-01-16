// ===== DOM =====
const gridEl = document.getElementById("grid");
const clockEl = document.getElementById("clock");
const metaEl = document.getElementById("meta");
const stationEl = document.getElementById("station");
const modeLabelEl = document.getElementById("modeLabel");
const filterLabelEl = document.getElementById("filterLabel");

const panel = document.getElementById("panel");
const btnClose = document.getElementById("btnClose");
const btnApply = document.getElementById("btnApply");

const optStation = document.getElementById("optStation");
const optMode = document.getElementById("optMode");
const optFilter = document.getElementById("optFilter");
const optRows = document.getElementById("optRows");
const optPage = document.getElementById("optPage");
const optRotateSec = document.getElementById("optRotateSec");
const optRefreshSec = document.getElementById("optRefreshSec");
const optCharMode = document.getElementById("optCharMode");
const optFlipMs = document.getElementById("optFlipMs");
const optStaggerMs = document.getElementById("optStaggerMs");
const optGraceSec = document.getElementById("optGraceSec");
const optSweepAfterDepart = document.getElementById("optSweepAfterDepart");
const optShowBlanks = document.getElementById("optShowBlanks");
const optSound = document.getElementById("optSound");
const optOvershoot = document.getElementById("optOvershoot");
const optOvershootChance = document.getElementById("optOvershootChance");
const optSweepAllOnDepart = document.getElementById("optSweepAllOnDepart");
const optSweepAllOnUpdate = document.getElementById("optSweepAllOnUpdate");
const optSweepSpeedMs = document.getElementById("optSweepSpeedMs");
const optBrightness = document.getElementById("optBrightness");
const optNight = document.getElementById("optNight");
const optKiosk = document.getElementById("optKiosk");

// ===== Alphabet (mechaniczny) =====
const ALPHABET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-./:+()";

// ===== Defaults =====
const DEFAULTS = {
  station: "Krakow Glowny",
  mode: "departures",
  filter: "",
  rows: 10,
  page: 1,
  rotateSec: 8,
  refreshSec: 15,

  charMode: "step", // step|direct
  flipMs: 140,
  staggerMs: 14,
  graceSec: 15,

  sweepAfterDepart: true,
  showBlanks: true,
  sound: false,

  overshoot: true,
  overshootChance: 0.08,
  sweepAllOnDepart: true,
  sweepAllOnUpdate: false,
  sweepSpeedMs: 28,

  brightness: 1.0,
  night: false,
  kiosk: true,

  cols: { time: 5, destination: 22, train: 10, platform: 5, status: 20 }
};

// ===== State =====
let cfg = loadCfgMergeUrl();
let boardCells = [];
let currentItems = [];
let lastRows = null;
let lastHash = "";

let refreshTimer = null;
let rotateTimer = null;
let secondTimer = null;

let audio = null;

// ===== Clock =====
const pad2 = (n) => String(n).padStart(2, "0");
function tickClock(){
  const d = new Date();
  clockEl.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
setInterval(tickClock, 250);
tickClock();

// ===== Utils =====
function clampInt(v, a, b){
  v = Number(v);
  if (Number.isNaN(v)) return a;
  return Math.max(a, Math.min(b, Math.trunc(v)));
}
function normalizeText(s){
  // “PKP strict”: bez polskich znaków – prosta transliteracja
  const t = (s||"").toUpperCase().trim();
  return t
    .replaceAll("Ą","A").replaceAll("Ć","C").replaceAll("Ę","E").replaceAll("Ł","L")
    .replaceAll("Ń","N").replaceAll("Ó","O").replaceAll("Ś","S").replaceAll("Ź","Z").replaceAll("Ż","Z")
    .replace(/\s+/g," ");
}
function padAlign(text, len, align){
  const t = normalizeText(text);
  const cut = t.slice(0, len);
  const space = len - cut.length;
  if (space <= 0) return cut;
  if (align === "right") return " ".repeat(space) + cut;
  if (align === "center") {
    const left = Math.floor(space/2);
    const right = space - left;
    return " ".repeat(left) + cut + " ".repeat(right);
  }
  return cut + " ".repeat(space);
}
function blankRow(cols){
  return Object.fromEntries(Object.entries(cols).map(([k, len]) => [k, " ".repeat(len)]));
}

// ===== Config =====
function loadCfg(){
  try {
    const s = localStorage.getItem("pragotron_pkp_cfg");
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}
function parseUrlParams(){
  const p = new URLSearchParams(location.search);
  const o = {};
  const getN = (k) => p.get(k) != null ? Number(p.get(k)) : null;
  if (p.get("station")) o.station = p.get("station");
  if (p.get("mode")) o.mode = p.get("mode");
  if (p.get("filter")) o.filter = p.get("filter");
  if (getN("rows")!=null) o.rows = getN("rows");
  if (getN("page")!=null) o.page = getN("page");
  if (getN("rotate")!=null) o.rotateSec = getN("rotate");
  if (getN("refresh")!=null) o.refreshSec = getN("refresh");
  if (p.get("char")) o.charMode = p.get("char");
  if (getN("flip")!=null) o.flipMs = getN("flip");
  if (getN("stagger")!=null) o.staggerMs = getN("stagger");
  if (getN("grace")!=null) o.graceSec = getN("grace");
  if (p.get("sweep")) o.sweepAfterDepart = p.get("sweep")==="1";
  if (p.get("blanks")) o.showBlanks = p.get("blanks")!=="0";
  if (p.get("sound")) o.sound = p.get("sound")==="1";
  if (p.get("overshoot")) o.overshoot = p.get("overshoot")==="1";
  if (p.get("overshootChance")) o.overshootChance = Number(p.get("overshootChance"));
  if (p.get("sweepAllDepart")) o.sweepAllOnDepart = p.get("sweepAllDepart")==="1";
  if (p.get("sweepAllUpdate")) o.sweepAllOnUpdate = p.get("sweepAllUpdate")==="1";
  if (p.get("sweepSpeed")) o.sweepSpeedMs = Number(p.get("sweepSpeed"));
  if (p.get("brightness")) o.brightness = Number(p.get("brightness"));
  if (p.get("night")) o.night = p.get("night")==="1";
  if (p.get("kiosk")) o.kiosk = p.get("kiosk")!=="0";
  return o;
}
function loadCfgMergeUrl(){
  const merged = { ...DEFAULTS, ...loadCfg(), ...parseUrlParams() };
  merged.rows = clampInt(merged.rows, 5, 20);
  merged.page = clampInt(merged.page, 1, 999);
  merged.rotateSec = clampInt(merged.rotateSec, 0, 60);
  merged.refreshSec = clampInt(merged.refreshSec, 5, 300);
  merged.flipMs = clampInt(merged.flipMs, 60, 350);
  merged.staggerMs = clampInt(merged.staggerMs, 0, 60);
  merged.graceSec = clampInt(merged.graceSec, 0, 120);
  merged.sweepSpeedMs = clampInt(merged.sweepSpeedMs, 5, 80);
  merged.brightness = Math.max(0.6, Math.min(1.2, Number(merged.brightness || 1.0)));
  merged.mode = merged.mode === "arrivals" ? "arrivals" : "departures";
  merged.charMode = merged.charMode === "direct" ? "direct" : "step";
  merged.overshootChance = Math.max(0, Math.min(1, Number(merged.overshootChance ?? 0.08)));
  return merged;
}
function saveCfg(){
  localStorage.setItem("pragotron_pkp_cfg", JSON.stringify(cfg));
}
function applyBrightness(){
  document.documentElement.style.setProperty("--brightness", String(cfg.brightness || 1));
}
function applyBodyModes(){
  document.body.classList.toggle("night", !!cfg.night);
  document.body.classList.toggle("kiosk", !!cfg.kiosk);
  applyBrightness();
}
function applyCfgToUI(){
  optStation.value = cfg.station;
  optMode.value = cfg.mode;
  optFilter.value = cfg.filter;
  optRows.value = cfg.rows;
  optPage.value = cfg.page;
  optRotateSec.value = cfg.rotateSec;
  optRefreshSec.value = cfg.refreshSec;
  optCharMode.value = cfg.charMode;
  optFlipMs.value = cfg.flipMs;
  optStaggerMs.value = cfg.staggerMs;
  optGraceSec.value = cfg.graceSec;
  optSweepAfterDepart.checked = !!cfg.sweepAfterDepart;
  optShowBlanks.checked = !!cfg.showBlanks;
  optSound.checked = !!cfg.sound;
  optOvershoot.checked = !!cfg.overshoot;
  optOvershootChance.value = cfg.overshootChance;
  optSweepAllOnDepart.checked = !!cfg.sweepAllOnDepart;
  optSweepAllOnUpdate.checked = !!cfg.sweepAllOnUpdate;
  optSweepSpeedMs.value = cfg.sweepSpeedMs;
  optBrightness.value = cfg.brightness;
  optNight.checked = !!cfg.night;
  optKiosk.checked = !!cfg.kiosk;

  modeLabelEl.textContent = cfg.mode === "arrivals" ? "PRZYJAZDY" : "ODJAZDY";
  filterLabelEl.textContent = cfg.filter ? `Filtr: ${cfg.filter}` : "Wszystkie";
}
function applyUIToCfg(){
  cfg.station = (optStation.value || DEFAULTS.station).trim();
  cfg.mode = optMode.value === "arrivals" ? "arrivals" : "departures";
  cfg.filter = (optFilter.value || "").trim();
  cfg.rows = clampInt(Number(optRows.value || DEFAULTS.rows), 5, 20);
  cfg.page = clampInt(Number(optPage.value || 1), 1, 999);
  cfg.rotateSec = clampInt(Number(optRotateSec.value || 0), 0, 60);
  cfg.refreshSec = clampInt(Number(optRefreshSec.value || DEFAULTS.refreshSec), 5, 300);
  cfg.charMode = optCharMode.value === "direct" ? "direct" : "step";
  cfg.flipMs = clampInt(Number(optFlipMs.value || DEFAULTS.flipMs), 60, 350);
  cfg.staggerMs = clampInt(Number(optStaggerMs.value || DEFAULTS.staggerMs), 0, 60);
  cfg.graceSec = clampInt(Number(optGraceSec.value || DEFAULTS.graceSec), 0, 120);
  cfg.sweepAfterDepart = !!optSweepAfterDepart.checked;
  cfg.showBlanks = !!optShowBlanks.checked;
  cfg.sound = !!optSound.checked;
  cfg.overshoot = !!optOvershoot.checked;
  cfg.overshootChance = Math.max(0, Math.min(1, Number(optOvershootChance.value || 0.08)));
  cfg.sweepAllOnDepart = !!optSweepAllOnDepart.checked;
  cfg.sweepAllOnUpdate = !!optSweepAllOnUpdate.checked;
  cfg.sweepSpeedMs = clampInt(Number(optSweepSpeedMs.value || 28), 5, 80);
  cfg.brightness = Math.max(0.6, Math.min(1.2, Number(optBrightness.value || 1.0)));
  cfg.night = !!optNight.checked;
  cfg.kiosk = !!optKiosk.checked;
  saveCfg();
  applyCfgToUI();
  applyBodyModes();
}

// ===== Panel =====
function openPanel(){ panel.classList.add("show"); panel.setAttribute("aria-hidden","false"); }
function closePanel(){ panel.classList.remove("show"); panel.setAttribute("aria-hidden","true"); }
btnClose.onclick = closePanel;
btnApply.onclick = async () => {
  const rebuild = cfg.rows !== Number(optRows.value || cfg.rows);
  applyUIToCfg();
  closePanel();
  if (rebuild){ buildBoard(); lastRows = null; lastHash = ""; }
  restartTimers();
  await refresh(true);
};
panel.addEventListener("click", (e) => { if (e.target === panel) closePanel(); });

// ===== Sound =====
function ensureAudio(){
  if (audio) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio = { ctx };
}
function playClack(){
  if (!cfg.sound) return;
  ensureAudio();
  const { ctx } = audio;

  const o = ctx.createOscillator();
  const g = ctx.createGain();

  o.type = "square";
  o.frequency.value = 220 + Math.random() * 160;
  g.gain.value = 0.0001;

  o.connect(g);
  g.connect(ctx.destination);

  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

  o.start(t);
  o.stop(t + 0.05);
}

// ===== Board build =====
function buildBoard(){
  gridEl.innerHTML = "";

  const frame = document.createElement("div");
  frame.className = "board-frame";

  const rowsWrap = document.createElement("div");
  rowsWrap.className = "rows";

  boardCells = [];

  for (let r=0; r<cfg.rows; r++){
    const rowEl = document.createElement("div");
    rowEl.className = "row";

    const rowCells = { time: [], destination: [], train: [], platform: [], status: [] };

    for (const key of ["time","destination","train","platform","status"]){
      const field = document.createElement("div");
      field.className = "field";
      const len = cfg.cols[key];

      for (let i=0; i<len; i++){
        const flap = document.createElement("div");
        flap.className = "flap blank";

        const top = document.createElement("div"); top.className = "top"; top.textContent = " ";
        const bottom = document.createElement("div"); bottom.className = "bottom"; bottom.textContent = " ";
        const flip = document.createElement("div"); flip.className = "flip"; flip.textContent = " ";

        flap.appendChild(top); flap.appendChild(bottom); flap.appendChild(flip);
        field.appendChild(flap);
        rowCells[key].push(flap);
      }

      rowEl.appendChild(field);
    }

    rowsWrap.appendChild(rowEl);
    boardCells.push(rowCells);
  }

  frame.appendChild(rowsWrap);
  gridEl.appendChild(frame);
}

// ===== Time/depart =====
function parseTimeToTodaySeconds(hhmm){
  const m = (hhmm||"").match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if(Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh*3600 + mm*60;
}
function isDeparted(hhmm){
  const t = parseTimeToTodaySeconds((hhmm||"").trim());
  if(t == null) return false;
  const d = new Date();
  const nowSec = d.getHours()*3600 + d.getMinutes()*60 + d.getSeconds();
  return nowSec > (t + cfg.graceSec);
}

// ===== Filtering + paging =====
function filteredItems(items){
  const q = (cfg.filter || "").toLowerCase();
  if(!q) return items;
  return items.filter(it => (`${it.time} ${it.destination} ${it.train} ${it.platform} ${it.status}`).toLowerCase().includes(q));
}
function pageSlice(items){
  const start = (cfg.page - 1) * cfg.rows;
  return items.slice(start, start + cfg.rows);
}

// ===== Row model =====
function itemToRow(item){
  return {
    time: padAlign(item.time || "", cfg.cols.time, "center"),
    destination: padAlign(item.destination || "", cfg.cols.destination, "left"),
    train: padAlign(item.train || "", cfg.cols.train, "left"),
    platform: padAlign(item.platform || "", cfg.cols.platform, "center"),
    status: padAlign(item.status || "", cfg.cols.status, "left"),
  };
}

// ===== Fingerprint =====
function boardFingerprint(rows){
  return rows.map(r => `${r.time}|${r.destination}|${r.train}|${r.platform}|${r.status}`).join("\n");
}
function hasDepartedBetween(prevRows, nextRows){
  const prev0 = prevRows?.[0]?.time?.trim() || "";
  const next0 = nextRows?.[0]?.time?.trim() || "";
  if(!prev0) return false;
  return prev0 !== next0 && isDeparted(prev0);
}

// ===== Flap helpers =====
function setFlapChar(flapEl, ch){
  const top = flapEl.querySelector(".top");
  const bottom = flapEl.querySelector(".bottom");
  const flip = flapEl.querySelector(".flip");
  const target = (ch === " " ? " " : ch);

  if (cfg.showBlanks) flapEl.classList.toggle("blank", target === " ");
  else flapEl.classList.remove("blank");

  top.textContent = target;
  bottom.textContent = target;
  flip.textContent = target;
}
function idxInAlphabet(ch){
  const u = (ch||" ").toUpperCase();
  const i = ALPHABET.indexOf(u);
  return i >= 0 ? i : 0;
}
function stepChar(current){
  return ALPHABET[(idxInAlphabet(current)+1) % ALPHABET.length];
}
function flipOnceToChar(flapEl, nextChar, delayMs){
  return new Promise((resolve) => {
    const flip = flapEl.querySelector(".flip");
    flip.textContent = nextChar;

    const dur = cfg.flipMs + Math.floor(Math.random()*40);
    setTimeout(() => {
      flapEl.style.setProperty("--dur", `${dur}ms`);
      flapEl.classList.add("flip-run");
      flapEl.classList.add("jitter");
      setTimeout(()=>flapEl.classList.remove("jitter"), 140);

      playClack();

      const done = () => {
        flapEl.classList.remove("flip-run");
        setFlapChar(flapEl, nextChar);
        resolve();
      };
      flapEl.addEventListener("animationend", done, { once:true });
    }, delayMs);
  });
}
async function flipToChar(flapEl, targetChar, delayMs){
  const top = flapEl.querySelector(".top");
  let current = (top.textContent || " ").slice(0,1);
  const target = (targetChar || " ").slice(0,1);

  if(current === target){ setFlapChar(flapEl, target); return; }

  if(cfg.charMode === "direct"){
    await flipOnceToChar(flapEl, target, delayMs);
    return;
  }

  // step mode + overshoot
  let doOvershoot = cfg.overshoot && Math.random() < (cfg.overshootChance || 0);
  let overshootSteps = doOvershoot ? (1 + Math.floor(Math.random()*2)) : 0;
  let reached = false;

  let guard = 0;
  while(guard++ < 140){
    if(current === target){
      if(!reached){
        reached = true;
        if(overshootSteps > 0){
          for(let k=0;k<overshootSteps;k++){
            const next = stepChar(current);
            await flipOnceToChar(flapEl, next, delayMs);
            current = next;
            delayMs = 0;
          }
          // wróć do target
        } else break;
      } else break;
    }
    const next = stepChar(current);
    await flipOnceToChar(flapEl, next, delayMs);
    current = next;
    delayMs = 0;
  }

  // jeśli overshoot, dojedź do celu
  guard = 0;
  while(current !== target && guard++ < 140){
    const next = stepChar(current);
    await flipOnceToChar(flapEl, next, 0);
    current = next;
  }
}
async function flipField(fieldFlaps, text){
  const tasks = [];
  for(let i=0;i<fieldFlaps.length;i++){
    const flap = fieldFlaps[i];
    const ch = (text[i] || " ");
    const delay = i * cfg.staggerMs;
    tasks.push(flipToChar(flap, ch, delay));
  }
  await Promise.all(tasks);
}
async function flipRow(rowCells, rowText){
  await Promise.all([
    flipField(rowCells.time, rowText.time),
    flipField(rowCells.destination, rowText.destination),
    flipField(rowCells.train, rowText.train),
    flipField(rowCells.platform, rowText.platform),
    flipField(rowCells.status, rowText.status),
  ]);
}
async function flipBoard(targetRows){
  const tasks = [];
  for(let r=0;r<cfg.rows;r++){
    tasks.push(flipRow(boardCells[r], targetRows[r] || blankRow(cfg.cols)));
  }
  await Promise.all(tasks);
}

// sweep ALL
async function sweepAll(){
  const all = [];
  for(const row of boardCells){
    for(const key of ["time","destination","train","platform","status"]){
      for(const flap of row[key]) all.push(flap);
    }
  }
  for(let wave=0; wave<2; wave++){
    const tasks = all.map((flap, i) => {
      const top = flap.querySelector(".top");
      const cur = (top.textContent || " ").slice(0,1);
      const next = stepChar(cur);
      return flipOnceToChar(flap, next, i * (cfg.sweepSpeedMs || 28));
    });
    await Promise.all(tasks);
  }
}
async function scrollEffect(nextRows){
  // dolny rząd “na czarno”, potem nowy układ
  await flipRow(boardCells[cfg.rows - 1], blankRow(cfg.cols));
  await flipBoard(nextRows);
}

// ===== API =====
async function fetchBoard(){
  const endpoint = (cfg.mode === "arrivals") ? "/api/arrivals" : "/api/departures";
  const url = `${endpoint}?station=${encodeURIComponent(cfg.station)}`;
  const r = await fetch(url, { cache:"no-store" });
  const j = await r.json();
  if(j.error) throw new Error(j.message || "Błąd API");

  stationEl.textContent = (j.station || cfg.station).toUpperCase();
  metaEl.textContent = `Źródło: ${j.source} • Aktualizacja: ${new Date(j.fetchedAt).toLocaleString("pl-PL")}`;

  return (j.items || []).map(x => ({
    time: (x.time || "").trim(),
    destination: x.destination || "",
    train: x.train || "",
    platform: x.platform || "",
    status: x.status || ""
  }));
}

function computeBoardRows(items){
  const notGone = items.filter(it => !isDeparted(it.time));
  const filtered = filteredItems(notGone);
  const sliced = pageSlice(filtered);

  const rows = [];
  for(let i=0;i<cfg.rows;i++){
    if(i < sliced.length) rows.push(itemToRow(sliced[i]));
    else rows.push(blankRow(cfg.cols));
  }
  return rows;
}

// ===== Main refresh =====
async function refresh(force=false){
  try{
    modeLabelEl.textContent = cfg.mode === "arrivals" ? "PRZYJAZDY" : "ODJAZDY";
    filterLabelEl.textContent = cfg.filter ? `Filtr: ${cfg.filter}` : "Wszystkie";

    const items = await fetchBoard();
    currentItems = items;

    const nextRows = computeBoardRows(items);
    const nextHash = boardFingerprint(nextRows);

    if(!lastRows || force){
      await flipBoard(nextRows);
      lastRows = nextRows;
      lastHash = nextHash;
      return;
    }

    if(nextHash === lastHash) return;

    if(cfg.sweepAllOnUpdate) await sweepAll();

    if(cfg.sweepAfterDepart && hasDepartedBetween(lastRows, nextRows)){
      if(cfg.sweepAllOnDepart) await sweepAll();
      await scrollEffect(nextRows);
    }else{
      await flipBoard(nextRows);
    }

    lastRows = nextRows;
    lastHash = nextHash;
  }catch(e){
    metaEl.textContent = `Błąd: ${String(e?.message||e)}`;
  }
}

// ===== Timers =====
function restartTimers(){
  if(refreshTimer) clearInterval(refreshTimer);
  if(rotateTimer) clearInterval(rotateTimer);
  if(secondTimer) clearInterval(secondTimer);

  refreshTimer = setInterval(() => refresh(false), cfg.refreshSec * 1000);

  if(cfg.rotateSec > 0){
    rotateTimer = setInterval(async () => {
      cfg.page += 1;
      saveCfg();
      applyCfgToUI();

      const nextRows = computeBoardRows(currentItems);
      const nextHash = boardFingerprint(nextRows);
      if(nextHash !== lastHash){
        await flipBoard(nextRows);
        lastRows = nextRows;
        lastHash = nextHash;
      }
    }, cfg.rotateSec * 1000);
  }

  // przewijanie “dokładnie po czasie”
  secondTimer = setInterval(async () => {
    if(!currentItems?.length || !lastRows) return;
    const nextRows = computeBoardRows(currentItems);
    const nextHash = boardFingerprint(nextRows);
    if(nextHash !== lastHash && cfg.sweepAfterDepart && hasDepartedBetween(lastRows, nextRows)){
      if(cfg.sweepAllOnDepart) await sweepAll();
      await scrollEffect(nextRows);
      lastRows = nextRows;
      lastHash = nextHash;
    }
  }, 1000);
}

// ===== Fullscreen + hotkeys =====
async function toggleFullscreen(){
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
}
window.addEventListener("keydown", async (e) => {
  if(panel.classList.contains("show")){
    if(e.key === "Escape") closePanel();
    return;
  }
  const k = e.key.toLowerCase();
  if(k === "o") openPanel();
  else if(k === "d"){ cfg.mode="departures"; saveCfg(); applyCfgToUI(); restartTimers(); await refresh(true); }
  else if(k === "a"){ cfg.mode="arrivals"; saveCfg(); applyCfgToUI(); restartTimers(); await refresh(true); }
  else if(k === "n"){ cfg.night=!cfg.night; saveCfg(); applyCfgToUI(); applyBodyModes(); }
  else if(k === "k"){ cfg.kiosk=!cfg.kiosk; saveCfg(); applyCfgToUI(); applyBodyModes(); }
  else if(k === "s"){ cfg.sound=!cfg.sound; saveCfg(); applyCfgToUI(); }
  else if(e.key === "Enter") await toggleFullscreen();
  else if(e.key === " "){
    e.preventDefault();
    cfg.page += 1; saveCfg(); applyCfgToUI();
    const nextRows = computeBoardRows(currentItems);
    const nextHash = boardFingerprint(nextRows);
    if(nextHash !== lastHash){
      await flipBoard(nextRows);
      lastRows = nextRows; lastHash = nextHash;
    }
  }
});

// ===== Init =====
applyCfgToUI();
applyBodyModes();
buildBoard();

(async () => {
  // start od pustych czarnych klapek
  const blanks = Array.from({ length: cfg.rows }, () => blankRow(cfg.cols));
  await flipBoard(blanks);

  restartTimers();
  await refresh(true);
})();
