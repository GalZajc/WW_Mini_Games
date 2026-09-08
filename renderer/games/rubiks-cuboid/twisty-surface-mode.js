import { NetNavigation, resizeNet } from './net-navigation.js';
import { PuzzleHistory } from './puzzle-history.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import { PolyLabTrackballOrbitControls } from '../../core/PolyLabTrackballOrbitControls.js';
import { POLYHEDRON_GEOMETRY, roundedSticker } from './polyhedron-geometry.js';
import { dragSliceChoices, PUZZLE_PRESENTATION } from './puzzle-interaction.js';
import { SliceChoiceOverlay } from './slice-choice-overlay.js';
import {
    PolyhedronPuzzleModel,
    TorusPuzzleModel,
    TWISTY_MODE_INFO,
    disposePuzzleModel,
} from './twisty-models.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TURN_SOUND_URL = new URL('./assets/turn-click.wav', import.meta.url).href;
const RELEASE_SOUND_URL = new URL('./assets/turn-release.wav', import.meta.url).href;

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}

function torusFrame(uAngle, vAngle, majorRadius = 3, minorRadius = 1.35) {
    const radial = majorRadius + minorRadius * Math.cos(vAngle);
    const center = new THREE.Vector3(
        radial * Math.cos(uAngle),
        radial * Math.sin(uAngle),
        minorRadius * Math.sin(vAngle),
    );
    const tangentU = new THREE.Vector3(-Math.sin(uAngle), Math.cos(uAngle), 0).normalize();
    const tangentV = new THREE.Vector3(
        -Math.sin(vAngle) * Math.cos(uAngle),
        -Math.sin(vAngle) * Math.sin(uAngle),
        Math.cos(vAngle),
    ).normalize();
    const normal = new THREE.Vector3().crossVectors(tangentU, tangentV).normalize();
    const rotation = new THREE.Matrix4().makeBasis(tangentU, tangentV, normal);
    return { center, tangentU, tangentV, normal, quaternion: new THREE.Quaternion().setFromRotationMatrix(rotation) };
}

function createTorusPatchGeometry(uAngle, vAngle, uSpan, vSpan) {
    const segmentsU = 5;
    const segmentsV = 4;
    const positions = [];
    const indices = [];
    for (let row = 0; row <= segmentsV; row++) {
        const v = vAngle + (row / segmentsV - 0.5) * vSpan;
        for (let column = 0; column <= segmentsU; column++) {
            const u = uAngle + (column / segmentsU - 0.5) * uSpan;
            const frame = torusFrame(u, v);
            const point = frame.center.addScaledVector(frame.normal, 0.045);
            positions.push(point.x, point.y, point.z);
        }
    }
    for (let row = 0; row < segmentsV; row++) {
        for (let column = 0; column < segmentsU; column++) {
            const a = row * (segmentsU + 1) + column;
            const b = a + 1;
            const c = a + segmentsU + 1;
            const d = c + 1;
            indices.push(a, b, d, a, d, c);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

function updateTorusPatchGeometry(geometry, uAngle, vAngle, uSpan, vSpan) {
    const position = geometry.attributes.position;
    const columns = 6;
    const rows = 5;
    let index = 0;
    for (let row = 0; row < rows; row++) {
        const v = vAngle + (row / (rows - 1) - 0.5) * vSpan;
        for (let column = 0; column < columns; column++) {
            const u = uAngle + (column / (columns - 1) - 0.5) * uSpan;
            const frame = torusFrame(u, v);
            const point = frame.center.addScaledVector(frame.normal, 0.045);
            position.setXYZ(index++, point.x, point.y, point.z);
        }
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
}

function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
        const a = polygon[current];
        const b = polygon[previous];
        if (((a[1] > y) !== (b[1] > y))
            && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) {
            inside = !inside;
        }
    }
    return inside;
}

function netVertexKey(vertex) {
    return `${Math.round(vertex.x * 100000)},${Math.round(vertex.y * 100000)},${Math.round(vertex.z * 100000)}`;
}

function faceLocalPoint(face, vertex) {
    const relative = vertex.clone().sub(face.center);
    return [relative.dot(face.basisU), relative.dot(face.basisV)];
}

function transformNetPoint(placement, point) {
    return [
        placement.offset[0] + placement.matrix[0] * point[0] + placement.matrix[1] * point[1],
        placement.offset[1] + placement.matrix[2] * point[0] + placement.matrix[3] * point[1],
    ];
}

function polygonBounds(polygons) {
    const points = polygons.flat();
    return {
        minX: Math.min(...points.map(point => point[0])),
        maxX: Math.max(...points.map(point => point[0])),
        minY: Math.min(...points.map(point => point[1])),
        maxY: Math.max(...points.map(point => point[1])),
    };
}

function polygonsOverlapInside(first, second, epsilon = 1e-5) {
    const axes = [];
    for (const polygon of [first, second]) {
        for (let index = 0; index < polygon.length; index++) {
            const start = polygon[index];
            const end = polygon[(index + 1) % polygon.length];
            const axis = [-(end[1] - start[1]), end[0] - start[0]];
            const length = Math.hypot(axis[0], axis[1]);
            if (length > 1e-9) axes.push([axis[0] / length, axis[1] / length]);
        }
    }
    return axes.every(axis => {
        const firstProjection = first.map(point => point[0] * axis[0] + point[1] * axis[1]);
        const secondProjection = second.map(point => point[0] * axis[0] + point[1] * axis[1]);
        const overlap = Math.min(Math.max(...firstProjection), Math.max(...secondProjection))
            - Math.max(Math.min(...firstProjection), Math.min(...secondProjection));
        return overlap > epsilon;
    });
}

function createFaceAdjacency(faces) {
    const adjacency = new Map(faces.map(face => [face.faceIndex, []]));
    for (let firstIndex = 0; firstIndex < faces.length; firstIndex++) {
        const first = faces[firstIndex];
        const firstVertices = new Map(first.vertices.map(vertex => [netVertexKey(vertex), vertex]));
        for (let secondIndex = firstIndex + 1; secondIndex < faces.length; secondIndex++) {
            const second = faces[secondIndex];
            const secondVertices = new Map(second.vertices.map(vertex => [netVertexKey(vertex), vertex]));
            const sharedKeys = [...firstVertices.keys()].filter(key => secondVertices.has(key));
            if (sharedKeys.length !== 2) continue;
            adjacency.get(first.faceIndex).push({
                faceIndex: second.faceIndex,
                sharedKeys,
            });
            adjacency.get(second.faceIndex).push({
                faceIndex: first.faceIndex,
                sharedKeys,
            });
        }
    }
    return adjacency;
}

function placeNetNeighbor(parent, parentFace, childFace, sharedKeys) {
    const parentByKey = new Map(parentFace.vertices.map(vertex => [netVertexKey(vertex), vertex]));
    const childByKey = new Map(childFace.vertices.map(vertex => [netVertexKey(vertex), vertex]));
    const parentPoints = sharedKeys.map(key => transformNetPoint(parent, faceLocalPoint(parentFace, parentByKey.get(key))));
    const childPoints = sharedKeys.map(key => faceLocalPoint(childFace, childByKey.get(key)));
    const localEdge = [childPoints[1][0] - childPoints[0][0], childPoints[1][1] - childPoints[0][1]];
    const netEdge = [parentPoints[1][0] - parentPoints[0][0], parentPoints[1][1] - parentPoints[0][1]];
    const localLength = Math.hypot(localEdge[0], localEdge[1]);
    const netLength = Math.hypot(netEdge[0], netEdge[1]);
    if (localLength < 1e-8 || netLength < 1e-8) return null;
    const localUnit = [localEdge[0] / localLength, localEdge[1] / localLength];
    const localNormal = [-localUnit[1], localUnit[0]];
    const netUnit = [netEdge[0] / netLength, netEdge[1] / netLength];
    const netNormal = [-netUnit[1], netUnit[0]];
    const cross = (edge, point, origin) => edge[0] * (point[1] - origin[1])
        - edge[1] * (point[0] - origin[0]);
    const parentCenter = transformNetPoint(parent, [0, 0]);
    const parentSide = cross(netEdge, parentCenter, parentPoints[0]);

    const placements = [1, -1].map(sign => {
        const matrix = [
            netUnit[0] * localUnit[0] + sign * netNormal[0] * localNormal[0],
            netUnit[0] * localUnit[1] + sign * netNormal[0] * localNormal[1],
            netUnit[1] * localUnit[0] + sign * netNormal[1] * localNormal[0],
            netUnit[1] * localUnit[1] + sign * netNormal[1] * localNormal[1],
        ];
        const transformedShared = [
            matrix[0] * childPoints[0][0] + matrix[1] * childPoints[0][1],
            matrix[2] * childPoints[0][0] + matrix[3] * childPoints[0][1],
        ];
        const placement = {
            faceIndex: childFace.faceIndex,
            matrix,
            offset: [
                parentPoints[0][0] - transformedShared[0],
                parentPoints[0][1] - transformedShared[1],
            ],
            parentFaceIndex: parentFace.faceIndex,
        };
        placement.polygon = childFace.vertices.map(vertex =>
            transformNetPoint(placement, faceLocalPoint(childFace, vertex))
        );
        return placement;
    });
    return placements.find(placement => {
        const childSide = cross(netEdge, transformNetPoint(placement, [0, 0]), parentPoints[0]);
        return parentSide * childSide < -1e-7;
    }) || placements[0];
}

function buildConnectedPolyhedronNet(faces) {
    const facesByIndex = new Map(faces.map(face => [face.faceIndex, face]));
    const adjacency = createFaceAdjacency(faces);
    let explored = 0;

    const search = placements => {
        if (placements.size === faces.length) return true;
        if (++explored > 50000) return false;
        const candidates = [];
        const seen = new Set();
        for (const [parentFaceIndex, parent] of placements) {
            const parentFace = facesByIndex.get(parentFaceIndex);
            for (const edge of adjacency.get(parentFaceIndex) || []) {
                if (placements.has(edge.faceIndex)) continue;
                const childFace = facesByIndex.get(edge.faceIndex);
                const placement = placeNetNeighbor(parent, parentFace, childFace, edge.sharedKeys);
                if (!placement) continue;
                if ([...placements.values()].some(existing =>
                    polygonsOverlapInside(placement.polygon, existing.polygon)
                )) continue;
                const key = `${placement.faceIndex}:${placement.polygon.map(point => point.map(value => Math.round(value * 1000)).join(',')).join('|')}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const bounds = polygonBounds([...placements.values()].map(existing => existing.polygon).concat([placement.polygon]));
                const width = bounds.maxX - bounds.minX;
                const height = bounds.maxY - bounds.minY;
                const area = width * height;
                const fittedExtent = Math.max(width / 1.42, height);
                const placedNeighbors = (adjacency.get(placement.faceIndex) || [])
                    .filter(neighbor => placements.has(neighbor.faceIndex)).length;
                candidates.push({ placement, score: fittedExtent * fittedExtent + area * 0.015 - placedNeighbors * 0.02 });
            }
        }
        candidates.sort((first, second) => first.score - second.score
            || first.placement.faceIndex - second.placement.faceIndex);
        for (const candidate of candidates) {
            placements.set(candidate.placement.faceIndex, candidate.placement);
            if (search(placements)) return true;
            placements.delete(candidate.placement.faceIndex);
        }
        return false;
    };

    for (const rootFace of faces) {
        explored = 0;
        const root = {
            faceIndex: rootFace.faceIndex,
            matrix: [1, 0, 0, 1],
            offset: [0, 0],
            parentFaceIndex: null,
        };
        root.polygon = rootFace.vertices.map(vertex => faceLocalPoint(rootFace, vertex));
        const placements = new Map([[rootFace.faceIndex, root]]);
        if (search(placements)) return placements;
    }
    return null;
}

export class TwistySurfaceMode {

    constructor(host, mode) {
        this.host = host;
        this.mode = mode;
        this.canvas = host.canvas;
        this.audio = host.audio;
        this.settings = host.settings;
        this.phase = 'playing';
        this.elapsed = 0;
        this.moves = 0;
        this.runStarted = false;
        this.scoreSubmitted = false;
        this.drag = null;
        this.animation = null;
        this.bestMoves = null;
        this.dragPixelsPerStep = host.dragPixelsPerQuarter;
        this.animationSpeed = host.turnAnimationSpeed;
    }

    init() {
        if (this.mode === 'torus') {
            this.model = new TorusPuzzleModel(
                this.settings.torusU ?? 12,
                this.settings.torusV ?? 6,
                this.settings,
            );
            this.sizeText = `${this.model.uCount} × ${this.model.vCount}`;
        } else {
            const order = Math.round(Number(this.settings.polyhedronOrder ?? 2));
            this.model = new PolyhedronPuzzleModel(this.mode, order, 3);
            this.sizeText = `${TWISTY_MODE_INFO[this.mode].sizeLabel.toLowerCase()} ${order}`;
        }
        this.scoredRun = false;
        this.scrambleMoves = [];
        this.currentScore = this.model.score();

        this.audio?.loadSound?.('rubik-turn', TURN_SOUND_URL).catch(() => {});
        this.audio?.loadSound?.('rubik-release', RELEASE_SOUND_URL).catch(() => {});
        this._setupThree();
        this._createPuzzleMeshes();
        this._ensureHud();
        this._attachInput();
        this._refreshMeshes();
        this._loadBestRecord();
        this._renderHud();
        this._drawNet();
    }

    _setupThree() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.width, this.canvas.height, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = false;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x78cfff);
        this.camera = new THREE.PerspectiveCamera(
            44,
            this.canvas.width / Math.max(1, this.canvas.height),
            0.05,
            120,
        );
        const distance = this.mode === 'torus' ? 12.2 : 11.2;
        this.camera.position.set(distance * 0.58, distance * 0.42, distance * 0.72);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateMatrixWorld(true);
        this.trackball = new PolyLabTrackballOrbitControls(this.camera, this.canvas, {
            button: 2,
            rotateSpeed: 4,
            zoomSpeed: 1.3,
            minDistance: 4.4,
            maxDistance: 42,
            target: new THREE.Vector3(),
            onDragStateChange: dragging => {
                this.canvas.style.cursor = dragging ? 'grabbing' : 'default';
            },
        });
        this.scene.add(new THREE.AmbientLight(0xffffff, PUZZLE_PRESENTATION.whiteLightIntensity));
        this.puzzleGroup = new THREE.Group();
        this.scene.add(this.puzzleGroup);
        this.raycaster = new THREE.Raycaster();
        this.pointerNdc = new THREE.Vector2();
    }

    _createPuzzleMeshes() {
        this.model.faceColors = this.model.faceColors.map((color, index) => {
            const custom = this.settings[`faceColor${index}`];
            return this.mode !== 'torus' && /^#[0-9a-f]{6}$/i.test(custom || '') ? Number.parseInt(custom.slice(1), 16) : color;
        });
        this.slotMeshes = [];
        if (this.mode === 'torus') this._createTorusMeshes();
        else this._createPolyhedronMeshes();
    }

    _createPolyhedronMeshes() {
        // Uncut hull is a picking occluder, so even subpixel gaps between
        // separate plastic bodies cannot expose stickers on the far side.
        this.pieceBodyPositions = this.model.pieces.map(piece => {
            const positions = [];
            for (const face of piece.faces) {
                for (let index = 1; index < face.length - 1; index++) {
                    for (const point of [face[0], face[index], face[index + 1]]) {
                        const vertex = point.clone().sub(piece.center).multiplyScalar(POLYHEDRON_GEOMETRY.bodyScale).add(piece.center);
                        positions.push(vertex.x, vertex.y, vertex.z);
                    }
                }
            }
            return positions;
        });
        this.fullBodyGeometry = this._bodyGeometry(this.pieceBodyPositions.flat());
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.48, metalness: 0.04 });
        this.pickHull = new THREE.Mesh(this.model.baseGeometry, bodyMaterial);
        this.bodyRestMesh = new THREE.Mesh(this.fullBodyGeometry, bodyMaterial);
        this.bodyTurnMesh = new THREE.Mesh(this._bodyGeometry([]), bodyMaterial);
        this.bodyTurnMesh.visible = false;
        this.bodyAnimation = null;
        for (const body of [this.bodyRestMesh, this.bodyTurnMesh]) {
            body.castShadow = true;
            body.receiveShadow = true;
            this.puzzleGroup.add(body);
        }

        for (const slot of this.model.slots) {
            const localPositions = [];
            const outline = roundedSticker(slot.vertices);
            for (let index = 1; index < outline.length - 1; index++) {
                for (const vertex of [outline[0], outline[index], outline[index + 1]]) {
                    const local = vertex.clone().sub(slot.center);
                    localPositions.push(local.x, local.y, local.z);
                }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(localPositions, 3));
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({
                color: this.model.faceColors[this.model.colors[slot.id]],
                roughness: 0.36,
                metalness: 0.02,
                side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(slot.center);
            mesh.userData.slotIndex = slot.id;
            mesh.castShadow = true;
            this.slotMeshes.push(mesh);
            this.puzzleGroup.add(mesh);
        }
        // Keep the original meshes for exact picking and choice outlines;
        // draw the same triangles/material in one batch instead of one draw
        // call per sticker. No geometry simplification or resolution change.
        const vertexCount = this.slotMeshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0);
        const material = this.slotMeshes[0].material.clone();
        material.color.setHex(0xffffff);
        this.stickerBatch = new THREE.BatchedMesh(this.slotMeshes.length, vertexCount, 0, material);
        this.stickerBatch.castShadow = true;
        this.puzzleGroup.add(this.stickerBatch);
        for (const mesh of this.slotMeshes) {
            const id = this.stickerBatch.addInstance(this.stickerBatch.addGeometry(mesh.geometry));
            mesh.userData.batchId = id;
            mesh.updateMatrix();
            this.stickerBatch.setMatrixAt(id, mesh.matrix);
            this.stickerBatch.setColorAt(id, mesh.material.color);
            mesh.visible = false;
        }
    }

    _bodyGeometry(positions) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        return geometry;
    }

    _refreshPolyhedronBodies(animation, quaternion) {
        // Two draw calls for all plastic, even on a high-order minx. Rebuild
        // these batches only at the beginning/end of a turn, never per frame.
        if (this.bodyAnimation !== animation) {
            if (this.bodyRestMesh.geometry !== this.fullBodyGeometry) this.bodyRestMesh.geometry.dispose();
            this.bodyTurnMesh.geometry.dispose();
            if (animation) {
                const moving = [], stationary = [];
                this.pieceBodyPositions.forEach((positions, index) => {
                    const target = animation.selectedPieces.has(index) ? moving : stationary;
                    for (const value of positions) target.push(value);
                });
                this.bodyRestMesh.geometry = this._bodyGeometry(stationary);
                this.bodyTurnMesh.geometry = this._bodyGeometry(moving);
            } else {
                this.bodyRestMesh.geometry = this.fullBodyGeometry;
                this.bodyTurnMesh.geometry = this._bodyGeometry([]);
            }
            this.bodyAnimation = animation;
        }
        this.bodyTurnMesh.visible = Boolean(animation);
        if (animation) this.bodyTurnMesh.quaternion.copy(quaternion);
    }

    _createTorusMeshes() {
        const majorRadius = 3;
        const minorRadius = 1.35;
        const body = new THREE.Mesh(
            new THREE.TorusGeometry(majorRadius, minorRadius, 48, 112),
            new THREE.MeshStandardMaterial({ color: 0x090b10, roughness: 0.72, metalness: 0.05 }),
        );
        body.castShadow = true;
        body.receiveShadow = true;
        this.puzzleGroup.add(body);
        this.torusBody = body;
        for (const slot of this.model.slots) {
            const uAngle = (slot.u + 0.5) / this.model.uCount * Math.PI * 2;
            const vAngle = (slot.v + 0.5) / this.model.vCount * Math.PI * 2;
            const uSpan = Math.PI * 2 / this.model.uCount * 0.965;
            const vSpan = Math.PI * 2 / this.model.vCount * 0.965;
            const geometry = createTorusPatchGeometry(uAngle, vAngle, uSpan, vSpan);
            const material = new THREE.MeshStandardMaterial({
                color: this.model.faceColors[this.model.colors[slot.id]],
                roughness: 0.34,
                metalness: 0.02,
                side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.slotIndex = slot.id;
            mesh.userData.baseU = uAngle;
            mesh.userData.baseV = vAngle;
            mesh.userData.uSpan = uSpan;
            mesh.userData.vSpan = vSpan;
            mesh.castShadow = true;
            this.slotMeshes.push(mesh);
            this.puzzleGroup.add(mesh);
        }
    }

    _refreshMeshes() {
        if (this.mode === 'torus') this._refreshTorusMeshes();
        else this._refreshPolyhedronMeshes();
    }

    _refreshPolyhedronMeshes() {
        const animation = this.animation;
        const eased = animation ? animation.progress * animation.progress * (3 - 2 * animation.progress) : 0;
        const quaternion = animation
            ? new THREE.Quaternion().setFromAxisAngle(animation.axis, animation.angle * eased)
            : null;
        this._refreshPolyhedronBodies(animation, quaternion);
        for (const slot of this.model.slots) {
            const mesh = this.slotMeshes[slot.id];
            const selected = animation?.selectedSet.has(slot.id);
            const colorIndex = selected ? animation.oldColors[slot.id] : this.model.colors[slot.id];
            mesh.material.color.setHex(this.model.faceColors[colorIndex]);
            mesh.position.copy(slot.center);
            mesh.quaternion.identity();
            if (selected) {
                mesh.position.applyQuaternion(quaternion);
                mesh.quaternion.copy(quaternion);
            }
            if (this.stickerBatch) {
                mesh.updateMatrix();
                this.stickerBatch.setMatrixAt(mesh.userData.batchId, mesh.matrix);
                this.stickerBatch.setColorAt(mesh.userData.batchId, mesh.material.color);
            }
        }
    }

    _refreshTorusMeshes() {
        const animation = this.animation;
        const eased = animation ? animation.progress * animation.progress * (3 - 2 * animation.progress) : 0;
        for (const slot of this.model.slots) {
            const mesh = this.slotMeshes[slot.id];
            const selected = animation?.selectedSet.has(slot.id);
            const colorIndex = selected ? animation.oldColors[slot.id] : this.model.colors[slot.id];
            mesh.material.color.setHex(this.model.faceColors[colorIndex]);
            let uAngle = mesh.userData.baseU;
            let vAngle = mesh.userData.baseV;
            if (selected) {
                if (animation.axisName === 'u') {
                    uAngle += animation.turns * Math.PI * 2 / this.model.uCount * eased;
                } else {
                    vAngle += animation.turns * Math.PI * 2 / this.model.vCount * eased;
                }
            }
            updateTorusPatchGeometry(
                mesh.geometry,
                uAngle,
                vAngle,
                mesh.userData.uSpan,
                mesh.userData.vSpan,
            );
        }
    }

    _attachInput() {
        this._mouseDown = event => {
            if (event.button !== 0 || this.phase !== 'playing' || this.animation) return;
            const slotIndex = this._pickSlot(event.clientX, event.clientY);
            if (this._resumeSliceChoice(event, '3d', slotIndex)) return;
            if (slotIndex === null) return;
            event.preventDefault();
            this._startDrag(slotIndex, event.clientX, event.clientY);
        };
        this._mouseMove = event => {
            if (this.netResizing) {
                this._updateNetResize(event);
                return;
            }
            if (this.drag?.pointerDown) this._updateDrag(event.clientX, event.clientY);
        };
        this._mouseUp = event => {
            if (event.button === 0 && this.netResizing) {
                this.netResizing = null;
                return;
            }
            if (event.button === 0 && this.drag) {
                this.drag.pointerDown = false;
                // Release the original field, then grab an exclusive field.
                if (this.drag.choices) return;
                this._finishDrag();
            }
        };
        this.canvas.addEventListener('mousedown', this._mouseDown);
        window.addEventListener('mousemove', this._mouseMove);
        window.addEventListener('mouseup', this._mouseUp);

    }

    _pickSlot(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointerNdc.set(
            (clientX - rect.left) / rect.width * 2 - 1,
            -(clientY - rect.top) / rect.height * 2 + 1,
        );
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        // Plastic is opaque to picking too, including the gaps at sticker corners.
        const bodies = this.mode === 'torus' ? [this.torusBody] : [this.bodyRestMesh, this.bodyTurnMesh];
        const hits = this.raycaster.intersectObjects([...this.slotMeshes, ...bodies.filter(body => body?.visible)], false);
        if (this.pickHull && this.mode !== 'torus' && !this.animation && hits.length) {
            this.pickHull.matrixWorld.copy(this.puzzleGroup.matrixWorld);
            const hullHit = this.raycaster.intersectObject(this.pickHull, false)[0];
            if (hullHit && hits[0].distance > hullHit.distance + 1e-5) return null;
        }
        return hits.length ? hits[0].object.userData.slotIndex ?? null : null;
    }

    _projectDirection(point, tangent) {
        const first = point.clone().project(this.camera);
        const second = point.clone().addScaledVector(tangent, 0.45).project(this.camera);
        const rect = this.canvas.getBoundingClientRect();
        const direction = new THREE.Vector2(
            (second.x - first.x) * rect.width * 0.5,
            -(second.y - first.y) * rect.height * 0.5,
        );
        return direction.lengthSq() > 1e-8 ? direction.normalize() : null;
    }

    _netPolyhedronDirection(tangent, face) {
        if (!face) return null;
        const localU = tangent.dot(face.basisU);
        const localV = tangent.dot(face.basisV);
        const matrix = face.netMatrix || [1, 0, 0, 1];
        const direction = new THREE.Vector2(
            matrix[0] * localU + matrix[1] * localV,
            -(matrix[2] * localU + matrix[3] * localV),
        );
        return direction.lengthSq() > 1e-8 ? direction.normalize() : null;
    }

    _startDrag(slotIndex, clientX, clientY, source = '3d', netFace = null) {
        this._clearSliceChoice();
        const candidates = [];
        if (this.mode === 'torus') {
            const slot = this.model.slots[slotIndex];
            const mesh = this.slotMeshes[slotIndex];
            const frame = torusFrame(mesh.userData.baseU, mesh.userData.baseV);
            const point = frame.center.clone().addScaledVector(frame.normal, 0.045);
            for (const candidate of this.model.candidatesForSlot(slotIndex)) {
                const tangent = candidate.axis === 'u' ? frame.tangentU : frame.tangentV;
                const direction = source === 'net'
                    ? new THREE.Vector2(candidate.axis === 'u' ? 1 : 0, candidate.axis === 'v' ? 1 : 0)
                    : this._projectDirection(point, tangent);
                if (direction) candidates.push({ ...candidate, direction });
            }
        } else {
            const slot = this.model.slots[slotIndex];
            for (const candidate of this.model.candidatesForSlot(slotIndex)) {
                const direction = source === 'net'
                    ? this._netPolyhedronDirection(candidate.tangent, netFace)
                    : this._projectDirection(slot.center, candidate.tangent);
                if (direction) candidates.push({ ...candidate, direction });
            }
        }
        if (candidates.length < 1) return;
        this.runStarted = Boolean(this.scoredRun);
        this.drag = {
            slotIndex,
            startX: clientX,
            startY: clientY,
            source,
            netFace,
            pointerDown: true,
            lastX: clientX,
            lastY: clientY,
            candidates,
            chosen: null,
            steps: 0,
            appliedSteps: 0,
            appliedKey: '',
        };
        this._updateDrag(clientX, clientY);
    }

    _updateDrag(clientX, clientY) {
        const drag = this.drag;
        drag.lastX = clientX;
        drag.lastY = clientY;
        if (drag.choices) return;
        const delta = new THREE.Vector2(clientX - drag.startX, clientY - drag.startY);
        let chosen = drag.chosen;
        if (!chosen) {
            const tips = drag.candidates.filter(candidate => candidate.cornerTip);
            const choices = dragSliceChoices(tips.length ? tips : drag.candidates, delta.x, delta.y);
            if (choices.length > 1 && this.mode === 'octahedron' && !tips.length) {
                drag.choices = choices;
                this.sliceChoiceOverlay = new SliceChoiceOverlay(this, choices);
                return;
            }
            chosen = choices[0];
        }
        if (!chosen) return;
        const key = this.mode === 'torus'
            ? `${chosen.axis}:${chosen.layer}`
            : `${chosen.axisIndex}:${chosen.layer}`;
        const projected = delta.dot(chosen.direction);
        const steps = clamp(Math.round(projected / this.dragPixelsPerStep), -12, 12);
        drag.chosen = chosen;
        drag.appliedKey = key;
        drag.steps = steps;
        const stepDelta = steps - drag.appliedSteps;
        if (stepDelta !== 0) {
            drag.hasRotated = true;
            this._clearSliceChoice();
            this._applyAnimatedMove(chosen, stepDelta);
            drag.appliedSteps = steps;
        }
    }

    _clearSliceChoice() {
        this.sliceChoiceOverlay?.dispose();
        this.sliceChoiceOverlay = null;
        if (this.netCanvas) this._drawNet();
    }

    _resumeSliceChoice(event, source, slotIndex, face = null) {
        const choices = this.drag?.choices;
        if (!choices) return false;
        event.preventDefault();
        const matches = slotIndex === null || slotIndex === undefined ? []
            : choices.filter(choice => choice.move.selectedSet.has(slotIndex));
        if (matches.length === 1) {
            const selected = matches[0];
            this._startDrag(slotIndex, event.clientX, event.clientY, source, face);
            this.drag.chosen = this.drag.candidates.find(candidate => candidate.axisIndex === selected.axisIndex && candidate.layer === selected.layer);
        } else if (!matches.length) {
            this.drag = null;
            this._clearSliceChoice();
        }
        return true;
    }

    _applyAnimatedMove(candidate, turns) {
        this._finishAnimationImmediately();
        const oldColors = [...this.model.colors];
        let applied = false;
        let selected;
        let angle = 0;
        if (this.mode === 'torus') {
            applied = this.model.applyMove(candidate.axis, candidate.layer, turns);
            selected = this.model.slots
                .filter(slot => candidate.axis === 'u' ? slot.v === candidate.layer : slot.u === candidate.layer)
                .map(slot => slot.id);
        } else {
            applied = this.model.applyMove(candidate.axisIndex, candidate.layer, turns);
            selected = candidate.move.selected;
            angle = turns * Math.PI * 2 / candidate.move.turnOrder;
        }
        if (!applied) return false;
        const selectedSet = new Set(selected);
        const degrees = this.mode === 'torus'
            ? Math.abs(turns) * 360 / (candidate.axis === 'u' ? this.model.uCount : this.model.vCount)
            : Math.abs(THREE.MathUtils.radToDeg(angle));
        this.animation = {
            oldColors,
            selectedSet,
            selectedPieces: new Set(candidate.move?.selectedPieces || []),
            axis: candidate.axis?.isVector3 ? candidate.axis.clone() : candidate.move?.axis.clone(),
            axisName: candidate.axis,
            layer: candidate.layer,
            angle,
            turns,
            elapsed: 0,
            duration: Math.max(0.025, degrees / this.animationSpeed),
            progress: 0,
        };
        this._refreshMeshes();
        this._drawNet();
        this.audio?.playSound?.('rubik-turn', { volume: 0.34 });
        return true;
    }

    _finishAnimationImmediately() {
        if (!this.animation) return;
        this.animation.progress = 1;
        this._refreshMeshes();
        this.animation = null;
        this._refreshMeshes();
    }

    _finishDrag() {
        this._clearSliceChoice();
        const drag = this.drag;
        this.drag = null;
        this.audio?.playSound?.('rubik-release', { volume: 0.32 });
        if (!drag?.chosen || drag.appliedSteps === 0) return;
        const turnOrder = this.mode === 'torus'
            ? (drag.chosen.axis === 'u' ? this.model.uCount : this.model.vCount)
            : drag.chosen.move.turnOrder;
        const normalized = ((drag.appliedSteps % turnOrder) + turnOrder) % turnOrder;
        if (normalized === 0) return;
        if (this.scoredRun) this.moves++;
        this.history.record({ axis: this.mode === 'torus' ? drag.chosen.axis : drag.chosen.axisIndex, layer: drag.chosen.layer, turns: drag.appliedSteps });
        this.currentScore = this.model.score();
        this._renderHud();
        if (this.currentScore === this.model.maximumScore) this._completeRun();
    }

    _completeRun() {
        if (this.phase !== 'playing' || !this.scoredRun) return;
        this.phase = 'complete';
        this.bestMoves = this.bestMoves === null ? this.moves : Math.min(this.bestMoves, this.moves);
        if (!this.scoreSubmitted) {
            this.host.submitScore({
                score: this.currentScore,
                maximumScore: this.model.maximumScore,
                moves: this.moves,
                seconds: Number(this.elapsed.toFixed(3)),
                mode: this.mode,
                scrambleSeed: this.scrambleSeed,
                scrambleMoveCount: this.scrambleMoves.length,
                scrambleVerified: this.model.scrambleVerified,
            });
            this.scoreSubmitted = true;
        }
        this._renderHud();
    }

    _resetSolved() { this._newScramble(false); }

    _newScramble(shuffle = true) {
        this.history?.clear();
        this._clearSliceChoice();
        this._finishAnimationImmediately();
        this.drag = null;
        if (this.mode === 'torus') {
            this.model = new TorusPuzzleModel(this.model.uCount, this.model.vCount, this.settings);
        } else {
            disposePuzzleModel(this.model);
            this.model = new PolyhedronPuzzleModel(this.mode, this.model.order, 3);
        }
        this.scoredRun = shuffle;
        this.scrambleSeed = shuffle ? makeSeed() : null;
        this.scrambleMoves = shuffle ? this.model.scramble(this.scrambleSeed) : [];
        this.currentScore = this.model.score();
        this.phase = 'playing';
        this.elapsed = 0;
        this.moves = 0;
        this.runStarted = false;
        this.scoreSubmitted = false;
        this._rebuildPuzzleMeshes();
        this._renderHud();
    }

    _rebuildPuzzleMeshes() {
        this.stickerBatch?.dispose();
        this.stickerBatch = null;
        this.fullBodyGeometry?.dispose();
        for (const mesh of this.slotMeshes || []) {
            mesh.geometry?.dispose?.();
            mesh.material?.dispose?.();
            this.puzzleGroup.remove(mesh);
        }
        for (const child of [...this.puzzleGroup.children]) {
            child.geometry?.dispose?.();
            child.material?.dispose?.();
            this.puzzleGroup.remove(child);
        }
        this._createPuzzleMeshes();
        this.polyhedronNetLayout = null;
        this._refreshMeshes();
        this._drawNet();
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = `position:fixed;inset:0;z-index:760;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#242b27;`;
        this.hud.innerHTML = `
            <div data-run-panel style="position:absolute;top:14px;left:14px;z-index:1;min-width:294px;"><div data-run-info style="padding:12px 15px;border:2px solid #5e6661;border-radius:14px;background:#aeb4b0;color:#3f4b43;box-shadow:0 12px 30px rgba(35,55,44,.22);">
                <div data-title style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#3f4b43;"></div>
                <div data-score style="margin-top:3px;font-size:34px;font-weight:900;line-height:1.08;">0 / 0</div>
                <div data-percent style="font-size:12px;color:#3f4b43;"></div>
                <div data-run style="margin-top:6px;font-size:12px;color:#3f4b43;"></div>
                <div data-best style="margin-top:3px;font-size:11px;color:#3f4b43;">Best: —</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;pointer-events:auto;">
                <button data-shuffle style="padding:7px 10px;border:2px solid #5e6661;border-radius:10px;background:#aeb4b0;color:#3f4b43;font:inherit;font-size:12px;cursor:pointer;">Shuffle</button>
                <button data-solve style="padding:7px 10px;border:2px solid #5e6661;border-radius:10px;background:#aeb4b0;color:#3f4b43;font:inherit;font-size:12px;cursor:pointer;">Solve</button>
            </div></div>
            <div data-net-panel style="position:absolute;top:14px;right:14px;width:350px;height:270px;min-width:150px;min-height:100px;box-sizing:border-box;border:2px solid #5e6661;border-radius:14px;background:rgba(201,206,202,.96);box-shadow:0 12px 32px rgba(35,55,44,.24);pointer-events:auto;overflow:hidden;">
                <div style="height:25px;padding:6px 10px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#3f4b43;border-bottom:1px solid #8c948f;">Live unfolded map · drag pieces here too</div>
                <canvas data-net-canvas style="display:block;width:100%;height:calc(100% - 25px);cursor:grab;"></canvas>
                <div data-net-resize title="Drag to resize" style="position:absolute;left:0;bottom:0;width:18px;height:18px;cursor:nesw-resize;background:linear-gradient(135deg,transparent 45%,rgba(255,255,255,.48) 46%,rgba(255,255,255,.48) 54%,transparent 55%);"></div>
            </div>
            <div data-complete style="display:none;position:absolute;inset:0;place-items:center;pointer-events:auto;background:rgba(35,55,44,.28);">
                <div style="width:min(390px,calc(100vw - 32px));padding:22px;border-radius:20px;background:rgba(225,230,226,.98);border:2px solid #5e6661;text-align:center;box-shadow:0 24px 70px rgba(35,55,44,.34);color:#242b27;">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.15em;color:#72f0b2;">Solved</div>
                    <div data-complete-score style="margin-top:8px;font-size:34px;font-weight:900;"></div>
                    <div data-complete-time style="margin-top:5px;font-size:14px;color:#59635d;"></div>
                    <button data-new type="button" style="margin-top:16px;width:100%;padding:10px;border:2px solid #18771f;border-radius:12px;background:linear-gradient(#69d84e,#24952d);color:white;font-size:13px;font-weight:800;cursor:pointer;">New scramble</button>
                </div>
            </div>`;
        document.body.appendChild(this.hud);
        this.hud.querySelector('[data-shuffle]').onclick = () => this._newScramble();
        this.hud.querySelector('[data-solve]').onclick = () => this._resetSolved();
        this.titleElement = this.hud.querySelector('[data-title]');
        this.scoreElement = this.hud.querySelector('[data-score]');
        this.percentElement = this.hud.querySelector('[data-percent]');
        this.runElement = this.hud.querySelector('[data-run]');
        this.bestElement = this.hud.querySelector('[data-best]');
        this.completeElement = this.hud.querySelector('[data-complete]');
        this.completeScoreElement = this.hud.querySelector('[data-complete-score]');
        this.completeTimeElement = this.hud.querySelector('[data-complete-time]');
        this.netPanel = this.hud.querySelector('[data-net-panel]');
        this.netCanvas = this.hud.querySelector('[data-net-canvas]');
        this.netResizeHandle = this.hud.querySelector('[data-net-resize]');
        this.netNavigation = new NetNavigation(this);
        this.history = new PuzzleHistory(this, (move, sign) => this.model.applyMove(move.axis, move.layer, sign * move.turns), () => { this._refreshMeshes(); this._drawNet(); });
        this._newClick = () => this._newScramble();
        this._netMouseDown = event => {
            if (event.button !== 0 || this.phase !== 'playing') return;

            const rect = this.netCanvas.getBoundingClientRect();
            const [x, y] = this.netNavigation.point(event.clientX - rect.left, event.clientY - rect.top);
            const hit = this.netHitCells?.find(cell => pointInPolygon(x, y, cell.polygon));
            if (this._resumeSliceChoice(event, 'net', hit?.slotIndex ?? null, hit?.face)) return;
            if (!hit) return;
            event.preventDefault();
            event.stopPropagation();
            this._startDrag(hit.slotIndex, event.clientX, event.clientY, 'net', hit.face);
        };
        this._netResizeDown = event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = this.netPanel.getBoundingClientRect();
            this.netResizing = {
                startX: event.clientX,
                startY: event.clientY,
                width: rect.width,
                height: rect.height,
            };
        };
        this.hud.querySelector('[data-new]').addEventListener('click', this._newClick);
        this.netCanvas.addEventListener('mousedown', this._netMouseDown);
        this.netResizeHandle.addEventListener('mousedown', this._netResizeDown);
    }

    _updateNetResize(event) { resizeNet(this, event); }

    _drawNet() {
        if (!this.netCanvas || !this.model) return;
        const rect = this.netCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        const width = Math.max(1, Math.round(rect.width * pixelRatio));
        const height = Math.max(1, Math.round(rect.height * pixelRatio));
        if (this.netCanvas.width !== width || this.netCanvas.height !== height) {
            this.netCanvas.width = width;
            this.netCanvas.height = height;
        }
        const ctx = this.netCanvas.getContext('2d');
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.fillStyle = '#aeb4b0';
        ctx.fillRect(0, 0, rect.width, rect.height);
        this.netNavigation?.transform(ctx);
        this.netHitCells = [];
        if (this.mode === 'torus') this._drawTorusNet(ctx, rect.width, rect.height);
        else this._drawPolyhedronNet(ctx, rect.width, rect.height);
        this.sliceChoiceOverlay?.drawNet(ctx);
    }

    _drawTorusNet(ctx, width, height) {
        const padding = 13;
        const cell = Math.max(2, Math.min(
            (width - padding * 2) / this.model.uCount,
            (height - padding * 2) / this.model.vCount,
        ));
        const originX = (width - cell * this.model.uCount) * 0.5;
        const originY = (height - cell * this.model.vCount) * 0.5;
        for (const slot of this.model.slots) {
            const x = originX + slot.u * cell;
            const y = originY + slot.v * cell;
            ctx.fillStyle = `#${this.model.faceColors[this.model.colors[slot.id]].toString(16).padStart(6, '0')}`;
            ctx.fillRect(x, y, cell, cell);
            ctx.strokeStyle = 'rgba(7,9,12,.88)';
            ctx.lineWidth = Math.max(1, cell * 0.055);
            ctx.strokeRect(x, y, cell, cell);
            this.netHitCells.push({
                slotIndex: slot.id,
                face: null,
                polygon: [[x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell]],
            });
        }
        ctx.strokeStyle = '#050608';
        ctx.lineWidth = 5;
        ctx.strokeRect(originX, originY, cell * this.model.uCount, cell * this.model.vCount);
        ctx.strokeStyle = '#9da6b2';
        ctx.lineWidth = 1.7;
        ctx.strokeRect(originX, originY, cell * this.model.uCount, cell * this.model.vCount);
    }

    _drawPolyhedronNet(ctx, width, height) {
        if (!this.polyhedronNetLayout) {
            this.polyhedronNetLayout = buildConnectedPolyhedronNet(this.model.faces);
        }
        const layout = this.polyhedronNetLayout;
        if (!layout || layout.size !== this.model.faces.length) return;
        const padding = 13;
        const bounds = polygonBounds([...layout.values()].map(placement => placement.polygon));
        const netWidth = Math.max(1e-6, bounds.maxX - bounds.minX);
        const netHeight = Math.max(1e-6, bounds.maxY - bounds.minY);
        const scale = Math.min((width - padding * 2) / netWidth, (height - padding * 2) / netHeight);
        const renderedWidth = netWidth * scale;
        const renderedHeight = netHeight * scale;
        const originX = (width - renderedWidth) * 0.5 - bounds.minX * scale;
        const originY = (height - renderedHeight) * 0.5 + bounds.maxY * scale;
        const toScreen = point => [originX + point[0] * scale, originY - point[1] * scale];
        const boundaries = [];
        for (const face of this.model.faces) {
            const placement = layout.get(face.faceIndex);
            const project = vertex => toScreen(transformNetPoint(placement, faceLocalPoint(face, vertex)));
            const center = project(face.center);
            const netFace = {
                ...face,
                scale,
                centerX: center[0],
                centerY: center[1],
                netMatrix: placement.matrix,
            };
            for (const slot of this.model.slots.filter(candidate => candidate.faceIndex === face.faceIndex)) {
                const polygon = slot.vertices.map(project);
                ctx.beginPath();
                polygon.forEach((point, index) => index
                    ? ctx.lineTo(point[0], point[1])
                    : ctx.moveTo(point[0], point[1]));
                ctx.closePath();
                ctx.fillStyle = `#${this.model.faceColors[this.model.colors[slot.id]].toString(16).padStart(6, '0')}`;
                ctx.fill();
                ctx.strokeStyle = 'rgba(5,7,10,.9)';
                ctx.lineWidth = Math.max(0.8, Math.min(1.8, scale * 0.025));
                ctx.stroke();
                this.netHitCells.push({ slotIndex: slot.id, face: netFace, polygon });
            }
            boundaries.push(face.vertices.map(project));
        }

        const edgeMap = new Map();
        const edgeKey = (first, second) => {
            const pointKey = point => `${Math.round(point[0] * 20)},${Math.round(point[1] * 20)}`;
            const keys = [pointKey(first), pointKey(second)].sort();
            return `${keys[0]}|${keys[1]}`;
        };
        for (const boundary of boundaries) {
            for (let index = 0; index < boundary.length; index++) {
                const first = boundary[index];
                const second = boundary[(index + 1) % boundary.length];
                const key = edgeKey(first, second);
                const entry = edgeMap.get(key) || { first, second, count: 0 };
                entry.count++;
                edgeMap.set(key, entry);
            }
        }
        const strokeEdges = (entries, color, lineWidth) => {
            ctx.beginPath();
            for (const edge of entries) {
                ctx.moveTo(edge.first[0], edge.first[1]);
                ctx.lineTo(edge.second[0], edge.second[1]);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        };
        const internalEdges = [...edgeMap.values()].filter(edge => edge.count > 1);
        const outerEdges = [...edgeMap.values()].filter(edge => edge.count === 1);
        strokeEdges(internalEdges, 'rgba(5,7,10,.86)', 2.2);
        strokeEdges(outerEdges, '#050608', 5);
        strokeEdges(outerEdges, '#9da6b2', 1.6);
    }

    _renderHud() {
        const maximum = this.model.maximumScore;
        const percent = maximum ? this.currentScore / maximum * 100 : 0;
        this.titleElement.textContent = `${TWISTY_MODE_INFO[this.mode].label} · ${this.sizeText}`;
        this.scoreElement.textContent = `${this.currentScore} / ${maximum}`;
        this.percentElement.textContent = `${percent.toFixed(1)}% colour match`;
        this.runElement.textContent = `${this.moves} moves · ${this.elapsed.toFixed(1)} s · scramble ${this.scrambleMoves.length}`;
        this.bestElement.textContent = this.bestMoves === null
            ? 'Best for this mode and size: —'
            : `Best for this mode and size: ${this.bestMoves} moves`;
        if (!this.scoredRun) {
            this.scoreElement.textContent = 'Free play';
            this.percentElement.textContent = 'Shuffle to start a timed solve';
            this.runElement.textContent = '';
        }
        this.bestElement.hidden = !this.scoredRun;
        this.completeElement.style.display = this.phase === 'complete' ? 'grid' : 'none';
        this.completeScoreElement.textContent = `${this.moves} moves`;
        this.completeTimeElement.textContent = `${this.elapsed.toFixed(1)} seconds`;
    }

    _loadBestRecord() {
        const request = (this._bestRequest || 0) + 1;
        this._bestRequest = request;
        this.host.app?.records?.getBest(
            'rubiks-cuboid',
            this.host.getRecordSettings(this.host.settings),
            'moves',
            'min',
        ).then(record => {
            if (request !== this._bestRequest) return;
            const moves = Number(record?.results?.moves);
            if (Number.isFinite(moves)) this.bestMoves = moves;
            this._renderHud();
        }).catch(() => {});
    }

    update(dt) {
        this.trackball?.update();
        if (this.animation) {
            this.animation.elapsed += dt;
            this.animation.progress = clamp(this.animation.elapsed / this.animation.duration, 0, 1);
            this._refreshMeshes();
            if (this.animation.progress >= 1) {
                this.animation = null;
                this._refreshMeshes();
            }
        }
        if (this.phase === 'playing' && this.runStarted) {
            this.elapsed += dt;
            this._renderHud();
        }
    }

    render() {
        this.sliceChoiceOverlay?.update();
        this.renderer?.render(this.scene, this.camera);
    }

    onResize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
        this.trackball?.handleResize();
        this._drawNet();
    }

    onPause() {
        if (this.netNavigation) this.netNavigation.pan = null;
        this._clearSliceChoice();
        this.trackball?.cancel();
        this._finishAnimationImmediately();
        if (this.drag?.chosen && this.drag.appliedSteps !== 0) {
            const chosen = this.drag.chosen;
            if (this.mode === 'torus') {
                this.model.applyMove(chosen.axis, chosen.layer, -this.drag.appliedSteps);
            } else {
                this.model.applyMove(chosen.axisIndex, chosen.layer, -this.drag.appliedSteps);
            }
            this._refreshMeshes();
        }
        this.drag = null;
        this.netResizing = null;
        this.canvas.style.cursor = 'default';
    }

    destroy() {
        this.stickerBatch?.dispose();
        this.history?.dispose();
        this.netNavigation?.dispose();
        this._clearSliceChoice();
        this.fullBodyGeometry?.dispose();
        this._bestRequest = (this._bestRequest || 0) + 1;
        this.canvas.removeEventListener('mousedown', this._mouseDown);
        window.removeEventListener('mousemove', this._mouseMove);
        window.removeEventListener('mouseup', this._mouseUp);

        this.netCanvas?.removeEventListener('mousedown', this._netMouseDown);
        this.netResizeHandle?.removeEventListener('mousedown', this._netResizeDown);
        this.trackball?.dispose();
        this.trackball = null;
        this.hud?.remove();
        this.hud = null;
        this.scene?.traverse(object => {
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) material?.dispose?.();
        });
        disposePuzzleModel(this.model);
        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }
}
