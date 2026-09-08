import * as THREE from '../../../node_modules/three/build/three.module.js';
import { PUZZLE_PRESENTATION } from './puzzle-interaction.js';
import { roundedSticker } from './polyhedron-geometry.js';

export function sliceHighlightColor(view, slotIndex, choiceIndex) {
    const style = view.settings?.sliceGlowStyle ?? PUZZLE_PRESENTATION.sliceGlowStyle;
    const color = style === 'slice'
        ? PUZZLE_PRESENTATION.sliceGlowColors[choiceIndex % PUZZLE_PRESENTATION.sliceGlowColors.length]
        : view.model.faceColors[view.model.colors[slotIndex]];
    if (style !== 'dark') return color;
    const amount = Math.max(0, Math.min(100, Number(view.settings?.sliceDarkness ?? PUZZLE_PRESENTATION.sliceDarkness))) / 100;
    return new THREE.Color(color).multiplyScalar((1 - amount) ** 2.2).getHex();
}

export class SliceChoiceOverlay {
    constructor(view, choices) {
        this.view = view;
        this.choices = choices;
        this.dark = (view.settings?.sliceGlowStyle ?? PUZZLE_PRESENTATION.sliceGlowStyle) === 'dark';
        this.group = new THREE.Group();
        view.puzzleGroup.add(this.group);
        this.materials = [];
        this.borderGeometries = [];
        const materialCache = new Map();
        const materialsFor = color => {
            if (materialCache.has(color)) return materialCache.get(color);
            const material = new THREE.MeshBasicMaterial({ color, transparent: true,
                opacity: PUZZLE_PRESENTATION.sliceTintOpacity,
                blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide });
            const borderMaterial = new THREE.MeshBasicMaterial({ color, depthWrite: false,
                transparent: true, opacity: 1, side: THREE.DoubleSide });
            const haloMaterials = PUZZLE_PRESENTATION.sliceHaloOpacities.map(opacity =>
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
                    depthWrite: false, side: THREE.DoubleSide }));
            this.materials.push(material, borderMaterial, ...haloMaterials);
            const bundle = { material, borderMaterial, haloMaterials };
            materialCache.set(color, bundle);
            return bundle;
        };
        choices.forEach((choice, index) => {
            for (const slotIndex of choice.move.selected) {
                const { material, borderMaterial, haloMaterials } = materialsFor(sliceHighlightColor(view, slotIndex, index));
                const original = view.slotMeshes[slotIndex];
                const mesh = new THREE.Mesh(original.geometry, material);
                mesh.position.copy(original.position).addScaledVector(view.model.slots[slotIndex].normal, 0.002);
                mesh.quaternion.copy(original.quaternion);
                mesh.renderOrder = 10;
                this.group.add(mesh);
                if (this.dark) continue;
                const slot = view.model.slots[slotIndex];
                const shared = choices.filter(candidate => candidate.move.selectedSet.has(slotIndex)).length > 1;
                const width = PUZZLE_PRESENTATION.sliceBorderFraction;
                // Two nested coloured borders identify shared fields without
                // washing either colour out to white.
                const outerScale = 1 - (shared ? index * width * 1.4 : 0);
                const outline = roundedSticker(slot.vertices).map(vertex => vertex.clone().sub(slot.center));
                const positions = [];
                for (let i = 0; i < outline.length; i++) {
                    const a = outline[i], b = outline[(i + 1) % outline.length];
                    const outerA = a.clone().multiplyScalar(outerScale);
                    const outerB = b.clone().multiplyScalar(outerScale);
                    const innerA = a.clone().multiplyScalar(outerScale - width);
                    const innerB = b.clone().multiplyScalar(outerScale - width);
                    for (const point of [outerA, outerB, innerB, outerA, innerB, innerA]) positions.push(point.x, point.y, point.z);
                }
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                this.borderGeometries.push(geometry);
                const border = new THREE.Mesh(geometry, borderMaterial);
                border.position.copy(original.position).addScaledVector(slot.normal, 0.004);
                border.quaternion.copy(original.quaternion);
                border.renderOrder = 11 + index;
                this.group.add(border);
                // A steady coloured halo, rather than additive white bloom.
                // The rings fade outward across the dark sticker edges.
                haloMaterials.forEach((haloMaterial, layer) => {
                    const inner = 1 + layer * PUZZLE_PRESENTATION.sliceHaloWidth;
                    const outer = inner + PUZZLE_PRESENTATION.sliceHaloWidth;
                    const haloPositions = [];
                    for (let i = 0; i < outline.length; i++) {
                        const a = outline[i], b = outline[(i + 1) % outline.length];
                        for (const [point, scale] of [[a, outer], [b, outer], [b, inner], [a, outer], [b, inner], [a, inner]]) {
                            haloPositions.push(point.x * scale, point.y * scale, point.z * scale);
                        }
                    }
                    const haloGeometry = new THREE.BufferGeometry();
                    haloGeometry.setAttribute('position', new THREE.Float32BufferAttribute(haloPositions, 3));
                    this.borderGeometries.push(haloGeometry);
                    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
                    halo.position.copy(border.position);
                    halo.quaternion.copy(border.quaternion);
                    halo.renderOrder = 10;
                    this.group.add(halo);
                });
            }
        });
    }
    update() {
        if (!this.netDrawn) {
            this.view._drawNet();
            this.netDrawn = true;
        }
    }
    drawNet(ctx) {
        ctx.save();
        this.choices.forEach((choice, index) => {
            ctx.shadowBlur = this.dark ? 0 : 10; ctx.lineWidth = 2;
            for (const cell of this.view.netHitCells) {
                if (!choice.move.selectedSet.has(cell.slotIndex)) continue;
                const color = '#' + sliceHighlightColor(this.view, cell.slotIndex, index).toString(16).padStart(6, '0');
                ctx.fillStyle = color; ctx.strokeStyle = color; ctx.shadowColor = color;
                ctx.beginPath();
                cell.polygon.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
                ctx.closePath(); ctx.globalAlpha = this.dark ? 1 : 0.4; ctx.fill();
                if (!this.dark) { ctx.globalAlpha = 0.9; ctx.stroke(); }
            }
        });
        ctx.restore();
    }
    dispose() {
        this.group.removeFromParent();
        for (const material of this.materials) material.dispose();
        for (const geometry of this.borderGeometries) geometry.dispose();
    }
}
