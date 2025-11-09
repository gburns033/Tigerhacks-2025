# app.py — Slim Flask API that calls modular A* logic (manual mode unchanged)
# deps: pip install flask numpy rasterio pillow pyproj requests

from __future__ import annotations
from typing import List, Tuple, Optional, Any, Dict
import io, requests, numpy as np
from flask import Flask, request, jsonify, make_response
from PIL import Image
import rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from rasterio.crs import CRS
from rasterio.warp import transform as warp_transform

from config import COG_URL, EDGE_TOL
from geometry import km2deg_lat, km2deg_lon, horiz_dist_m
from models import GridSpec, Layers
from grid import idx_to_rc, nearest_idx, rc_to_lonlat_factory
from dem import read_dem_window
from metrics import compute_cell_metrics
from astar_core import astar, neighbors_8
from energy import EnergyParams, physical_energy_cost_fn
from connectivity import nearest_unblocked
from costs import edge_cost_factory

app = Flask(__name__)

# ======= CORS =======
@app.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Accept-Ranges"] = "bytes"
    return resp

# ======= public preview endpoints =======
@app.route("/", methods=["GET"])
def root():
    return {"ok": True, "source_tif": COG_URL, "astar": "/astar/solve (POST JSON)"}

@app.route("/cog/part", methods=["GET"])
def cog_part():
    bbox = request.args.get("bbox", "")
    try:
        minx, miny, maxx, maxy = [float(x) for x in bbox.split(",")]
    except Exception:
        return jsonify({"error": "bbox=minx,miny,maxx,maxy required"}), 400

    W = int(request.args.get("width", "256"))
    H = int(request.args.get("height", "256"))
    resampling = getattr(Resampling, request.args.get("resampling", "nearest").lower(), Resampling.nearest)

    try:
        r = requests.head(COG_URL, timeout=5)
        if r.status_code != 200:
            return jsonify({"error": "Remote COG not reachable"}), 502
    except Exception as e:
        return jsonify({"error": f"COG check failed: {e}"}), 502

    with rasterio.open(COG_URL) as ds:
        if ds.crs and ds.crs != CRS.from_epsg(4326):
            xs, ys = warp_transform(CRS.from_epsg(4326), ds.crs, [minx, maxx], [miny, maxy])
            minx_ds, maxx_ds = min(xs), max(xs)
            miny_ds, maxy_ds = min(ys), max(ys)
        else:
            minx_ds, miny_ds, maxx_ds, maxy_ds = minx, miny, maxx, maxy

        win = from_bounds(minx_ds, miny_ds, maxx_ds, maxy_ds, ds.transform)
        arr = ds.read(1, window=win, out_shape=(H, W), resampling=resampling, boundless=True, fill_value=np.nan).astype("float64")

    valid = arr[np.isfinite(arr)]
    if valid.size == 0:
        lo, hi = 0.0, 1.0
    else:
        lo, hi = np.percentile(valid, [2, 98])
        if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
            lo, hi = float(np.nanmin(valid)), float(np.nanmax(valid))
            if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
                lo, hi = 0.0, 1.0

    scaled = np.clip((arr - lo) / max(hi - lo, 1e-6), 0, 1)
    buf = io.BytesIO()
    Image.fromarray((scaled * 255).astype("uint8"), "L").save(buf, "PNG")
    buf.seek(0)
    resp = make_response(buf.read())
    resp.headers["Content-Type"] = "image/png"
    return resp

@app.route("/cog/point", methods=["GET"])
def cog_point():
    try:
        lon = float(request.args["lon"]); lat = float(request.args["lat"])
    except Exception:
        return jsonify({"error":"lon and lat required"}), 400

    try:
        r = requests.head(COG_URL, timeout=5)
        if r.status_code != 200:
            return jsonify({"error": "Remote COG not reachable"}), 502
    except Exception as e:
        return jsonify({"error": f"COG check failed: {e}"}), 502

    with rasterio.open(COG_URL) as ds:
        xy = (lon, lat)
        if ds.crs and ds.crs != CRS.from_epsg(4326):
            xs, ys = warp_transform(CRS.from_epsg(4326), ds.crs, [lon], [lat])
            xy = (xs[0], ys[0])
        try:
            v = float(list(ds.sample([xy]))[0][0])
        except Exception:
            v = float("nan")
    return jsonify({"coordinate":[lon,lat], "values":[None if np.isnan(v) else v]})

# ======= A* API (manual mode; unchanged behavior) =======
@app.route("/astar/solve", methods=["POST"])
def astar_solve():
    """
    JSON body (manual mode):
    {
      "positions":[{"lon":..,"lat":..}, ...],  // >= 2
      "grid": 128,
      "margin_km": 40,
      "max_slope": 0.6,
      "slope_weight": 2.0,
      "cost": "slope" | "energy",             // default "slope"
      "weight": 1.0,
      "epsilon": null,
      "beam_width": null,
      "max_time_sec": null,
      "max_expansions": null
    }
    """
    # Ensure remote COG reachable
    try:
        r = requests.head(COG_URL, timeout=5)
        if r.status_code != 200:
            return jsonify({"error": "Remote COG not reachable"}), 502
    except Exception as e:
        return jsonify({"error": f"COG check failed: {e}"}), 502

    data = request.get_json(force=True, silent=True) or {}
    pts = data.get("positions") or []
    if len(pts) < 2:
        return jsonify({"error":"positions must have at least 2 points"}), 400

    # Hyperparameters (manual)
    N           = int(data.get("grid", 128))
    mk          = float(data.get("margin_km", 40.0))
    max_grade   = float(data.get("max_slope", 0.6))
    slope_w     = float(data.get("slope_weight", 2.0))
    cost_mode   = (data.get("cost") or "slope").lower()

    weight      = float(data.get("weight", 1.0))
    epsilon     = data.get("epsilon", None)
    epsilon     = (None if epsilon in (None, "", "null") else float(epsilon))
    beam_width  = data.get("beam_width", None)
    beam_width  = (None if beam_width in (None, "", "null") else int(beam_width))
    max_time    = data.get("max_time_sec", None)
    max_time    = (None if max_time in (None, "", "null") else float(max_time))
    max_exp     = data.get("max_expansions", None)
    max_exp     = (None if max_exp in (None, "", "null") else int(max_exp))

    # Expand bbox by margin
    lons = [float(p["lon"]) for p in pts]
    lats = [float(p["lat"]) for p in pts]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)
    mid_lat = 0.5 * (min_lat + max_lat)
    min_lon -= km2deg_lon(mk, mid_lat); max_lon += km2deg_lon(mk, mid_lat)
    min_lat -= km2deg_lat(mk);          max_lat += km2deg_lat(mk)

    # Build grid + DEM (meters)
    spec = GridSpec(min_lon, min_lat, max_lon, max_lat, N, N)
    elev = read_dem_window(spec)
    rough, slope_grade = compute_cell_metrics(elev, spec)

    # metric spacing
    dlon = (spec.max_lon - spec.min_lon) / max(N - 1, 1)
    dlat = (spec.max_lat - spec.min_lat) / max(N - 1, 1)
    from geometry import MARS_R  # local import to avoid cycle
    import math
    dx_m = (dlon * math.pi / 180.0) * math.cos(math.radians(mid_lat)) * MARS_R
    dy_m = (dlat * math.pi / 180.0) * MARS_R
    meters_per_cell = 0.5 * (dx_m + dy_m)

    blocked = (slope_grade > max_grade)
    layers = Layers(elevation_m=elev.astype(np.float32), rough=rough, blocked=blocked)

    H, W = N, N
    rc_to_lonlat = rc_to_lonlat_factory(spec)

    def neigh(u): return neighbors_8(u, H, W)

    # Heuristic
    def h_m(u, g):
        ulon, ulat = rc_to_lonlat(u[0], u[1])
        glon, glat = rc_to_lonlat(g[0], g[1])
        return horiz_dist_m(ulon, ulat, glon, glat)

    # Edge costs (slope or energy)
    if cost_mode == "energy":
        params = EnergyParams(meters_per_cell=meters_per_cell)
        edge_cost = physical_energy_cost_fn(layers, params, scale_cost=1.0)
    else:
        edge_cost = edge_cost_factory(cost_mode="slope", layers=layers,
                                      slope_weight=slope_w, max_grade=max_grade,
                                      rc_to_lonlat=rc_to_lonlat, meters_per_cell=meters_per_cell)

    # Map waypoints → rc (snap to nearest unblocked)
    way_rc: List[Tuple[int,int]] = []
    start_blocked_flags: List[bool] = []
    for lon, lat in zip(lons, lats):
        i = nearest_idx(lon, lat, spec)
        rc = idx_to_rc(i, W)
        was_blocked = bool(layers.blocked[rc[0], rc[1]])
        rc = nearest_unblocked(rc, layers.blocked, max_radius=25)
        start_blocked_flags.append(was_blocked)
        way_rc.append(rc)

    # Run A* per leg
    path_rc: List[Tuple[int,int]] = []
    legs_cost: List[float] = []
    totals = 0.0

    for i in range(len(way_rc) - 1):
        s_rc, t_rc = way_rc[i], way_rc[i + 1]
        path, cost, *_ = astar(
            start=s_rc, goal=t_rc, neighbors_fn=neigh, edge_cost_fn=edge_cost, heuristic_fn=h_m,
            weight=weight, epsilon=epsilon, max_expansions=max_exp, max_time_sec=max_time, beam_width=beam_width
        )
        if path is None:
            diag = {
                "leg": i + 1, "grid": N, "margin_km": mk, "max_slope": max_grade, "edge_tol": EDGE_TOL,
                "blocked_ratio": float(layers.blocked.mean()),
                "start_blocked_clicked": start_blocked_flags[i],
                "end_blocked_clicked": start_blocked_flags[i+1],
                "max_grade_in_window": float(np.max(slope_grade)),
            }
            return jsonify({"error": f"No path for leg {i+1}. Try bigger grid/margin or relax constraints.",
                            "diag": diag}), 200
        if i > 0: path = path[1:]
        path_rc.extend(path)
        legs_cost.append(float(cost))
        totals += float(cost)

    # Back to lon/lat
    positions = [{"lon": float(rc_to_lonlat(r, c)[0]), "lat": float(rc_to_lonlat(r, c)[1])}
                 for (r, c) in path_rc]
    # Build response
    resp = {"positions": positions}

    if cost_mode == "energy":
        legs_J  = legs_cost                       # astar sum is already in Joules
        total_J = float(totals)
        total_Wh  = total_J / 3600.0
        total_kWh = total_Wh / 1000.0
        resp.update({
            "total_energy_J":   total_J,
            "total_energy_Wh":  total_Wh,
            "total_energy_kWh": total_kWh,
            "legs_energy_J":    legs_J
        })
    else:
        # old behavior (distance-weighted slope cost)
        resp.update({
            "total_cost_m": float(totals),
            "legs_m":       legs_cost
        })

    return jsonify(resp)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8081, threaded=True)
