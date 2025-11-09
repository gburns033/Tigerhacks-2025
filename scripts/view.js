// region Mars Ellipsoid and Camera Limits
viewer.scene.globe.ellipsoid = new Cesium.Ellipsoid(
  3396190.0,
  3396190.0,
  3376200.0
);
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 3.0e6;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 3.0e7;
// endregion

// region Raster Imagery Setup
viewer.imageryLayers.addImageryProvider(
  new Cesium.UrlTemplateImageryProvider({
    url: tileUrl,
    tilingScheme: new Cesium.GeographicTilingScheme(),
    rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
    credit: "Mars 6.25° data via TiTiler + Flask",
  })
);

viewer.scene.fog.enabled = false;
viewer.scene.globe.showGroundAtmosphere = false;
if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;

const imageryLayer = viewer.imageryLayers.get(0);
imageryLayer.alpha = 0.9;
imageryLayer.brightness = 1.1;
imageryLayer.saturation = 0.4;
// endregion

// region Mouse Coordinate Readout
const coordLabel = document.getElementById("coordLabel");
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

handler.setInputAction((movement) => {
  const ray = viewer.camera.getPickRay(movement.endPosition);
  const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  if (cartesian) {
    const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
    const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(5);
    const lon = Cesium.Math.toDegrees(carto.longitude).toFixed(5);
    coordLabel.textContent = `Lon: ${lon}°, Lat: ${lat}°`;
  } else {
    coordLabel.textContent = "Off world";
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
// endregion

// region Auto‑Rotation and Idle Zoom
let idleTimeout;
let isRotating = false;
let hasZoomedOut = false;
const IDLE_TIME = 10000;
const ROTATION_SPEED = 0.001;

function startRotation() {
  if (!isRotating) {
    isRotating = true;

    const currentPosition = viewer.camera.position;
    const currentCartographic =
      Cesium.Ellipsoid.WGS84.cartesianToCartographic(currentPosition);

    if (!hasZoomedOut) {
      hasZoomedOut = true;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(
          currentCartographic.longitude,
          currentCartographic.latitude,
          25_000_000
        ),
        duration: 3,
      });
    }

    viewer.clock.onTick.addEventListener(rotateCamera);
  }
}

function stopRotation() {
  if (isRotating) {
    isRotating = false;
    hasZoomedOut = false;
    viewer.clock.onTick.removeEventListener(rotateCamera);
  }
}

function rotateCamera() {
  const camera = viewer.camera;
  camera.rotate(Cesium.Cartesian3.UNIT_Z, ROTATION_SPEED);
}

startRotation(); // start orbit on load

viewer.scene.canvas.addEventListener("mousedown", () => stopRotation());
viewer.scene.canvas.addEventListener("wheel", () => stopRotation());
viewer.scene.canvas.addEventListener("touchstart", () => stopRotation());
// endregion

// region Home Button Handler
viewer.homeButton.viewModel.command.beforeExecute.addEventListener(() => {
  isRotating = false;
  hasZoomedOut = false;
  viewer.clock.onTick.removeEventListener(rotateCamera);

  setTimeout(() => {
    startRotation();
  }, 500);
});
// endregion