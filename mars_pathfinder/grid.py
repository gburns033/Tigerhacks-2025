# region Imports
import numpy as np
from models import GridSpec
# endregion

# region Grid Coordinate Generation
def lonlat_grid(spec: GridSpec):
    xs = np.linspace(spec.min_lon, spec.max_lon, spec.W, dtype=np.float64)
    ys = np.linspace(spec.min_lat, spec.max_lat, spec.H, dtype=np.float64)
    return np.tile(xs, spec.H), np.repeat(ys, spec.W)
# endregion

# region Index Helpers
def nearest_idx(lon, lat, spec: GridSpec) -> int:
    x = int(
        round(
            (lon - spec.min_lon)
            / (spec.max_lon - spec.min_lon)
            * (spec.W - 1)
        )
    )
    y = int(
        round(
            (lat - spec.min_lat)
            / (spec.max_lat - spec.min_lat)
            * (spec.H - 1)
        )
    )
    x = max(0, min(spec.W - 1, x))
    y = max(0, min(spec.H - 1, y))
    return y * spec.W + x


def idx_to_rc(i: int, W: int):
    return (i // W, i % W)
# endregion

# region Conversion Factory
def rc_to_lonlat_factory(spec: GridSpec):
    xs = np.linspace(spec.min_lon, spec.max_lon, spec.W)
    ys = np.linspace(spec.min_lat, spec.max_lat, spec.H)

    def f(r: int, c: int):
        return float(xs[c]), float(ys[r])

    return f
# endregion