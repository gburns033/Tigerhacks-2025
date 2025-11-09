// ---------- Visibility for labels on the far side (kept) ----------
const scene = viewer.scene;
const camera = scene.camera;
function isVisibleToCamera(cartesian) {
    const occluder = new Cesium.EllipsoidalOccluder(scene.globe.ellipsoid, camera.positionWC);
    return occluder.isPointVisible(cartesian);
}
scene.postRender.addEventListener(() => {
    viewer.entities.values.forEach((entity) => {
        if (!entity.position || !entity.label) return;
        const pos = Cesium.Property.getValueOrDefault(entity.position, scene.time);
        const visible = isVisibleToCamera(pos);
        entity.label.show = visible;
        if (entity.billboard) entity.billboard.show = visible;
    });
});