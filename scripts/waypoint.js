// ---------- Waypoint + A* (added) ----------
const $ = id => document.getElementById(id);
const btnAdd = $("toggleAdd");
const btnUndo = $("undo");
const btnClear = $("clear");
const btnSolve = $("solve");
const btnDownload = $("download");
const grid = $("grid");
const margin = $("margin"), marginVal = $("marginVal");
const maxSlope = $("maxSlope"), maxSlopeVal = $("maxSlopeVal");
const slopeW = $("slopeW"), slopeWVal = $("slopeWVal");
const statusEl = $("status"), listEl = $("list");

margin.oninput = () => marginVal.textContent = margin.value;
maxSlope.oninput = () => maxSlopeVal.textContent = (+maxSlope.value).toFixed(2);
slopeW.oninput = () => slopeWVal.textContent = (+slopeW.value).toFixed(2);
function status(msg) { statusEl.textContent = msg || ""; }

const waypoints = []; // {lon, lat, entity}
let adding = false;
let dashedEntity = null;
let solvedEntity = null;
let lastSolveResult = null;

btnAdd.onclick = () => {
  stopRotation();
  adding = !adding;
  btnAdd.textContent = adding ? "Adding… (click globe)" : "Add Waypoints";
  btnAdd.classList.toggle("secondary", !adding);
  status(adding ? "Click the globe to add waypoints." : "");
};

btnUndo.onclick = () => {
  const last = waypoints.pop();
  if (last?.entity) viewer.entities.remove(last.entity);
  redrawDashed(); renderList(); status("Undid last waypoint.");
};

btnClear.onclick = () => {
  waypoints.splice(0, waypoints.length);
  if (dashedEntity) { viewer.entities.remove(dashedEntity); dashedEntity = null; }
  if (solvedEntity) { viewer.entities.remove(solvedEntity); solvedEntity = null; }
  viewer.entities.values
    .filter(e => e.__isWP)
    .forEach(e => viewer.entities.remove(e));
  renderList(); status("Cleared.");
};

btnDownload.onclick = () => {
  if (!lastSolveResult) {
    status("⚠ No solved route to download yet.");
    return;
  }

 const jsonText = JSON.stringify({
  ...lastSolveResult,
  waypoints: waypoints.map(p => ({ lon: p.lon, lat: p.lat }))
}, null, 2);
  const blob = new Blob([jsonText], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "solved_route.json";
  a.click();
  URL.revokeObjectURL(a.href);

  status("Downloaded solved route JSON.");
};

function renderList() {
  if (!waypoints.length) { listEl.innerHTML = "<em>No waypoints yet.</em>"; return; }
  listEl.innerHTML = waypoints.map((p, i) => {
    const tag = i === 0 ? "Start" : (i === waypoints.length - 1 ? "End" : `WP${i}`);
    return `<div>${i + 1}. <b>${tag}</b> — lon ${p.lon.toFixed(4)}, lat ${p.lat.toFixed(4)}</div>`;
  }).join("");
}

function redrawDashed() {
  if (dashedEntity) { viewer.entities.remove(dashedEntity); dashedEntity = null; }
  if (waypoints.length < 2) return;
  const degs = waypoints.flatMap(p => [p.lon, p.lat]);
  dashedEntity = viewer.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray(degs),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.RED, dashLength: 12 }),
      clampToGround: false
    }
  });
  try {
    const rect = Cesium.Rectangle.fromDegrees(
      Math.min(...waypoints.map(p => p.lon)), Math.min(...waypoints.map(p => p.lat)),
      Math.max(...waypoints.map(p => p.lon)), Math.max(...waypoints.map(p => p.lat))
    );
    viewer.camera.flyTo({ destination: rect, duration: 0.6 });
  } catch (_) { }
}

// ---------- High-resolution text billboard helper ----------
function makeTextBillboard(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const font = "700 16px Inter, sans-serif";
  ctx.font = font;
  const metrics = ctx.measureText(text);
  canvas.width = metrics.width + 16;
  canvas.height = 28;

  // reapply font after width/height reset
  ctx.font = font;
  ctx.textBaseline = "middle";

  // background rectangle (dark panel color)
  ctx.fillStyle = "#181d30";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // text fill
  ctx.fillStyle = "#e7ebfa";
  ctx.fillText(text, 8, canvas.height / 2);

  return canvas.toDataURL();
}

const btnImport = document.getElementById("import");

// create hidden file input
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "application/json";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

btnImport.onclick = () => fileInput.click();

fileInput.onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;

  const lowerName = file.name.toLowerCase();
  const mime = file.type || "";
  const looksJson =
    lowerName.endsWith(".json") ||
    mime === "application/json" ||
    mime === "text/json";

  if (!looksJson) {
    status("⚠ Only .json files are supported. You selected: " + file.name);
    fileInput.value = ""; // reset file picker
    return;
  }

  try {
    const text = await file.text();
    if (!text.trim()) {
      status("⚠ The chosen file is empty.");
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      status("⚠ File is not valid JSON (" + parseErr.message + ")");
      return;
    }

    if (!data || typeof data !== "object") {
      status("⚠ File does not contain a JSON object.");
      return;
    }
    if (!Array.isArray(data.positions)) {
      status("⚠ Missing 'positions' array in JSON.");
      return;
    }

    waypoints.length = 0;
    if (solvedEntity) viewer.entities.remove(solvedEntity);
    viewer.entities.values
      .filter(e => e.__isWP)
      .forEach(e => viewer.entities.remove(e));

    const wp = Array.isArray(data.waypoints) ? data.waypoints : [];
    if (wp.length > 0) wp.forEach(p => addWaypoint(p.lon, p.lat));
    else {
      const first = data.positions[0];
      const last = data.positions[data.positions.length - 1];
      addWaypoint(first.lon, first.lat);
      addWaypoint(last.lon, last.lat);
    }

    drawSolvedRoute(data.positions);
    lastSolveResult = data;

    status(
      `Imported route with ${wp.length || 2} waypoint${
        (wp.length || 2) > 1 ? "s" : ""
      } (${data.positions.length} path points).`
    );
  } catch (err) {
    console.error(err);
    status("❌ Import failed: " + err.message);
  } finally {
    fileInput.value = ""; // reset so same file can be chosen again
  }
};

function addWaypoint(lon, lat) {
  const label = waypoints.length === 0 ? "START" :
    (waypoints.length === 1 ? "END?" : `WP${waypoints.length}`);
  const entity = viewer.entities.add({
    __isWP: true,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: { pixelSize: 8, color: Cesium.Color.fromCssColorString("#7aa2ff"), outlineColor: Cesium.Color.WHITE, outlineWidth: 1 },
    label: {
      text: `${label}\n${lon.toFixed(4)}, ${lat.toFixed(4)}`,
      font: "700 10px Inter, sans-serif",
      fillColor: Cesium.Color.fromCssColorString("#eef2ff"),
      outlineWidth: 0,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("rgba(18, 23, 38, 0.6)"),
      pixelOffset: new Cesium.Cartesian2(0, -22),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(0, 1.4, 2.0e6, 0.6),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,

      scale: window.devicePixelRatio * 1.5,
      eyeOffset: new Cesium.Cartesian3(0.0, 0.0, -10.0),
      labelStyle: Cesium.LabelStyle.FILL
    }
  });
  waypoints.push({ lon, lat, entity });
  renderList();
  redrawDashed();
}

// Reuse existing handler; add LEFT_CLICK for waypoint placement
handler.setInputAction((movement) => {
  if (!adding) return;
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const cart = viewer.camera.pickEllipsoid(movement.position, ellipsoid) || viewer.scene.pickPosition(movement.position);
  if (!cart) return;
  const carto = Cesium.Cartographic.fromCartesian(cart, ellipsoid);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  addWaypoint(lon, lat);
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

function autoGridSize(waypoints) {
  const n = waypoints.length;
  if (n < 2) return 16;

  const lons = waypoints.map(p => p.lon);
  const lats = waypoints.map(p => p.lat);
  const lonMin = Math.min(...lons),
    lonMax = Math.max(...lons),
    latMin = Math.min(...lats),
    latMax = Math.max(...lats);

  const lonSpan = lonMax - lonMin;
  const latSpan = latMax - latMin;
  const diagSpan = Math.hypot(lonSpan, latSpan);

  let cellsNeeded = 0;
  for (let i = 0; i < n - 1; i++) {
    const dx = waypoints[i + 1].lon - waypoints[i].lon;
    const dy = waypoints[i + 1].lat - waypoints[i].lat;
    const seg = Math.hypot(dx, dy);
    cellsNeeded = Math.max(cellsNeeded, Math.ceil(seg / (diagSpan / (n - 1))));
  }

  let N = Math.max(16, cellsNeeded + 1);

  const pow2 = x => 2 ** Math.ceil(Math.log2(x));
  N = pow2(N);

  return Math.min(N, 512);
}

function drawSolvedRoute(points) {
  if (solvedEntity) { viewer.entities.remove(solvedEntity); solvedEntity = null; }
  const rad = points.flatMap(p => [Cesium.Math.toRadians(p.lon), Cesium.Math.toRadians(p.lat)]);
  solvedEntity = viewer.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromRadiansArray(rad),
      width: 6,
      material: new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString("#7aa2ff").withAlpha(0.95)
      ),
      clampToGround: false,
      arcType: Cesium.ArcType.GEODESIC,
      granularity: Cesium.Math.RADIANS_PER_DEGREE / 10
    }
  });
  const rect = Cesium.Rectangle.fromRadians(
    Math.min(...points.map(p => Cesium.Math.toRadians(p.lon))),
    Math.min(...points.map(p => Cesium.Math.toRadians(p.lat))),
    Math.max(...points.map(p => Cesium.Math.toRadians(p.lon))),
    Math.max(...points.map(p => Cesium.Math.toRadians(p.lat)))
  );
  viewer.camera.flyTo({ destination: rect, duration: 0.8 });
}

// Local A* API (server-side): POST /astar/solve
async function solveRouteViaAPI(waypoints, gridN, marginKm, maxSlope, slopeW) {
  const payload = {
    positions: waypoints.map(p => ({ lon: p.lon, lat: p.lat })),
    grid: gridN,
    margin_km: marginKm,
    max_slope: maxSlope,
    slope_weight: slopeW
  };
  const resp = await fetch(`${FLASK_URL}/astar/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const js = await resp.json();
  if (!resp.ok || js.error) throw new Error(js.error || "A* failed");
  return js; // { positions: [...], total_cost_m, legs_m }
}

// Initialize slider pills
marginVal.textContent = margin.value;
maxSlopeVal.textContent = (+maxSlope.value).toFixed(2);
slopeWVal.textContent = (+slopeW.value).toFixed(2);

// Solve button
$("solve").onclick = async () => {
  if (waypoints.length < 2) { status("Add at least Start and End."); return; }
  status("Solving (local Flask A*)…");
  try {
    const autoGrid = autoGridSize(waypoints);
    const res = await solveRouteViaAPI(
      waypoints, autoGrid, +margin.value, +maxSlope.value, +slopeW.value
    );
    lastSolveResult = res;
    drawSolvedRoute(res.positions);
    // Show distance-like cost if present
    if (typeof res.total_cost_m === "number") {
      status(`A* total cost ≈ ${(res.total_cost_m / 1000).toFixed(2)} km`);
    } else if (typeof res.total_energy_kWh === "number") {
      status(`A* total energy ≈ ${res.total_energy_kWh.toFixed(3)} kWh`);
    } else {
      status("A* solved.");
    }
  } catch (e) {
    console.error(e);
    status("⚠ " + e.message);
  }
}