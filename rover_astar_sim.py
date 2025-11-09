# region Imports
import heapq
import math
import time
from typing import Callable, Tuple, List, Optional, Any
# endregion

# region Helper Functions
def neighbors_8(u, H, W):
    r, c = u
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            rr, cc = r + dr, c + dc
            if 0 <= rr < H and 0 <= cc < W:
                yield (rr, cc)


def euclid(a, b):
    ar, ac = a
    br, bc = b
    return math.hypot(ar - br, ac - bc)


def reconstruct(parent, goal):
    path = []
    v = goal
    while v is not None:
        path.append(v)
        v = parent.get(v)
    path.reverse()
    return path
# endregion

# region A* Algorithm
def astar(
    start: Tuple[int, int],
    goal: Tuple[int, int],
    neighbors_fn: Callable[[Tuple[int, int]], Any],
    edge_cost_fn: Callable[[Tuple[int, int], Tuple[int, int]], Optional[float]],
    heuristic_fn: Callable[[Tuple[int, int], Tuple[int, int]], float],
    *,
    weight: float = 1.0,
    epsilon: Optional[float] = None,
    max_expansions: Optional[int] = None,
    max_time_sec: Optional[float] = None,
    beam_width: Optional[int] = None,
):
    """
    Returns:
      path, total_cost, expansions, expanded_order(list), frontier_snaps(None placeholder)
    """
    if start == goal:
        return [start], 0.0, 0, [start], None

    t0 = time.time()
    counter = 0  # stable tie-breaker

    # open heap: (f, h, counter, node)
    openh: List[Tuple[float, float, int, Tuple[int, int]]] = []
    h0 = heuristic_fn(start, goal)
    heapq.heappush(openh, (h0 * weight, h0, counter, start))

    g = {start: 0.0}
    parent = {start: None}
    closed = set()
    expansions = 0
    expanded_order = []

    best_goal_cost = None
    best_goal_node = None

    while openh:
        # region Timeout Check
        if max_time_sec is not None and (time.time() - t0) > max_time_sec:
            if best_goal_node is not None:
                return (
                    reconstruct(parent, best_goal_node),
                    best_goal_cost,
                    expansions,
                    expanded_order,
                    None,
                )
            return None, float("inf"), expansions, expanded_order, None
        # endregion

        f, h, _, u = heapq.heappop(openh)

        # region Early Stopping with (1+epsilon)
        if epsilon is not None and best_goal_cost is not None:
            min_f = f
            if best_goal_cost <= (1.0 + epsilon) * min_f:
                return reconstruct(parent, best_goal_node), best_goal_cost, expansions, expanded_order, None
        # endregion

        if u in closed:
            continue
        closed.add(u)
        expanded_order.append(u)
        expansions += 1

        # region Expansion Cap
        if max_expansions is not None and expansions >= max_expansions:
            if best_goal_node is not None:
                return reconstruct(parent, best_goal_node), best_goal_cost, expansions, expanded_order, None
            return None, float("inf"), expansions, expanded_order, None
        # endregion

        if u == goal:
            return reconstruct(parent, u), g[u], expansions, expanded_order, None

        gu = g[u]
        # region Neighbor Expansion
        for v in neighbors_fn(u):
            c = edge_cost_fn(u, v)
            if c is None:
                continue
            alt = gu + c
            if v in closed:
                continue
            old = g.get(v)
            if old is None or alt < old - 1e-12:
                g[v] = alt
                parent[v] = u
                hv = heuristic_fn(v, goal)
                counter += 1
                heapq.heappush(openh, (alt + weight * hv, hv, counter, v))

                # track best goal found
                if v == goal:
                    if best_goal_cost is None or alt < best_goal_cost - 1e-12:
                        best_goal_cost = alt
                        best_goal_node = v
        # endregion

        # region Beam Pruning
        if beam_width is not None and len(openh) > beam_width:
            openh = heapq.nsmallest(beam_width, openh)
            heapq.heapify(openh)
        # endregion

    # region Fallback
    if best_goal_node is not None:
        return reconstruct(parent, best_goal_node), best_goal_cost, expansions, expanded_order, None
    return None, float("inf"), expansions, expanded_order, None
    # endregion
# endregion