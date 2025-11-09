# region Mars Configuration
COG_URL = "http://45.76.227.0:8081/mars_6p25_wgs84_cog.tif"
MARS_R = 3_390_000.0  # Mars mean radius (m)
# endregion

# region Edge and Slope Tolerance
# Allow a small tolerance for edges slightly above the maximum slope
EDGE_TOL = 1.10
# endregion

# region Optional DEM Range (commented)
# AUTO_MIN_M = -8200.0
# AUTO_MAX_M = 21200.0
# endregion