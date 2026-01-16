import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

const DEFAULT_STATION = process.env.STATION_NAME || "Krakow Glowny";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 25000);

app.use(express.static("public"));

const cache = new Map(); // key -> {ts,data}
const keyOf = (mode, station) => `${mode}::${station}`;

app.get("/api/departures", async (req, res) => {
  const station = String(req.query.station || DEFAULT_STATION);
  await handle(req, res, "departures", station);
});

app.get("/api/arrivals", async (req, res) => {
  const station = String(req.query.station || DEFAULT_STATION);
  await handle(req, res, "arrivals", station);
});

async function handle(req, res, mode, station) {
  try {
    const k = keyOf(mode, station);
    const now = Date.now();
    const c = cache.get(k);

    if (c?.data && now - c.ts < CACHE_TTL_MS) {
      return res.json({ source: "cache", station, mode, ...c.data });
    }

    const data = await scrapeBoard(station, mode);
    cache.set(k, { ts: now, data });

    res.json({ source: "live", station, mode, ...data });
  } catch (e) {
    res.status(500).json({
      error: "SCRAPE_FAILED",
      message: String(e?.message || e),
      hint: "Jeśli Portal Pasażera zmienił układ, popraw selektory w scrapeBoard()."
    });
  }
}

app.listen(PORT, () => console.log(`OK: http://localhost:${PORT}`));

async function scrapeBoard(stationName, mode /* departures|arrivals */) {
  const stationUrl = `https://portalpasazera.pl/KatalogStacji?stacja=${encodeURIComponent(stationName)}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.goto(stationUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  const displayHref = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a"));
    const a = anchors.find(x => (x.textContent || "").toLowerCase().includes("wyświetlacz stacyjny"));
    return a ? a.href : null;
  });

  if (!displayHref) {
    await browser.close();
    throw new Error("Nie znalazłem linku „Wyświetlacz stacyjny”.");
  }

  await page.goto(displayHref, { waitUntil: "domcontentloaded", timeout: 60000 });

  // przełącz zakładkę
  await page.evaluate((mode) => {
    const want = mode === "arrivals" ? "przyjazdy" : "odjazdy";
    const btns = Array.from(document.querySelectorAll("a,button"));
    const tab = btns.find(x => (x.textContent || "").trim().toLowerCase() === want);
    if (tab) tab.click();
  }, mode);

  await page.waitForFunction(() => {
    const hasTableRows = document.querySelectorAll("table tbody tr").length > 0;
    const hasTimeLike = !!document.body.innerText.match(/\b([01]\d|2[0-3]):[0-5]\d\b/);
    return hasTableRows || hasTimeLike;
  }, { timeout: 30000 });

  const extracted = await page.evaluate(() => {
    function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }

    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    if (rows.length) {
      const items = rows.map(tr => {
        const tds = Array.from(tr.querySelectorAll("td")).map(td => norm(td.textContent));
        return { cols: tds };
      });
      return { mode: "table", items };
    }

    // fallback tekstowy
    const text = document.body.innerText;
    const lines = text.split("\n").map(norm).filter(Boolean);
    const timeRe = /\b([01]\d|2[0-3]):[0-5]\d\b/;

    const items = [];
    for (let i = 0; i < lines.length; i++) {
      if (timeRe.test(lines[i])) {
        const chunk = [lines[i], lines[i + 1], lines[i + 2], lines[i + 3]].filter(Boolean);
        items.push({ raw: chunk.join(" | ") });
      }
    }
    return { mode: "text", items: items.slice(0, 60) };
  });

  await browser.close();

  const normalized = (extracted.items || []).map((it) => {
    if (it.cols) {
      const c = it.cols;
      return {
        time: c[0] || "",
        destination: c[1] || "",
        train: c[2] || "",
        platform: c.find(x => /peron|tor|\b\d+\b/i.test(x)) || "",
        status: c.slice(3).join(" • ")
      };
    }
    return { time: "", destination: "", train: "", platform: "", status: it.raw || "" };
  });

  return {
    fetchedAt: new Date().toISOString(),
    items: normalized.slice(0, 60)
  };
}
