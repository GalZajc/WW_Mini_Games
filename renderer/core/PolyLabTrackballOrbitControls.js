import * as THREE from '../../node_modules/three/build/three.module.js';

/**
 * PolyLab-style virtual-trackball orbit, isolated from object-editing gestures.
 *
 * This is the ROTATE part of Three.js TrackballControls with the same pointer
 * projection and quaternion update. The caller chooses the mouse button; the
 * Rubik cuboid reserves left drag for slices and maps orbit to right drag.
 */
export class PolyLabTrackballOrbitControls {

    constructor(camera, domElement, {
        button = 2,
        rotateSpeed = 4,
        zoomSpeed = 1.3,
        minDistance = 0,
        maxDistance = Infinity,
        target = new THREE.Vector3(),
        onDragStateChange = null,
    } = {}) {
        this.camera = camera;
        this.domElement = domElement;
        this.button = button;
        this.rotateSpeed = rotateSpeed;
        this.zoomSpeed = zoomSpeed;
        this.minDistance = minDistance;
        this.maxDistance = maxDistance;
        this.target = target.clone();
        this.enabled = true;
        this.dragging = false;
        this.pointerId = null;
        this.onDragStateChange = onDragStateChange;

        this.screen = { left: 0, top: 0, width: 1, height: 1 };
        this._eye = new THREE.Vector3();
        this._movePrev = new THREE.Vector2();
        this._moveCurr = new THREE.Vector2();
        this._moveDirection = new THREE.Vector3();
        this._eyeDirection = new THREE.Vector3();
        this._upDirection = new THREE.Vector3();
        this._sideDirection = new THREE.Vector3();
        this._axis = new THREE.Vector3();
        this._quaternion = new THREE.Quaternion();
        this._zoomStart = new THREE.Vector2();
        this._zoomEnd = new THREE.Vector2();

        this._pointerDown = event => this._onPointerDown(event);
        this._pointerMove = event => this._onPointerMove(event);
        this._pointerUp = event => this._onPointerUp(event);
        this._pointerCancel = event => this._onPointerUp(event);
        this._contextMenu = event => {
            if (this.button === 2) event.preventDefault();
        };
        this._mouseWheel = event => this._onMouseWheel(event);

        this.handleResize();
        this.domElement.addEventListener('pointerdown', this._pointerDown);
        this.domElement.addEventListener('wheel', this._mouseWheel, { passive: false });
        this.domElement.addEventListener('contextmenu', this._contextMenu);
    }

    handleResize() {
        const rect = this.domElement.getBoundingClientRect();
        const documentElement = this.domElement.ownerDocument.documentElement;
        this.screen.left = rect.left + window.pageXOffset - documentElement.clientLeft;
        this.screen.top = rect.top + window.pageYOffset - documentElement.clientTop;
        this.screen.width = Math.max(1, rect.width);
        this.screen.height = Math.max(1, rect.height);
    }

    _mouseOnCircle(pageX, pageY) {
        return new THREE.Vector2(
            (pageX - this.screen.width * 0.5 - this.screen.left) / (this.screen.width * 0.5),
            (this.screen.height + 2 * (this.screen.top - pageY)) / this.screen.width,
        );
    }

    _onPointerDown(event) {
        if (!this.enabled || this.dragging || event.button !== this.button) return;
        event.preventDefault();
        this.handleResize();
        this.dragging = true;
        this.pointerId = event.pointerId;
        this._moveCurr.copy(this._mouseOnCircle(event.pageX, event.pageY));
        this._movePrev.copy(this._moveCurr);
        this.domElement.setPointerCapture?.(event.pointerId);
        this.domElement.addEventListener('pointermove', this._pointerMove);
        this.domElement.addEventListener('pointerup', this._pointerUp);
        this.domElement.addEventListener('pointercancel', this._pointerCancel);
        this.onDragStateChange?.(true);
    }

    _onPointerMove(event) {
        if (!this.enabled || !this.dragging || event.pointerId !== this.pointerId) return;
        event.preventDefault();
        this._movePrev.copy(this._moveCurr);
        this._moveCurr.copy(this._mouseOnCircle(event.pageX, event.pageY));
        this.update();
    }

    _onPointerUp(event) {
        if (!this.dragging || (event.pointerId !== undefined && event.pointerId !== this.pointerId)) return;
        if (this.pointerId !== null && this.domElement.hasPointerCapture?.(this.pointerId)) {
            this.domElement.releasePointerCapture(this.pointerId);
        }
        this.dragging = false;
        this.pointerId = null;
        this.domElement.removeEventListener('pointermove', this._pointerMove);
        this.domElement.removeEventListener('pointerup', this._pointerUp);
        this.domElement.removeEventListener('pointercancel', this._pointerCancel);
        this.onDragStateChange?.(false);
    }

    _onMouseWheel(event) {
        if (!this.enabled) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.deltaMode === 2) this._zoomStart.y -= event.deltaY * 0.025;
        else if (event.deltaMode === 1) this._zoomStart.y -= event.deltaY * 0.01;
        else this._zoomStart.y -= event.deltaY * 0.00025;
        this.update();
    }

    _zoomCamera() {
        const factor = 1 + (this._zoomEnd.y - this._zoomStart.y) * this.zoomSpeed;
        if (factor > 0 && factor !== 1) {
            this._eye.copy(this.camera.position).sub(this.target).multiplyScalar(factor);
            const distance = THREE.MathUtils.clamp(
                this._eye.length(),
                this.minDistance,
                this.maxDistance,
            );
            this._eye.setLength(distance);
            this.camera.position.addVectors(this.target, this._eye);
        }
        this._zoomStart.copy(this._zoomEnd);
    }

    update() {
        if (!this.enabled) return;
        this._moveDirection.set(
            this._moveCurr.x - this._movePrev.x,
            this._moveCurr.y - this._movePrev.y,
            0,
        );
        let angle = this._moveDirection.length();
        if (angle > 0) {
            this._eye.copy(this.camera.position).sub(this.target);
            this._eyeDirection.copy(this._eye).normalize();
            this._upDirection.copy(this.camera.up).normalize();
            this._sideDirection.crossVectors(this._upDirection, this._eyeDirection).normalize();
            this._upDirection.setLength(this._moveCurr.y - this._movePrev.y);
            this._sideDirection.setLength(this._moveCurr.x - this._movePrev.x);
            this._moveDirection.copy(this._upDirection.add(this._sideDirection));
            this._axis.crossVectors(this._moveDirection, this._eye).normalize();
            angle *= this.rotateSpeed;
            this._quaternion.setFromAxisAngle(this._axis, angle);
            this._eye.applyQuaternion(this._quaternion);
            this.camera.up.applyQuaternion(this._quaternion).normalize();
            this.camera.position.addVectors(this.target, this._eye);
            this._movePrev.copy(this._moveCurr);
        }
        this._zoomCamera();
        this.camera.lookAt(this.target);
        this.camera.updateMatrixWorld(true);
    }

    cancel() {
        this._onPointerUp({ pointerId: this.pointerId });
    }

    dispose() {
        this.cancel();
        this.domElement.removeEventListener('pointerdown', this._pointerDown);
        this.domElement.removeEventListener('wheel', this._mouseWheel);
        this.domElement.removeEventListener('contextmenu', this._contextMenu);
    }
}
