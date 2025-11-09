// ---------- Landmark pins (kept from your file) ----------
    function normalizeLon(lonDeg) { return ((lonDeg + 180) % 360) - 180; }

    fetch("./mars_landmarks.geojson")
      .then(r => r.json())
      .then(geojson => {
        const features = geojson.features ?? [];
        features.forEach(f => {
          const [lonRaw, lat] = f.geometry.coordinates;
          const lon = normalizeLon(lonRaw);
          const pos = viewer.scene.globe.ellipsoid.cartographicToCartesian(
            Cesium.Cartographic.fromDegrees(lon, lat, 0.0)
          );
          viewer.entities.add({
            name: f.properties?.name ?? "Unnamed",
            position: pos,
            point: { pixelSize: 6, color: Cesium.Color.fromCssColorString("#c34a2c") },
            label: {
              text: f.properties?.name ?? "",
              font: "20px 'Segoe UI Semibold', sans-serif",
              fillColor: Cesium.Color.fromCssColorString("#f8debd"),
              outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -18),
              disableDepthTestDistance: 0
            }
          });
        });
      })
      .catch((err) => console.error("GeoJSON load failed:", err));