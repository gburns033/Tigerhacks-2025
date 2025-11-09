// ---------- ENV ----------
const { TITILER_URL, FLASK_URL, MARS_TIF } = window.__ENV__ || {};
const tileUrl = `${TITILER_URL}/cog/tiles/WorldCRS84Quad/{z}/{x}/{y}@1x?url=${FLASK_URL}/${MARS_TIF}&colormap_name=inferno`;

// ---------- Cesium viewer ----------
var viewer = new Cesium.Viewer("cesiumContainer", {
    imageryProvider: false,
    baseLayerPicker: false,
    shouldAnimate: true,
    animation: false,
    timeline: false,
    creditContainer: document.createElement("div"),
    sceneModePicker: true,
    selectionIndicator: false,
    scene3DOnly: true
});

// Mars ellipsoid
viewer.scene.globe.ellipsoid = new Cesium.Ellipsoid(3396190.0, 3396190.0, 3376200.0);