# metrics.py
import numpy as np, math
from models import GridSpec
from config import MARS_R

def compute_cell_metrics(elev_m: np.ndarray, spec: GridSpec):
    H, W = elev_m.shape
    mid_lat = 0.5 * (spec.min_lat + spec.max_lat)
    dlon = (spec.max_lon - spec.min_lon) / max(W - 1, 1)
    dlat = (spec.max_lat - spec.min_lat) / max(H - 1, 1)
    dx_m = (dlon * math.pi / 180.0) * math.cos(math.radians(mid_lat)) * MARS_R
    dy_m = (dlat * math.pi / 180.0) * MARS_R
    dx_m = max(dx_m, 1e-6); dy_m = max(dy_m, 1e-6)

    gy, gx = np.gradient(elev_m, dy_m, dx_m)  # m/m
    grad_mag = np.hypot(gx, gy)

    valid = grad_mag[np.isfinite(grad_mag)]
    if valid.size == 0:
        rough = np.zeros_like(grad_mag, dtype=np.float32)
    else:
        lo, hi = np.percentile(valid, [5, 95])
        span = max(hi - lo, 1e-6)
        rough = np.clip((grad_mag - lo) / span, 0, 1).astype(np.float32)

    return rough.astype(np.float32), grad_mag.astype(np.float32)
