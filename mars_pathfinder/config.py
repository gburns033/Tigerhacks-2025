# config.py
COG_URL = "http://45.76.227.0:8081/mars_6p25_wgs84_cog.tif"
MARS_R = 3_390_000.0  # Mars mean radius (m)

# # If the COG looks like grayscale/hillshade, map to this plausible Mars meter range
# AUTO_MIN_M = -8200.0
# AUTO_MAX_M = 21200.0

# Allow a tiny tolerance on a single edge over the max slope
EDGE_TOL = 1.10
