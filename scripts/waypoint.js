// ---------- Waypoint + A* (added) ----------
const $ = id => document.getElementById(id);
const btnAdd = $("toggleAdd");
const btnUndo = $("undo");
const btnClear = $("clear");
const btnSolve = $("solve");
const btnDownload = $("download");
const grid = $("grid"), gridVal = $("gridVal");
const margin = $("margin"), marginVal = $("marginVal");
const maxSlope = $("maxSlope"), maxSlopeVal = $("maxSlopeVal");
const slopeW = $("slopeW"), slopeWVal = $("slopeWVal");
const statusEl = $("status"), listEl = $("list");

grid.oninput = () => gridVal.textContent = grid.value;
margin.oninput = () => marginVal.textContent = margin.value;
maxSlope.oninput = () => maxSlopeVal.textContent = (+maxSlope.value).toFixed(2);
slopeW.oninput = () => slopeWVal.textContent = (+slopeW.value).toFixed(2);
function status(msg) { statusEl.textContent = msg || ""; }

const waypoints = []; // {lon, lat, entity}
let adding = false;
let dashedEntity = null;
let solvedEntity = null;

btnAdd.onclick = () => {
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
  if (!waypoints.length) return;
  const data = { positions: waypoints.map(p => ({ lon: p.lon, lat: p.lat })) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "route_lonlat.json";
  a.click();
  URL.revokeObjectURL(a.href);
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

function addWaypoint(lon, lat) {
  const label = waypoints.length === 0 ? "START" :
    (waypoints.length === 1 ? "END?" : `WP${waypoints.length}`);
  const entity = viewer.entities.add({
    __isWP: true,
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: { pixelSize: 8, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.WHITE, outlineWidth: 1 },
    label: {
      text: `${label}\n${lon.toFixed(4)}, ${lat.toFixed(4)}`,
      font: "bold 14px sans-serif",
      showBackground: true,
      backgroundColor: Cesium.Color.fromBytes(18, 23, 38, 220),
      pixelOffset: new Cesium.Cartesian2(0, -18),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
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
  resetIdleTimer(); // any interaction cancels idle rotation
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

function drawSolvedRoute(points) {
  if (solvedEntity) { viewer.entities.remove(solvedEntity); solvedEntity = null; }
  const rad = points.flatMap(p => [Cesium.Math.toRadians(p.lon), Cesium.Math.toRadians(p.lat)]);
  solvedEntity = viewer.entities.add({
    polyline: {
      positions: Cesium.Cartesian3.fromRadiansArray(rad),
      width: 3,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.15, color: Cesium.Color.RED }),
      clampToGround: true
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
gridVal.textContent = grid.value;
marginVal.textContent = margin.value;
maxSlopeVal.textContent = (+maxSlope.value).toFixed(2);
slopeWVal.textContent = (+slopeW.value).toFixed(2);

// Solve button
$("solve").onclick = async () => {
  if (waypoints.length < 2) { status("Add at least Start and End."); return; }
  status("Solving (local Flask A*)…");
  try {
    const res = await solveRouteViaAPI(
      waypoints, +grid.value, +margin.value, +maxSlope.value, +slopeW.value
    );
    drawSolvedRoute(res.positions);
    // Show distance-like cost if present
    if (typeof res.total_cost_m === "number") {
      status(`A* total cost ≈ ${(res.total_cost_m / 1000).toFixed(2)} km`);
    } else if (typeof res.total_energy_kWh === "number") {
      status(`A* total energy ≈ ${res.total_energy_kWh.toFixed(3)} kWh`);
    } else {
      status("A* solved.");
    }
    resetIdleTimer();
  } catch (e) {
    console.error(e);
    status("⚠ " + e.message);
  }
}