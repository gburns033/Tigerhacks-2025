# region Imports
from typing import Tuple
import numpy as np
# endregion

# region Nearest Unblocked Cell Search
def nearest_unblocked(
    rc: Tuple[int, int],
    blocked: np.ndarray,
    max_radius: int = 25
) -> Tuple[int, int]:
    r, c = rc
    H, W = blocked.shape

    if not blocked[r, c]:
        return rc

    best = None
    best_d2 = 1e18

    for rad in range(1, max_radius + 1):
        r0, r1 = max(0, r - rad), min(H - 1, r + rad)
        c0, c1 = max(0, c - rad), min(W - 1, c + rad)
        for rr in range(r0, r1 + 1):
            for cc in range(c0, c1 + 1):
                if not blocked[rr, cc]:
                    d2 = (rr - r) * (rr - r) + (cc - c) * (cc - c)
                    if d2 < best_d2:
                        best = (rr, cc)
                        best_d2 = d2
        if best is not None:
            return best

    return rc
# endregion