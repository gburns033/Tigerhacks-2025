// region Landmark Pins
function normalizeLon(lonDeg) {
  return ((lonDeg + 180) % 360) - 180;
}

let landmarksVisible = true;
const btnLandmarkToggle = document.getElementById("landmarkToggle");
btnLandmarkToggle.classList.add("active");

function toggleLandmarks(viewer) {
  landmarksVisible = !landmarksVisible;
  viewer.entities.values.forEach((e) => {
    if (e.__isLandmark) e.show = landmarksVisible;
  });
  return landmarksVisible;
}
// endregion

// region Load GeoJSON Landmarks
fetch("./mars_landmarks.geojson")
  .then((r) => r.json())
  .then((geojson) => {
    const features = geojson.features ?? [];

    features.forEach((f) => {
      const [lonRaw, lat] = f.geometry.coordinates;
      const lon = normalizeLon(lonRaw);
      const pos = viewer.scene.globe.ellipsoid.cartographicToCartesian(
        Cesium.Cartographic.fromDegrees(lon, lat, 0.0)
      );

      viewer.entities.add({
        name: f.properties?.name ?? "Unnamed",
        position: pos,
        point: {
          pixelSize: 6,
          color: Cesium.Color.fromCssColorString("#c34a2c"),
        },
        label: {
          text: f.properties?.name ?? "",
          font: "20px 'Segoe UI Semibold', sans-serif",
          fillColor: Cesium.Color.fromCssColorString("#f8debd"),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          disableDepthTestDistance: 0,
        },
        __isLandmark: true,
        __landmarkData: f.properties,
      });
    });
  })
  .catch((err) => console.error("GeoJSON load failed:", err));
// endregion

// region Landmark Sidebar
const sidebar = document.getElementById("sidebar");
const sidebarContent = document.getElementById("sidebarContent");
const closeSidebar = document.getElementById("closeSidebar");
// endregion

// region Click Handler for Landmarks
const screenHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

screenHandler.setInputAction((movement) => {
  const pickedObject = viewer.scene.pick(movement.position);

  if (Cesium.defined(pickedObject)) {
    const entity = pickedObject.id;

    if (entity && entity.__isLandmark && entity.__landmarkData) {
      showLandmarkSidebar(entity);
      return;
    }
  }

  sidebar.classList.add("hidden");
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
// endregion

// region Sidebar Behavior
function showLandmarkSidebar(entity) {
  const props = entity.__landmarkData;

  let html = `<h2>${props.name || "Unnamed Landmark"}</h2>`;

  if (props.image) {
    html += `<img src="${props.image}" alt="${props.name}" style="max-width: 100%; height: auto; margin-bottom: 10px;">`;
  }

  if (props.description) {
    html += `<p>${props.description}</p>`;
  }

  if (props.wiki) {
    html += `<p><a href="${props.wiki}" target="_blank" rel="noopener">Learn more on Wikipedia</a></p>`;
  }

  sidebarContent.innerHTML = html;
  sidebar.classList.remove("hidden");
}

closeSidebar.onclick = () => {
  sidebar.classList.add("hidden");
};

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    sidebar.classList.add("hidden");
  }
});
// endregion