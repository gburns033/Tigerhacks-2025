# region Imports
from dataclasses import dataclass
import math
from typing import Tuple, Optional
from models import Layers
# endregion

# region Energy Parameters
@dataclass
class EnergyParams:
    mass_kg: float = 185.0
    g: float = 3.71
    Crr: float = 0.03
    eta: float = 0.70
    meters_per_cell: float = 1.0
    k_rough_J_per_m: float = 40.0
    downhill_regen_eff: float = 0.10
    min_grade: float = -1.0
    max_grade: float = 1.0
# endregion

# region Helpers
def _grid_step_m(dr: int, dc: int, meters_per_cell: float) -> float:
    base = math.sqrt(2.0) if (dr != 0 and dc != 0) else 1.0
    return base * meters_per_cell
# endregion

# region Energy Computation
def move_energy_J(
    u: Tuple[int, int],
    v: Tuple[int, int],
    layers: Layers,
    P: EnergyParams,
) -> Optional[float]:
    (r0, c0), (r1, c1) = u, v
    if layers.blocked[r1, c1]:
        return None

    dr, dc = r1 - r0, c1 - c0
    d_m = _grid_step_m(dr, dc, P.meters_per_cell)
    dh_m = float(layers.elevation_m[r1, c1] - layers.elevation_m[r0, c0])
    grade = (dh_m / d_m) if d_m > 0 else 0.0
    grade = max(P.min_grade, min(P.max_grade, grade))
    theta = math.atan(grade)

    m, g = P.mass_kg, P.g
    F_grav_up = m * g * max(0.0, math.sin(theta))
    F_roll = P.Crr * m * g * abs(math.cos(theta))

    E_mech_no_regen = (F_grav_up + F_roll) * d_m
    E_grav_downhill = m * g * max(0.0, -math.sin(theta)) * d_m
    E_regen = P.downhill_regen_eff * E_grav_downhill

    rough = float(layers.rough[r1, c1])
    E_rough = P.k_rough_J_per_m * rough * d_m
    E_drive_in = E_mech_no_regen / max(1e-6, min(1.0, P.eta))
    E_batt = E_drive_in + E_rough - E_regen

    return max(0.0, E_batt)
# endregion

# region Factory
def physical_energy_cost_fn(
    layers: Layers,
    params: EnergyParams,
    scale_cost: float = 1.0,
):
    def cost(u, v):
        E = move_energy_J(u, v, layers, params)
        if E is None:
            return None
        return float(E * scale_cost)

    return cost
# endregion