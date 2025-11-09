# region Imports
import math
from config import MARS_R
# endregion

# region Horizontal Distance
def horiz_dist_m(lon1, lat1, lon2, lat2) -> float:
    to_rad = math.pi / 180.0
    x = (lon2 - lon1) * to_rad * math.cos((lat1 + lat2) * 0.5 * to_rad) * MARS_R
    y = (lat2 - lat1) * to_rad * MARS_R
    return math.hypot(x, y)
# endregion

# region Degree‑to‑Kilometer Conversions
def km2deg_lat(km: float) -> float:
    return (km * 1000.0) / (MARS_R * (math.pi / 180.0))


def km2deg_lon(km: float, lat: float) -> float:
    return (km * 1000.0) / (
        MARS_R * math.cos(math.radians(lat)) * (math.pi / 180.0)
    )
# endregion