# models.py
from dataclasses import dataclass
import numpy as np

@dataclass
class GridSpec:
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float
    W: int
    H: int

@dataclass
class Layers:
    elevation_m: np.ndarray   # (H,W)
    rough: np.ndarray         # (H,W) ~ [0,1]
    blocked: np.ndarray       # (H,W) bool
