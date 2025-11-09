// region Environment
const { TITILER_URL, FLASK_URL, MARS_TIF } = window.__ENV__ || {};
const tileUrl = `${TITILER_URL}/cog/tiles/WorldCRS84Quad/{z}/{x}/{y}@1x?url=${FLASK_URL}/${MARS_TIF}&colormap_name=inferno`;
// endregion

// region Cesium Viewer Setup
var viewer = new Cesium.Viewer("cesiumContainer", {
  imageryProvider: false,
  baseLayerPicker: false,
  shouldAnimate: true,
  animation: false,
  timeline: false,
  infoBox: false,
  fullscreenButton: false,
  creditContainer: document.createElement("div"),
  sceneModePicker: true,
  selectionIndicator: true,
  scene3DOnly: true,
  geocoder: false,
});
// endregion

// region Mars Ellipsoid
viewer.scene.globe.ellipsoid = new Cesium.Ellipsoid(
  3396190.0,
  3396190.0,
  3376200.0
);
// endregion

// region Icon Replacement
feather.replace();
// endregion

// region Range Slider Update
document.querySelectorAll('#panel input[type="range"]').forEach((slider) => {
  const update = () => {
    const percent =
      ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty("--range-percent", percent + "%");
  };
  slider.addEventListener("input", update);
  update();
});
// endregion

// region Landmark Toggle
const btnLandmarks = document.getElementById("landmarkToggle");

btnLandmarks.onclick = () => {
  const showing = toggleLandmarks(viewer);
  btnLandmarks.classList.toggle("active", showing);
  btnLandmarks.title = showing ? "Hide landmarks" : "Show landmarks";
};
// endregion