# dem.py
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
from rasterio.crs import CRS
from rasterio.warp import transform as warp_transform
from models import GridSpec
from config import COG_URL, AUTO_MIN_M, AUTO_MAX_M

def _looks_like_grayscale(arr: np.ndarray) -> bool:
    v = arr[np.isfinite(arr)]
    if v.size == 0: return True
    vmin, vmax = float(np.min(v)), float(np.max(v))
    if arr.dtype == np.uint8 and 0.0 <= vmin <= 255.0 and 0.0 <= vmax <= 255.0: return True
    if arr.dtype == np.uint16 and 0.0 <= vmin and vmax <= 65535.0: return True
    if (vmax - vmin) < 5.0: return True
    if 0.0 <= vmin and vmax < 1000.0: return True
    return False

def read_dem_window(spec: GridSpec) -> np.ndarray:
    with rasterio.open(COG_URL) as ds:
        if ds.crs and ds.crs != CRS.from_epsg(4326):
            xs, ys = warp_transform(CRS.from_epsg(4326), ds.crs,
                                    [spec.min_lon, spec.max_lon],
                                    [spec.min_lat, spec.max_lat])
            minx, maxx = min(xs), max(xs); miny, maxy = min(ys), max(ys)
        else:
            minx, miny, maxx, maxy = spec.min_lon, spec.min_lat, spec.max_lon, spec.max_lat

        win = from_bounds(minx, miny, maxx, maxy, ds.transform)
        arr = ds.read(1, window=win, out_shape=(spec.H, spec.W),
                      resampling=Resampling.bilinear, boundless=True, fill_value=np.nan)

        band_scale = None; band_off = None
        try:
            if getattr(ds, "scales", None):  band_scale = (ds.scales or [None])[0]
            if getattr(ds, "offsets", None): band_off   = (ds.offsets or [None])[0]
        except Exception:
            pass

    if np.isnan(arr).any():
        valid = arr[np.isfinite(arr)]
        fill = float(np.mean(valid)) if valid.size else 0.0
        arr = np.where(np.isfinite(arr), arr, fill)

    v = arr.astype(np.float64)

    if (band_scale not in (None, 1.0)) or (band_off not in (None, 0.0)):
        s = 1.0 if band_scale is None else float(band_scale)
        o = 0.0 if band_off   is None else float(band_off)
        return v * s + o

    if _looks_like_grayscale(v):
        valid = v[np.isfinite(v)]
        if valid.size:
            p2, p98 = np.percentile(valid, [2, 98])
            span = max(p98 - p2, 1e-9)
            return ((v - p2) / span) * (AUTO_MAX_M - AUTO_MIN_M) + AUTO_MIN_M
        return np.zeros_like(v)

    return v
