# region Imports
from dataclasses import dataclass
import numpy as np
# endregion

# region Grid Specification
@dataclass
class GridSpec:
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float
    W: int
    H: int
# endregion

# region Layer Data
@dataclass
class Layers:
    elevation_m: np.ndarray   # (H, W)
    rough: np.ndarray         # (H, W) normalized [0,1]
    blocked: np.ndarray       # (H, W) boolean mask
# endregion