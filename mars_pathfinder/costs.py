# region Imports
from typing import Tuple, Optional, Callable
from models import Layers
from geometry import horiz_dist_m
from config import EDGE_TOL
# endregion

# region Edge Cost Factory
def edge_cost_factory(
    cost_mode: str,
    layers: Layers,
    slope_weight: float,
    max_grade: float,
    rc_to_lonlat: Callable[[int, int], Tuple[float, float]],
    meters_per_cell: float,
):
    if cost_mode == "energy":
        raise RuntimeError("Use energy.physical_energy_cost_fn for energy mode.")

    # region Edge‑cost Function
    def edge_cost(u: Tuple[int, int], v: Tuple[int, int]) -> Optional[float]:
        r0, c0 = u
        r1, c1 = v
        if layers.blocked[r1, c1]:
            return None

        lon0, lat0 = rc_to_lonlat(r0, c0)
        lon1, lat1 = rc_to_lonlat(r1, c1)
        hd = horiz_dist_m(lon0, lat0, lon1, lat1)
        if hd <= 1e-6:
            return None

        dh = float(layers.elevation_m[r1, c1] - layers.elevation_m[r0, c0])
        grade = abs(dh) / hd
        if grade > (max_grade * EDGE_TOL):
            return None

        return hd * (1.0 + slope_weight * grade)
    # endregion

    return edge_cost
# endregion