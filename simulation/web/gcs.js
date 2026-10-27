/* AgriDrone web Ground Control Station
 *
 * LIVE mode    : connected to simulation/server.py over WebSocket. The real
 *                onboard mission code + YOLO11 model run on the server.
 * HARDWARE     : same page, events come from the real aircraft (/ws/drone).
 * OFFLINE mode : no server reachable (e.g. index.html opened directly).
 *                Replays data/demo_recording.js, a mission recorded from the
 *                real simulator, so the demo always works.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const mapCanvas = $("map");
  const ctx = mapCanvas.getContext("2d");
  const camCanvas = $("cam");
  const cctx = camCanvas.getContext("2d");

  // ================================================================ state
  let S;
  function freshState(keepPlan) {
    S = {
      plan: keepPlan && S ? S.plan : null,
      tel: null,
      disp: null,                // smoothed drone position for drawing
      trail: [],
      items: new Map(),          // weed/crop id -> item
      effects: [],
      scanned: new Set(),
      wpDone: -1,
      state: "IDLE",
      running: false,
      paused: false,
      lastDet: null,
      herbicide: 0,
      summary: null,
    };
  }
  freshState(false);

  let source = "connecting";     // live | hardware | offline
  let inSnapshot = false;        // replaying server history on (re)connect
  let ws = null;
  const images = new Map();

  const OFFLINE_PREFIX = "../../";   // simulation/web -> project root
  function resolveUrl(url) {
    if (!url) return null;
    return source === "offline" ? OFFLINE_PREFIX + url.replace(/^\//, "") : url;
  }
  function getImage(url) {
    const u = resolveUrl(url);
    if (!u) return null;
    if (!images.has(u)) {
      const img = new Image();
      img.src = u;
      images.set(u, img);
    }
    return images.get(u);
  }

  // ================================================================ events
  function handle(ev) {
    switch (ev.type) {
      case "hello":
        inSnapshot = true;
        setSource(ev.source === "sim-server" ? "live" : source);
        S.running = !!ev.running;
        break;
      case "snapshot_end":
        inSnapshot = false;
        break;
      case "link":
        if (ev.source === "hardware") setSource(ev.connected ? "hardware" : "live");
        break;
      case "mission":
        if (ev.state === "started") {
          freshState(false);
          S.running = true;
          clearLog();
          $("summary").classList.add("hidden");
        } else if (ev.state === "finished") {
          S.running = false;
          S.summary = ev.summary;
          if (!inSnapshot) showSummary(ev.summary);   // only for missions that end live
        }
        break;
      case "plan":
        S.plan = ev;
        if (ev.world) ev.world.tiles.forEach((t) => getImage(t.url));
        break;
      case "state":
        S.state = ev.state;
        break;
      case "telemetry":
        S.tel = ev;
        if (!S.disp) S.disp = { x: ev.x, y: ev.y, alt: ev.alt };
        if (ev.armed) {
          const last = S.trail[S.trail.length - 1];
          if (!last || Math.hypot(last[0] - ev.x, last[1] - ev.y) > 0.15) S.trail.push([ev.x, ev.y]);
        }
        S.state = ev.state || S.state;
        break;
      case "detections":
        S.lastDet = ev;
        S.wpDone = ev.wp;
        if (ev.tile !== null && ev.tile !== undefined) S.scanned.add(ev.tile);
        for (const b of ev.boxes) {
          const prev = S.items.get(b.id);
          S.items.set(b.id, {
            id: b.id, cls: b.class_name, conf: b.confidence, x: b.gx, y: b.gy,
            lat: b.lat, lon: b.lon, size: b.size_m, sprayed: prev ? prev.sprayed : false,
            born: performance.now(),
          });
        }
        drawCamera(ev);
        break;
      case "spray":
        S.herbicide += ev.ml || 0;
        for (const id of ev.weed_ids) {
          const it = S.items.get(id);
          if (it) it.sprayed = true;
        }
        S.effects.push({ x: ev.x, y: ev.y, t0: performance.now() });
        break;
      case "log":
        addLog(ev);
        break;
    }
  }

  // ================================================================ link
  function setSource(s) {
    source = s;
    const b = $("linkBadge");
    b.className = "badge " + ({ live: "live", hardware: "hw", offline: "offline" }[s] || "");
    b.textContent = { live: "● LIVE AI · SIM SERVER", hardware: "● HARDWARE LINK", offline: "● OFFLINE REPLAY", connecting: "CONNECTING…" }[s];
    $("modeNote").innerHTML = {
      live: "Connected to <code>simulation/server.py</code>: the real onboard mission code and the YOLO11 model are running live.",
      hardware: "Receiving telemetry from the real aircraft over <code>/ws/drone</code>. Commands are issued from the RC / Pixhawk.",
      offline: "No server found, so this is replaying a recorded simulator mission. Run <code>python simulation/server.py</code> for live AI.",
    }[s] || "";
    const offline = s === "offline";
    $("strategy").disabled = offline;
    $("conf").disabled = offline;
    $("spray").disabled = offline;
  }

  function connect() {
    if (location.protocol === "file:") return goOffline();
    let opened = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    } catch (e) {
      return goOffline();
    }
    const timer = setTimeout(() => { if (!opened) { ws.close(); goOffline(); } }, 2500);
    ws.onopen = () => { opened = true; clearTimeout(timer); };
    ws.onmessage = (m) => handle(JSON.parse(m.data));
    ws.onclose = () => {
      clearTimeout(timer);
      if (!opened) return goOffline();
      if (source === "offline") return;
      addLog({ level: "warn", msg: "Server connection lost - reconnecting…", t: S.tel ? S.tel.t : 0 });
      setTimeout(connect, 2000);
    };
  }

  // ================================================================ offline replay
  const R = { events: [], i: 0, t: 0, playing: false, lastT: 0 };
  function goOffline() {
    if (source === "offline") return;
    setSource("offline");
    const s = document.createElement("script");
    s.src = "data/demo_recording.js";
    s.onload = () => {
      R.events = (window.DEMO_RECORDING && window.DEMO_RECORDING.events) || [];
      const p = R.events.find((e) => e.type === "plan");
      if (p) handle(p);
      addLog({ level: "info", msg: `Loaded recorded mission (${R.events.length} events). Press Start.`, t: 0 });
    };
    s.onerror = () => addLog({ level: "error", msg: "data/demo_recording.js missing - run simulation/record_demo.py", t: 0 });
    document.body.appendChild(s);
  }
  function replayStart() {
    R.i = 0; R.t = 0; R.lastT = 0; R.playing = true;
    freshState(false);
    clearLog();
    $("summary").classList.add("hidden");
  }
  function replayTick(dt) {
    if (!R.playing) return;
    R.t += dt * speedValue();
    while (R.i < R.events.length) {
      const ev = R.events[R.i];
      const t = ev.t !== undefined ? ev.t : R.lastT;
      if (t > R.t) break;
      R.lastT = t;
      handle(ev);
      R.i++;
    }
    if (R.i >= R.events.length) { R.playing = false; S.running = false; }
    else S.running = true;
  }

  // ================================================================ controls
  const speedValue = () => Number($("speed").value);
  async function api(path, body) {
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      const j = await r.json();
      if (!j.ok) addLog({ level: "warn", msg: j.error || "Command rejected", t: S.tel ? S.tel.t : 0 });
    } catch (e) {
      addLog({ level: "error", msg: "Command failed: " + e, t: 0 });
    }
  }

  $("btnStart").onclick = () => {
    $("summary").classList.add("hidden");
    if (source === "offline") return replayStart();
    if (source === "hardware") return addLog({ level: "warn", msg: "Hardware missions are started on the aircraft (safety pilot).", t: 0 });
    api("/api/mission/start", {
      strategy: $("strategy").value,
      confidence: Number($("conf").value),
      speedup: speedValue(),
    });
  };
  $("btnPause").onclick = () => {
    if (source === "offline") { R.playing = !R.playing; S.paused = !R.playing; return; }
    S.paused = !S.paused;
    api(S.paused ? "/api/mission/pause" : "/api/mission/resume");
  };
  $("btnAbort").onclick = () => {
    if (source === "offline") {
      R.playing = false; S.running = false;
      return addLog({ level: "warn", msg: "Replay stopped", t: R.t });
    }
    api("/api/mission/abort");
  };
  $("speed").oninput = () => {
    $("speedVal").textContent = speedValue() + "×";
    if (source === "live") api("/api/speedup", { value: speedValue() });
  };
  $("conf").oninput = () => { $("confVal").textContent = Number($("conf").value).toFixed(2); };
  $("spray").onchange = () => { if (source === "live") api("/api/spray", { enabled: $("spray").checked }); };
  $("btnGeo").onclick = $("sumGeo").onclick = () => download("weed_map.geojson", JSON.stringify(geojson(), null, 1), "application/geo+json");
  $("btnCsv").onclick = $("sumCsv").onclick = () => download("weed_map.csv", csv(), "text/csv");
  $("sumClose").onclick = () => $("summary").classList.add("hidden");

  document.querySelectorAll(".tab").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
      $("tab-mission").classList.toggle("hidden", b.dataset.tab !== "mission");
      $("tab-hardware").classList.toggle("hidden", b.dataset.tab !== "hardware");
      resize();
    };
  });

  // ================================================================ exports
  function geojson() {
    return {
      type: "FeatureCollection",
      features: [...S.items.values()].map((it) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [it.lon, it.lat] },
        properties: { id: it.id, class: it.cls, confidence: it.conf, sprayed: it.sprayed,
          "marker-color": it.cls === "weed" ? "#d32f2f" : "#2e7d32" },
      })),
    };
  }
  function csv() {
    const rows = [["id", "class", "confidence", "lat", "lon", "east_m", "north_m", "sprayed"]];
    for (const it of S.items.values()) rows.push([it.id, it.cls, it.conf, it.lat, it.lon, it.x, it.y, it.sprayed ? 1 : 0]);
    return rows.map((r) => r.join(",")).join("\n");
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ================================================================ log
  function clearLog() { $("log").innerHTML = ""; }
  function addLog(ev) {
    const li = document.createElement("li");
    li.className = ev.level || "info";
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = fmtTime(ev.t || 0);
    li.append(t, document.createTextNode(ev.msg));
    const log = $("log");
    log.appendChild(li);
    while (log.children.length > 300) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // ================================================================ map view
  let view = { scale: 10, ox: 0, oy: 0, minx: 0, maxy: 0 };
  let dpr = 1;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = mapCanvas.getBoundingClientRect();
    mapCanvas.width = Math.max(1, r.width * dpr);
    mapCanvas.height = Math.max(1, r.height * dpr);
  }
  window.addEventListener("resize", resize);

  function computeView() {
    const W = mapCanvas.width / dpr, H = mapCanvas.height / dpr;
    const pts = S.plan ? S.plan.field.concat([[0, 0]]) : [[0, 0], [40, 30]];
    const m = 4;
    const minx = Math.min(...pts.map((p) => p[0])) - m, maxx = Math.max(...pts.map((p) => p[0])) + m;
    const miny = Math.min(...pts.map((p) => p[1])) - m, maxy = Math.max(...pts.map((p) => p[1])) + m;
    const pad = 30, top = 56;
    const scale = Math.min((W - 2 * pad) / (maxx - minx), (H - top - pad) / (maxy - miny));
    const ox = (W - (maxx - minx) * scale) / 2;
    const oy = top + (H - top - pad - (maxy - miny) * scale) / 2;
    view = { scale, ox, oy, minx, maxy };
  }
  const sx = (x) => view.ox + (x - view.minx) * view.scale;
  const sy = (y) => view.oy + (view.maxy - y) * view.scale;
  const wx = (px) => (px - view.ox) / view.scale + view.minx;
  const wy = (py) => view.maxy - (py - view.oy) / view.scale;

  function drawMap(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = mapCanvas.width / dpr, H = mapCanvas.height / dpr;
    ctx.fillStyle = "#0d151c";
    ctx.fillRect(0, 0, W, H);
    computeView();
    drawGrid(W, H);
    const P = S.plan;
    if (!P) {
      ctx.fillStyle = "#8296aa";
      ctx.font = "14px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for mission plan…", W / 2, H / 2);
      return;
    }
    const sc = view.scale;

    // field imagery / boundary
    if (P.world) {
      for (const t of P.world.tiles) {
        const img = getImage(t.url);
        const x = sx(t.x0), y = sy(t.y1), w = (t.x1 - t.x0) * sc, h = (t.y1 - t.y0) * sc;
        if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h);
        else { ctx.fillStyle = "#3a3222"; ctx.fillRect(x, y, w, h); }
        if (!S.scanned.has(t.id)) { ctx.fillStyle = "rgba(8,13,18,0.58)"; ctx.fillRect(x, y, w, h); }
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    } else {
      ctx.fillStyle = "#1f3a26";
      polyPath(P.field); ctx.fill();
    }
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#ffb547";
    ctx.lineWidth = 2;
    polyPath(P.field); ctx.stroke();

    // planned path
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(0));
    for (const [x, y] of P.waypoints) ctx.lineTo(sx(x), sy(y));
    ctx.lineTo(sx(0), sy(0));
    ctx.stroke();
    ctx.setLineDash([]);
    // flown trail
    if (S.trail.length > 1) {
      ctx.strokeStyle = "rgba(53,194,255,0.7)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      S.trail.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
      if (S.disp) ctx.lineTo(sx(S.disp.x), sy(S.disp.y));
      ctx.stroke();
    }

    P.waypoints.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(sx(x), sy(y), 7, 0, 7);
      ctx.fillStyle = i <= S.wpDone ? "#35c2ff" : "rgba(13,21,28,0.85)";
      ctx.fill();
      ctx.strokeStyle = "#35c2ff"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = i <= S.wpDone ? "#03202e" : "#cfe9f7";
      ctx.font = "bold 9px Segoe UI, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(i + 1, sx(x), sy(y) + 0.5);
    });

    // detections
    for (const it of S.items.values()) {
      const x = sx(it.x), y = sy(it.y);
      const age = Math.min(1, (now - it.born) / 400);
      if (it.cls !== "weed") {          // crop or panicle
        const r = Math.max(5, (it.size * sc) / 2);
        ctx.strokeStyle = "#4cd07d"; ctx.lineWidth = 2;
        ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
      } else {
        const r = Math.max(3.2, (it.size * sc) / 2) * (0.5 + 0.5 * age) + (1 - age) * 8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 7);
        ctx.fillStyle = it.sprayed ? "#b07cff" : "#ff5a5a";
        ctx.globalAlpha = 0.95;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = it.sprayed ? 2.2 : 1;
        ctx.strokeStyle = it.sprayed ? "#5b8cff" : "#2a0505";
        ctx.stroke();
      }
    }

    // spray effects
    S.effects = S.effects.filter((e) => now - e.t0 < 1400);
    for (const e of S.effects) {
      const k = (now - e.t0) / 1400;
      ctx.beginPath();
      ctx.arc(sx(e.x), sy(e.y), 4 + k * 1.2 * sc, 0, 7);
      ctx.strokeStyle = `rgba(91,140,255,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = `rgba(91,140,255,${0.25 * (1 - k)})`;
      ctx.fill();
    }

    // home
    ctx.fillStyle = "#ffb547";
    ctx.beginPath(); ctx.arc(sx(0), sy(0), 11, 0, 7); ctx.fill();
    ctx.fillStyle = "#1c1406";
    ctx.font = "bold 12px Segoe UI, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("H", sx(0), sy(0) + 0.5);

    drawDrone(now);
    drawScale(H);
    drawCompass(W);
  }

  function polyPath(poly) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
    ctx.closePath();
  }

  function drawGrid(W, H) {
    ctx.strokeStyle = "rgba(130,150,170,0.07)";
    ctx.lineWidth = 1;
    const step = 5 * view.scale;
    if (step < 8) return;
    for (let x = sx(Math.ceil(view.minx / 5) * 5); x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = sy(Math.floor(view.maxy / 5) * 5); y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  function drawDrone(now) {
    if (!S.disp || !S.tel) return;
    const P = S.plan;
    const d = S.disp;
    const x = sx(d.x), y = sy(d.y);
    // camera footprint scales with altitude
    if (d.alt > 0.5 && P.footprint) {
      const k = P.footprint[0] / P.altitude;
      const fw = d.alt * k * view.scale, fh = d.alt * (P.footprint[1] / P.altitude) * view.scale;
      ctx.fillStyle = "rgba(53,194,255,0.08)";
      ctx.fillRect(x - fw / 2, y - fh / 2, fw, fh);
      ctx.strokeStyle = "rgba(53,194,255,0.75)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x - fw / 2, y - fh / 2, fw, fh);
    }
    const size = 13 + d.alt * 0.7;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x + d.alt * 0.9, y + d.alt * 0.9, size, size * 0.8, 0, 0, 7); ctx.fill();
    // spray mist
    if (S.tel.spraying) {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * 6.28, r = Math.random() * size * 1.4;
        ctx.fillStyle = "rgba(120,170,255,0.55)";
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.6, 0, 7); ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((S.tel.heading || 0) * Math.PI) / 180);
    ctx.strokeStyle = "#e8f4ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-size * 0.7, -size * 0.7); ctx.lineTo(size * 0.7, size * 0.7);
    ctx.moveTo(size * 0.7, -size * 0.7); ctx.lineTo(-size * 0.7, size * 0.7);
    ctx.stroke();
    const spin = S.tel.armed ? now / 40 : 0;
    for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.arc(px * size * 0.7, py * size * 0.7, size * 0.42, 0, 7);
      ctx.fillStyle = "rgba(53,194,255,0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(53,194,255,0.9)"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.save();
      ctx.translate(px * size * 0.7, py * size * 0.7);
      ctx.rotate(spin * (px * py));
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath(); ctx.moveTo(-size * 0.38, 0); ctx.lineTo(size * 0.38, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#35c2ff";
    ctx.fillRect(-size * 0.28, -size * 0.28, size * 0.56, size * 0.56);
    ctx.fillStyle = "#ff5a5a";              // front marker
    ctx.beginPath(); ctx.arc(0, -size * 0.28, 2.5, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawScale(H) {
    const len = 10 * view.scale;
    const x = 16, y = H - 22;
    ctx.strokeStyle = "#dbe7f3"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5); ctx.stroke();
    ctx.fillStyle = "#dbe7f3"; ctx.font = "11px Segoe UI, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("10 m", x + len / 2, y - 6);
  }
  function drawCompass(W) {
    const x = W - 30, y = 80;
    ctx.fillStyle = "rgba(11,17,23,0.8)";
    ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.fill();
    ctx.fillStyle = "#ff5a5a";
    ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x + 5, y); ctx.lineTo(x - 5, y); ctx.fill();
    ctx.fillStyle = "#dbe7f3";
    ctx.beginPath(); ctx.moveTo(x, y + 13); ctx.lineTo(x + 5, y); ctx.lineTo(x - 5, y); ctx.fill();
    ctx.font = "bold 10px Segoe UI"; ctx.textAlign = "center"; ctx.fillText("N", x, y - 20);
  }

  // hover readout
  mapCanvas.addEventListener("mousemove", (e) => {
    if (!S.plan) return;
    const r = mapCanvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const x = wx(px), y = wy(py);
    const lat0 = S.plan.home.lat, lon0 = S.plan.home.lon;
    const lat = lat0 + (y / 6378137) * (180 / Math.PI);
    const lon = lon0 + (x / (6378137 * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI);
    let near = null, best = 0.6;
    for (const it of S.items.values()) {
      const d = Math.hypot(it.x - x, it.y - y);
      if (d < best) { best = d; near = it; }
    }
    const h = $("hover");
    h.classList.remove("hidden");
    h.style.left = Math.min(px + 14, r.width - 220) + "px";
    h.style.top = py + 14 + "px";
    h.innerHTML = `E ${x.toFixed(1)} m · N ${y.toFixed(1)} m<br>${lat.toFixed(7)}, ${lon.toFixed(7)}` +
      (near ? `<br><b>${near.cls} #${near.id}</b> · conf ${near.conf.toFixed(2)} · ${near.sprayed ? "sprayed ✓" : "not sprayed"}` : "");
  });
  mapCanvas.addEventListener("mouseleave", () => $("hover").classList.add("hidden"));

  // ================================================================ camera panel
  function drawCamera(ev) {
    const img = getImage(ev.image_url);
    const paint = () => {
      const w = camCanvas.width;
      const h = Math.round((w * ev.img_h) / ev.img_w);
      if (camCanvas.height !== h) camCanvas.height = h;
      if (img && img.naturalWidth) cctx.drawImage(img, 0, 0, w, h);
      else { cctx.fillStyle = "#222"; cctx.fillRect(0, 0, w, h); }
      const k = w / ev.img_w;
      cctx.font = "bold 10px Segoe UI, sans-serif";
      for (const b of ev.boxes) {
        const color = b.class_name === "weed" ? "#ff4d4d" : "#4cd07d";
        cctx.strokeStyle = color; cctx.lineWidth = 2;
        cctx.strokeRect(b.x1 * k, b.y1 * k, (b.x2 - b.x1) * k, (b.y2 - b.y1) * k);
        const label = `${b.class_name} ${b.confidence.toFixed(2)}`;
        const tw = cctx.measureText(label).width + 6;
        cctx.fillStyle = color;
        cctx.fillRect(b.x1 * k, Math.max(0, b.y1 * k - 13), tw, 13);
        cctx.fillStyle = "#08100a";
        cctx.fillText(label, b.x1 * k + 3, Math.max(10, b.y1 * k - 3));
      }
      cctx.fillStyle = "rgba(0,0,0,0.6)";
      cctx.fillRect(0, h - 18, w, 18);
      cctx.fillStyle = "#fff";
      cctx.fillText(`REC  WP ${ev.wp + 1}  ALT ${ev.alt.toFixed(1)} m  ${S.tel ? S.tel.lat.toFixed(6) + ", " + S.tel.lon.toFixed(6) : ""}`, 6, h - 5);
    };
    if (img && !img.complete) img.onload = paint;
    paint();
    $("camInfo").textContent = `Photo ${ev.wp + 1}: ${ev.n_weed} weeds, ${ev.n_crop} crops · YOLO11 inference ${ev.inference_ms.toFixed(0)} ms`;
  }

  // ================================================================ panels
  function updatePanels() {
    const t = S.tel;
    $("stateBadge").textContent = S.paused ? "PAUSED" : S.state;
    const set = (id, v) => { $(id).textContent = v; };
    if (t) {
      set("tMode", t.mode); set("tArmed", t.armed ? "ARMED" : "DISARMED");
      $("tArmed").style.color = t.armed ? "#ff5a5a" : "";
      set("tAlt", t.alt.toFixed(1) + " m"); set("tSpd", t.speed.toFixed(1) + " m/s");
      set("tLat", t.lat.toFixed(7)); set("tLon", t.lon.toFixed(7));
      set("tGps", `${t.gps_fix >= 3 ? "3D fix" : "no fix"} · ${t.sats} sats`);
      set("tWp", `${Math.min(t.wp + 1, t.wp_total)} / ${t.wp_total}`);
      set("tTime", fmtTime(t.t)); set("tVolt", t.voltage.toFixed(1) + " V");
      $("batBar").style.width = t.battery + "%";
      $("batBar").style.background = t.battery > 50 ? "#4cd07d" : t.battery > 25 ? "#ffb547" : "#ff5a5a";
      set("batTxt", t.battery.toFixed(0) + "%");
      $("tankBar").style.width = t.tank + "%";
      set("tankTxt", t.tank.toFixed(0) + "%");
    }
    const items = [...S.items.values()];
    const weeds = items.filter((i) => i.cls === "weed");
    set("sWeeds", weeds.length);
    set("sCrops", items.length - weeds.length);
    set("sSprayed", weeds.filter((w) => w.sprayed).length);
    const total = S.plan ? S.plan.waypoints.length : 0;
    set("sCover", total ? Math.round((100 * (S.wpDone + 1)) / total) + "%" : "0%");
    set("sMl", S.herbicide.toFixed(0) + " ml");
    const blanket = S.plan && S.plan.blanket_ml;
    set("sSave", blanket && S.wpDone >= 0 ? (100 * (1 - S.herbicide / (blanket * (S.wpDone + 1) / total))).toFixed(0) + "%" : "—");

    $("hud").innerHTML = S.plan
      ? `Field <b>${S.plan.area_m2 || "?"} m²</b> · ${total} photo points · path <b>${S.plan.path_length_m} m</b><br>` +
        `Survey alt <b>${S.plan.altitude} m</b> · spray alt <b>${S.plan.spray_altitude} m</b> · footprint <b>${S.plan.footprint[0]}×${S.plan.footprint[1]} m</b>`
      : "";

    const running = S.running;
    $("btnStart").disabled = running || source === "connecting";
    $("btnPause").disabled = !running;
    $("btnAbort").disabled = !running;
    $("btnPause").innerHTML = S.paused ? "&#9654; Resume" : "&#10073;&#10073; Pause";
  }

  function showSummary(s) {
    $("sumTitle").textContent = s.outcome === "complete" ? "Mission complete ✓" : `Mission ended: ${s.outcome}`;
    const cards = [
      [fmtTime(s.flight_time_s), "flight time"], [s.distance_m + " m", "distance flown"],
      [s.photos, "photos analysed"], [s.weeds, "weeds found"], [s.crops, "crop plants"],
      [s.weeds_sprayed, "weeds sprayed"], [s.herbicide_ml + " ml", "herbicide used"],
      [(s.blanket_ml / 1000).toFixed(1) + " L", "blanket spraying would use"],
      [s.savings_pct + "%", "chemical saved"], [s.avg_inference_ms + " ms", "avg AI inference"],
      [s.spray_shots, "spray shots"], [s.area_m2 + " m²", "area surveyed"],
    ];
    $("sumBody").innerHTML = cards.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
    $("summary").classList.remove("hidden");
  }

  // ================================================================ loop
  let lastFrame = performance.now(), lastPanel = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (source === "offline") replayTick(dt);
    if (S.tel && S.disp) {
      const k = Math.min(1, dt * 9);
      S.disp.x += (S.tel.x - S.disp.x) * k;
      S.disp.y += (S.tel.y - S.disp.y) * k;
      S.disp.alt += (S.tel.alt - S.disp.alt) * k;
    }
    if (!$("tab-mission").classList.contains("hidden")) drawMap(now);
    if (now - lastPanel > 120) { updatePanels(); lastPanel = now; }
    requestAnimationFrame(frame);
  }

  resize();
  setSource("connecting");
  connect();
  requestAnimationFrame(frame);
})();
