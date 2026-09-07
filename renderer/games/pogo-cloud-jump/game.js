import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

export const POGO_CLOUD_JUMP_DEFAULTS = Object.freeze({
    monsterMass: 8.0,           // [kg]
    springStiffness: 1450.0,    // [N/m]
    springDamping: 6.0,         // [N·s/m]
    springRestLength: 0.85,     // [m] - much longer default pogo spring
    legBentLength: 0.20,        // [m]
    legExtendedLength: 0.65,    // [m]
    legExtensionSpeed: 7.5,     // [m/s]
    angularSpeed: 100.0,        // [deg/s]
    gravity: 14.5,              // [m/s²]
    monsterHeight: 0.72,        // [m]
    platformGap: 2.7,           // [m]
    mouseAimEnabled: true,      // Aim angle with mouse
    lockMouseYToTop: true,      // Lock mouse Y coordinate to top of window
});

const MODEL = Object.freeze({
    fixedTimeStep: 1 / 240,
    maximumSubsteps: 18,
    logicalWidth: 720,
    logicalHeight: 960,
    pixelsPerMetre: 96,
    worldWidthMetres: 7.5,
    cameraBottomMargin: 2.2,
    maximumTiltAngle: Math.PI * 0.44, // ~79 degrees max tilt
    minGeneratedGap: 0.9,
});

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Date.now() >>> 0;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

export function validatePogoCloudJumpSettings(settings = {}) {
    const source = { ...POGO_CLOUD_JUMP_DEFAULTS, ...(settings || {}) };
    requirePositiveNumber(source.monsterMass, 'Monster mass');
    requirePositiveNumber(source.springStiffness, 'Spring stiffness');
    requireFiniteNumber(source.springDamping, 'Spring damping', { minimum: 0 });
    requirePositiveNumber(source.springRestLength, 'Spring rest length');
    requirePositiveNumber(source.legBentLength, 'Bent leg length');
    requirePositiveNumber(source.legExtendedLength, 'Extended leg length');
    requirePositiveNumber(source.legExtensionSpeed, 'Leg extension speed');
    requirePositiveNumber(source.angularSpeed, 'Angular rotation speed');
    requirePositiveNumber(source.gravity, 'Gravity');
    requirePositiveNumber(source.monsterHeight, 'Monster height');
    requirePositiveNumber(source.platformGap, 'Mean platform gap');
    return source;
}

export function readPogoCloudJumpSettings(settings = {}) {
    const source = validatePogoCloudJumpSettings(settings);
    return Object.freeze({
        ...Object.fromEntries(
            Object.keys(POGO_CLOUD_JUMP_DEFAULTS)
                .filter(k => k !== 'mouseAimEnabled' && k !== 'lockMouseYToTop')
                .map(key => [key, Number(source[key])]),
        ),
        mouseAimEnabled: Boolean(source.mouseAimEnabled !== false),
        lockMouseYToTop: Boolean(source.lockMouseYToTop),
    });
}

/**
 * Calculates spring contact state for a point mass on extensible legs + spring against a horizontal plank surface.
 * Platforms are ONE-WAY: permeable from underneath (vy > 0), solid from above (vy <= 0).
 * By Hooke's law, when the monster tilts right (angle > 0), the foot pushes the body UP and RIGHT.
 */
export function computeSpringContact(state, parameters, surfaceY, surfaceXMin, surfaceXMax) {
    // One-way: permeable when moving upwards unless already engaged in contact
    if (state.vy > 0.05 && !state.inContact) {
        return { inContact: false, compression: 0, forceMagnitude: 0, footX: state.x, footY: state.y };
    }

    const cosTheta = Math.cos(state.angle);
    if (cosTheta <= 0.05) {
        return { inContact: false, compression: 0, forceMagnitude: 0, footX: state.x, footY: state.y };
    }

    const sinTheta = Math.sin(state.angle);
    const totalRestLength = state.legLength + parameters.springRestLength;
    // Foot position along the leg axis extending downward
    const restFootX = state.x - totalRestLength * sinTheta;
    const restFootY = state.y - totalRestLength * cosTheta;

    // Monster body must strictly be above the platform surface (plank top level)
    if (state.y <= surfaceY) {
        return { inContact: false, compression: 0, forceMagnitude: 0, footX: restFootX, footY: restFootY };
    }

    // Foot must be strictly within horizontal bounds of the plank (no phantom extensions in thin air)
    if (restFootX < surfaceXMin || restFootX > surfaceXMax) {
        return { inContact: false, compression: 0, forceMagnitude: 0, footX: restFootX, footY: restFootY };
    }

    // Foot penetrates below the top surface level of the plank
    if (restFootY <= surfaceY) {
        const currentTotalLength = (state.y - surfaceY) / cosTheta;
        const currentSpringLength = currentTotalLength - state.legLength;
        const compression = parameters.springRestLength - currentSpringLength;

        if (compression > 0) {
            // Rate of compression along the leg axis (positive when falling towards ground)
            const vComp = -state.vx * sinTheta - state.vy * cosTheta;
            const springForce = parameters.springStiffness * compression + parameters.springDamping * vComp;
            const forceMagnitude = Math.max(0, springForce);

            // Hooke's Law: pushing off the ground along orientation angle theta
            // When angle > 0 (tilted right), force pushes body UP (+cosTheta) and RIGHT (+sinTheta)
            return {
                inContact: true,
                compression,
                forceMagnitude,
                footX: restFootX,
                footY: surfaceY, // Exactly at the top level of the plank
                unitX: sinTheta,
                unitY: cosTheta,
                bottomedOut: currentSpringLength <= 0.02,
            };
        }
    }

    return { inContact: false, compression: 0, forceMagnitude: 0, footX: restFootX, footY: restFootY };
}

export default class PogoCloudJumpGame extends BaseGame {
    init() {
        this.wantsPointerLock = true;
        this.parameters = readPogoCloudJumpSettings(this.settings);
        this.bestHeight = 0;
        this.mousePos = null;
        this.mouseControlActive = false;
        this._loadBest();
        this._createPlayOverlay();
        this._attachPointer();
        this._resetRun();
    }

    wantsPointerLockNow() {
        return this.phase === 'running';
    }

    _attachPointer() {
        if (!this.canvas) return;
        this._onMouseMove = event => {
            const { scale, width } = this._layout();
            if (!this.mousePos) {
                this.mousePos = { x: width / 2, y: 14 };
            }
            if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
                this.mousePos.x = Math.max(0, Math.min(width, this.mousePos.x + event.movementX / Math.max(1e-9, scale)));
                this.mousePos.y = Math.max(0, Math.min(MODEL.logicalHeight, this.mousePos.y + event.movementY / Math.max(1e-9, scale)));
            } else {
                const rect = this.canvas.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const px = (event.clientX - rect.left) * (this.canvas.width / rect.width);
                    const py = (event.clientY - rect.top) * (this.canvas.height / rect.height);
                    this.mousePos.x = Math.max(0, Math.min(width, px / Math.max(1e-9, scale)));
                    this.mousePos.y = Math.max(0, Math.min(MODEL.logicalHeight, py / Math.max(1e-9, scale)));
                }
            }
        };
        this._onPointerDown = event => {
            if (event.button === 0) {
                // Click activates mouse aiming and requests pointer lock during active gameplay
                this.mouseControlActive = true;
                if (this.phase === 'running' && typeof document !== 'undefined' && !document.pointerLockElement && this.canvas.requestPointerLock) {
                    this.canvas.requestPointerLock();
                }
            }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('mousemove', this._onMouseMove);
        } else if (this.canvas.addEventListener) {
            this.canvas.addEventListener('mousemove', this._onMouseMove);
        }
        this.canvas.addEventListener('pointerdown', this._onPointerDown);
    }

    async _loadBest() {
        try {
            const record = await this.app?.records?.getBest(
                'pogo-cloud-jump', this.getRecordSettings(this.settings), 'height',
            );
            const value = Number(record?.results?.height);
            if (Number.isFinite(value)) this.bestHeight = value;
        } catch (error) {
            console.warn('Could not load Pogo Cloud Jump record:', error);
        }
    }

    _resetRun(seed = makeSeed()) {
        this.seed = seed >>> 0;
        this.random = seededRandom(this.seed);
        this.phase = 'ready';
        this.elapsed = 0;
        this.maxHeight = 0;
        this.cameraY = 0;
        this.accumulator = 0;
        this.scoreSubmitted = false;
        this.mouseControlActive = false;

        // Physical state
        this.monster = {
            x: 0,
            y: 1.6,
            vx: 0,
            vy: 0,
            angle: 0, // [rad], 0 = pointing straight up
            legLength: this.parameters.legBentLength,
            targetLegLength: this.parameters.legBentLength,
            prevRestFootY: 1.6 - (this.parameters.legBentLength + this.parameters.springRestLength),
            inContact: false,
            compression: 0,
            lastContactPlatform: null,
        };

        // Input state
        this.rotateInput = 0;
        this.isExtendRequested = false;

        // Platform planks list
        this.planks = [];
        this.nextPlankY = 0;
        this._generateInitialPlanks();
        this._syncPlayOverlay();
        this._syncCursorVisibility();
    }

    _generateInitialPlanks() {
        // Base starting green plank right underneath the monster (monster starts above it)
        this.planks.push({
            id: 0,
            x: 0,
            y: 0,
            width: 4.2,
            height: 0.35,
            cleared: true,
        });

        this.nextPlankY = this.parameters.platformGap * 0.9;
        this._spawnPlanksAhead(18);
    }

    _spawnPlanksAhead(aheadHeight) {
        const topY = (this.monster?.y || 0) + aheadHeight;
        while (this.nextPlankY < topY) {
            const gap = this.parameters.platformGap * (0.85 + this.random() * 0.35);
            const plankW = 1.9 + this.random() * 1.1;
            const halfW = (MODEL.worldWidthMetres - plankW) / 2;
            const plankX = (this.random() * 2 - 1) * halfW * 0.85;

            this.planks.push({
                id: this.planks.length,
                x: plankX,
                y: this.nextPlankY,
                width: plankW,
                height: 0.32,
                cleared: false,
            });

            this.nextPlankY += Math.max(MODEL.minGeneratedGap, gap);
        }
    }

    _startRun() {
        this.phase = 'running';
        this._syncPlayOverlay();
        this._syncCursorVisibility();
        this.audio.playClick?.();
    }

    _finishRun() {
        if (this.phase === 'gameover') return;
        this.phase = 'gameover';
        if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
            document.exitPointerLock?.();
        }
        this.bestHeight = Math.max(this.bestHeight, this.maxHeight);

        if (!this.scoreSubmitted) {
            this.submitScore({
                height: Number(this.maxHeight.toFixed(2)),
                seconds: Number(this.elapsed.toFixed(3)),
                seed: this.seed,
            });
            this.scoreSubmitted = true;
        }

        this.audio.playPlasticImpact?.(0.4);
        this._syncPlayOverlay();
        this._syncCursorVisibility();
    }

    _step(dt) {
        const p = this.parameters;
        const m = this.monster;
        this.elapsed += dt;

        // 1. Rotation physics (Keyboard rotation or smooth tracking)
        if (Math.abs(this.rotateInput) > 0.01) {
            const angRadSpeed = (p.angularSpeed * Math.PI) / 180;
            m.angle += this.rotateInput * angRadSpeed * dt;
        }
        m.angle = Math.max(-MODEL.maximumTiltAngle, Math.min(MODEL.maximumTiltAngle, m.angle));

        // 2. Collision and Spring Force detection
        // Calculate the height of the uncompressed spring tip (foot)
        const restFootY = m.y - (m.legLength + p.springRestLength) * Math.cos(m.angle);

        // Update clearance status:
        // A plank is cleared ONLY when the spring tip reaches or crosses above the plank top surface.
        // If the monster falls completely below the plank while not in contact, clearance resets.
        for (const plank of this.planks) {
            if (restFootY >= plank.y) {
                plank.cleared = true;
            } else if (!m.inContact && m.y < plank.y) {
                plank.cleared = false;
            }
        }

        let bestContact = null;
        for (const plank of this.planks) {
            // Strictly require that the spring foot has cleared the plank's top surface before engaging
            if (!plank.cleared && (!m.inContact || m.lastContactPlatform !== plank)) {
                continue;
            }

            // Monster body must be above plank top or within contact range
            if (m.y <= plank.y || m.y > plank.y + p.springRestLength + p.legExtendedLength + 1.2) {
                continue;
            }

            const xMin = plank.x - plank.width / 2;
            const xMax = plank.x + plank.width / 2;
            const contact = computeSpringContact(m, p, plank.y, xMin, xMax);

            if (contact.inContact) {
                bestContact = { ...contact, plank };
                break;
            }
        }

        // 3. Leg Extension / Retraction Rule:
        // - In air (!m.inContact and !bestContact): legs MUST be strictly retracted in V shape!
        // - On platform: if extension is requested (Space / click held), legs extend rapidly to push off.
        if (bestContact && bestContact.inContact && this.isExtendRequested) {
            m.targetLegLength = p.legExtendedLength;
            if (m.legLength < m.targetLegLength) {
                m.legLength = Math.min(m.targetLegLength, m.legLength + p.legExtensionSpeed * dt);
            }
        } else {
            // Retract immediately when airborne or when extension is released
            m.targetLegLength = p.legBentLength;
            m.legLength = p.legBentLength;
        }

        let totalForceX = 0;
        let totalForceY = -p.monsterMass * p.gravity;

        if (bestContact && bestContact.inContact) {
            if (!m.inContact) {
                this.audio.playClick?.();
            }
            m.inContact = true;
            m.compression = bestContact.compression;
            m.lastContactPlatform = bestContact.plank;

            // Hard stop if spring fully bottoms out against the plank surface
            if (bestContact.bottomedOut) {
                const cosTheta = Math.max(0.1, Math.cos(m.angle));
                const minY = bestContact.plank.y + (m.legLength + 0.02) * cosTheta;
                if (m.y < minY) {
                    m.y = minY;
                    m.vy = Math.max(0, m.vy);
                }
            }

            // Hooke's Law force applied to body mass
            totalForceX += bestContact.forceMagnitude * bestContact.unitX;
            totalForceY += bestContact.forceMagnitude * bestContact.unitY;
        } else {
            if (m.inContact) {
                // LIFTOFF! Legs are already set to bent V length
                this.isExtendRequested = false;
            }
            m.inContact = false;
            m.compression = 0;
        }

        // Light air drag
        totalForceX -= m.vx * 0.35;
        totalForceY -= m.vy * 0.12;

        // Acceleration and integration
        const ax = totalForceX / p.monsterMass;
        const ay = totalForceY / p.monsterMass;

        m.vx += ax * dt;
        m.vy += ay * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.prevRestFootY = m.y - (m.legLength + p.springRestLength) * Math.cos(m.angle);

        // Update score & camera
        if (m.y > this.maxHeight) {
            this.maxHeight = m.y;
        }
        const targetCamY = Math.max(0, m.y - MODEL.cameraBottomMargin);
        if (targetCamY > this.cameraY) {
            this.cameraY = targetCamY;
        }

        // Planks maintenance & generation
        this._spawnPlanksAhead(18);
        this.planks = this.planks.filter(pl => pl.y > this.cameraY - 6);

        // Fall check (Game Over if monster drops below camera bottom)
        if (m.y < this.cameraY - 2.8) {
            this._finishRun();
        }
    }

    update(dt) {
        // Handle keyboard input bindings
        const ccw = Boolean(
            this.input.isActionDown?.('rotateCcw')
            || this.input.isKeyDown?.('KeyT')
            || this.input.isKeyDown?.('ArrowLeft')
            || this.input.isKeyDown?.('KeyA'),
        );
        const cw = Boolean(
            this.input.isActionDown?.('rotateCw')
            || this.input.isKeyDown?.('KeyZ')
            || this.input.isKeyDown?.('KeyY')
            || this.input.isKeyDown?.('ArrowRight')
            || this.input.isKeyDown?.('KeyD'),
        );

        const keyRot = (ccw ? -1 : 0) + (cw ? 1 : 0);
        if (keyRot !== 0) {
            this.mouseControlActive = false;
        }

        // Mouse Aiming: only active if enabled, user clicked to activate, and not using keyboard
        if (this.parameters.mouseAimEnabled && this.mouseControlActive && this.mousePos && keyRot === 0) {
            const { width } = this._layout();
            const bodyScreen = this._toScreen(this.monster.x, this.monster.y, width);
            const targetMouseY = this.parameters.lockMouseYToTop ? 14 : this.mousePos.y;
            const dx = this.mousePos.x - bodyScreen.x;
            const dy = targetMouseY - bodyScreen.y;

            // Monster axis points towards cursor
            const targetAngle = Math.atan2(dx, -dy);
            const clampedTarget = Math.max(-MODEL.maximumTiltAngle, Math.min(MODEL.maximumTiltAngle, targetAngle));

            // Smoothly rotate towards target angle
            const diff = clampedTarget - this.monster.angle;
            const maxDelta = ((this.parameters.angularSpeed * Math.PI) / 180) * (Number(dt) || 0.016);
            if (Math.abs(diff) <= maxDelta) {
                this.monster.angle = clampedTarget;
                this.rotateInput = 0;
            } else {
                this.rotateInput = Math.sign(diff);
            }
        } else {
            this.rotateInput = keyRot;
        }

        const jumpHeld = Boolean(
            this.input.isActionDown?.('extendLegs')
            || this.input.isKeyDown?.('Space')
            || this.input.isKeyDown?.('ArrowUp')
            || this.input.isKeyDown?.('KeyW')
            || this.input.isMouseDown?.(0),
        );

        this.isExtendRequested = jumpHeld;

        if (this.phase === 'ready' || this.phase === 'gameover') return;

        this.accumulator = Math.min(
            this.accumulator + Math.min(0.05, Number(dt) || 0),
            MODEL.fixedTimeStep * MODEL.maximumSubsteps,
        );

        while (this.accumulator >= MODEL.fixedTimeStep) {
            this._step(MODEL.fixedTimeStep);
            this.accumulator -= MODEL.fixedTimeStep;
            if (this.phase === 'gameover') break;
        }
    }

    _layout() {
        const scale = this.h / MODEL.logicalHeight;
        return { scale, width: this.w / Math.max(1e-9, scale) };
    }

    _toScreen(worldX, worldY, screenWidth) {
        const ppm = MODEL.pixelsPerMetre;
        const cx = screenWidth / 2;
        const cy = MODEL.logicalHeight * 0.76;
        const sx = cx + worldX * ppm;
        const sy = cy - (worldY - this.cameraY) * ppm;
        return { x: sx, y: sy };
    }

    _drawSkyAndCosmos(ctx, width, height) {
        const altitude = Math.max(0, this.cameraY);
        const grad = ctx.createLinearGradient(0, 0, 0, height);

        if (altitude < 35) {
            grad.addColorStop(0, '#3ba2e8');
            grad.addColorStop(0.5, '#72c4f8');
            grad.addColorStop(1, '#dff3ff');
        } else if (altitude < 90) {
            const t = (altitude - 35) / 55;
            grad.addColorStop(0, '#1c1642');
            grad.addColorStop(0.45, '#5d2b63');
            grad.addColorStop(0.85, '#e37a54');
            grad.addColorStop(1, '#ffc285');
        } else if (altitude < 180) {
            grad.addColorStop(0, '#0a0d26');
            grad.addColorStop(0.6, '#181b47');
            grad.addColorStop(1, '#34265e');
        } else {
            grad.addColorStop(0, '#040612');
            grad.addColorStop(0.6, '#090d24');
            grad.addColorStop(1, '#131433');
        }

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        if (altitude > 40) {
            const starAlpha = Math.min(1, (altitude - 40) / 40);
            for (let i = 0; i < 30; i++) {
                const sx = ((i * 149 + 33) % (width - 30)) + 15;
                const sy = (i * 83) % (height - 30) + 15;
                const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.5 + i * 2.1);
                ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha * pulse * 0.85})`;
                ctx.beginPath();
                ctx.arc(sx, sy, (i % 3 === 0 ? 2 : 1.2), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    _drawPlank(ctx, plank, screenWidth) {
        const ppm = MODEL.pixelsPerMetre;
        const pos = this._toScreen(plank.x, plank.y, screenWidth);
        const w = plank.width * ppm;
        const h = 18; // Crisp straight green wooden plank

        ctx.save();
        ctx.translate(pos.x, pos.y);

        // Drop shadow under the plank
        ctx.fillStyle = 'rgba(0, 30, 60, 0.22)';
        ctx.beginPath();
        ctx.roundRect(-w / 2 + 3, h + 2, w - 6, 8, 4);
        ctx.fill();

        // 3D Vibrant Green Wooden Plank Body
        const plankGrad = ctx.createLinearGradient(0, 0, 0, h);
        plankGrad.addColorStop(0, '#68d391');
        plankGrad.addColorStop(0.2, '#48bb78');
        plankGrad.addColorStop(0.8, '#2f855a');
        plankGrad.addColorStop(1, '#1c4532');

        ctx.fillStyle = plankGrad;
        ctx.beginPath();
        ctx.roundRect(-w / 2, 0, w, h, 6);
        ctx.fill();
        ctx.strokeStyle = '#1c4532';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Perfectly straight top landing highlight rim
        ctx.strokeStyle = '#9ae6b4';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 4, 2);
        ctx.lineTo(w / 2 - 4, 2);
        ctx.stroke();

        // Wood grain lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-w / 2 + 16, 7);
        ctx.lineTo(w / 2 - 20, 7);
        ctx.moveTo(-w / 2 + 28, 12);
        ctx.lineTo(w / 2 - 12, 12);
        ctx.stroke();

        // Screws / rivets on plank ends
        ctx.fillStyle = '#22543d';
        ctx.beginPath();
        ctx.arc(-w / 2 + 10, h / 2, 2.5, 0, Math.PI * 2);
        ctx.arc(w / 2 - 10, h / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawMonster(ctx, screenWidth) {
        const m = this.monster;
        const p = this.parameters;
        const ppm = MODEL.pixelsPerMetre;
        const bodyPos = this._toScreen(m.x, m.y, screenWidth);

        ctx.save();
        ctx.translate(bodyPos.x, bodyPos.y);
        ctx.rotate(m.angle);

        // Determine facing direction:
        // Follow the mouse aim offset or the tilt angle / rotateInput
        let facing = m.facing || 1;
        if (this.parameters.mouseAimEnabled && this.mouseControlActive && this.mousePos && this.phase === 'running') {
            const aimDx = this.mousePos.x - bodyPos.x;
            if (aimDx > 6) facing = 1;
            else if (aimDx < -6) facing = -1;
        } else {
            if (m.angle > 0.04) facing = 1;
            else if (m.angle < -0.04) facing = -1;
            else if (this.rotateInput > 0.1) facing = 1;
            else if (this.rotateInput < -0.1) facing = -1;
        }
        m.facing = facing;

        const isCrashed = (this.phase === 'gameover');
        const scale = p.monsterHeight / 0.72;
        ctx.scale(scale * facing, scale);

        // Hips at the bottom of the green striped shirt
        const hipY = 8;
        const legPixels = m.legLength * ppm;
        const lowerCollarY = hipY + legPixels;

        // 1. DVE DOLGI NOGI, POKRČENI V SMER POGLEDA (Both knees bend forward in facing direction > >)
        // Knee joint spread: forward V when bent (~18px), straightens when extended (~4px)
        const extendRatio = Math.max(0, Math.min(1, (m.legLength - p.legBentLength) / Math.max(1e-4, p.legExtendedLength - p.legBentLength)));
        const kneeForwardX = 18 * (1 - extendRatio * 0.78);
        const kneeY = hipY + legPixels * 0.5;

        // FAR LEG (Back layer, slightly darker for depth)
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 4.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-4, hipY);
        ctx.lineTo(-4 + kneeForwardX * 0.82, kneeY);
        ctx.lineTo(-2, lowerCollarY);
        ctx.stroke();

        // Far knee cap
        ctx.fillStyle = '#2d3748';
        ctx.beginPath();
        ctx.arc(-4 + kneeForwardX * 0.82, kneeY, 3, 0, Math.PI * 2);
        ctx.fill();

        // NEAR LEG (Front layer)
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(5, hipY);
        ctx.lineTo(5 + kneeForwardX, kneeY);
        ctx.lineTo(2, lowerCollarY);
        ctx.stroke();

        // Near knee cap
        ctx.fillStyle = '#1a202c';
        ctx.beginPath();
        ctx.arc(5 + kneeForwardX, kneeY, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // 2. ČEVLJI / OBJEMKA (Clean dark collar attaching to the pogo spring)
        ctx.fillStyle = '#2d3748';
        ctx.beginPath();
        ctx.roundRect(-9, lowerCollarY - 2, 18, 6, 3);
        ctx.fill();
        ctx.strokeStyle = '#1a202c';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // 3. DOLGA VZMET BREZ PODSTAVKA (Long helical pogo spring without base pad)
        const currentSpringPixels = Math.max(12, (p.springRestLength - m.compression) * ppm);
        const coilStartY = lowerCollarY + 3;
        const coilEndY = lowerCollarY + currentSpringPixels;
        const coilTurns = 7;
        const coilWidth = 14;

        // Shiny metallic helical spring coil
        ctx.strokeStyle = '#edf2f7';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, coilStartY);
        for (let i = 0; i < coilTurns; i++) {
            const y1 = coilStartY + ((i + 0.25) / coilTurns) * (coilEndY - coilStartY);
            const y2 = coilStartY + ((i + 0.75) / coilTurns) * (coilEndY - coilStartY);
            ctx.lineTo(-coilWidth, y1);
            ctx.lineTo(coilWidth, y2);
        }
        ctx.lineTo(0, coilEndY);
        ctx.stroke();

        // Outline on spring
        ctx.strokeStyle = '#718096';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Rounded metal wire tip directly making contact
        ctx.fillStyle = '#cbd5e0';
        ctx.beginPath();
        ctx.arc(0, coilEndY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 4. POLISHED VECTOR BODY SHAPE (Yellow dome head + snout + green striped shirt)
        const traceBody = () => {
            ctx.beginPath();
            // Start at bottom-left corner of the shirt
            ctx.moveTo(-20, hipY);
            // Left back contour curving smoothly up to top dome
            ctx.bezierCurveTo(-23, -12, -22, -38, -2, -48);
            // Wide smooth top dome over to forehead
            ctx.bezierCurveTo(14, -48, 18, -38, 18, -28);
            // Smooth upper bridge flaring into snout
            ctx.bezierCurveTo(18, -23, 25, -20, 36, -23);
            // Top lip
            ctx.lineTo(42, -21);
            // Bottom lip
            ctx.lineTo(39, -10);
            // Smooth underside of snout scooping into chest
            ctx.bezierCurveTo(27, -10, 20, -12, 16, -5);
            // Front torso down to bottom-right corner of shirt
            ctx.bezierCurveTo(17, 0, 18, 5, 18, hipY);
            // Bottom edge across the hips
            ctx.lineTo(-20, hipY);
            ctx.closePath();
        };

        // Fill body with clean vibrant yellow gradient
        const yellowGrad = ctx.createRadialGradient(-4, -28, 4, 0, -26, 36);
        yellowGrad.addColorStop(0, '#fff566');
        yellowGrad.addColorStop(0.55, '#fae824');
        yellowGrad.addColorStop(1, '#e5be0b');
        traceBody();
        ctx.fillStyle = yellowGrad;
        ctx.fill();

        // 5. GREEN STRIPED SHIRT (Zelena majca za nizek trup)
        ctx.save();
        traceBody();
        ctx.clip();

        const shirtGrad = ctx.createLinearGradient(0, -10, 0, 8);
        shirtGrad.addColorStop(0, '#48bb78');
        shirtGrad.addColorStop(0.7, '#2f855a');
        shirtGrad.addColorStop(1, '#1c4532');
        ctx.fillStyle = shirtGrad;
        ctx.fillRect(-30, -10, 70, 22);

        // 2 crisp clean horizontal stripe lines
        ctx.strokeStyle = '#1c4532';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-30, -4);
        ctx.lineTo(30, -4);
        ctx.moveTo(-30, 2);
        ctx.lineTo(30, 2);
        ctx.stroke();
        ctx.restore();

        // Crisp clean outline around the entire body
        traceBody();
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // 6. SNOUT MOUTH OPENING RIM
        ctx.save();
        ctx.translate(40.5, -15.5);
        ctx.rotate(0.24);
        ctx.fillStyle = '#f6e01a';
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.5, 7.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        // Inner depth shadow
        ctx.fillStyle = '#b78906';
        ctx.beginPath();
        ctx.ellipse(0.5, 0, 1.8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 7. BIG EXPRESSIVE CARTOON EYES (User requested previous eyes)
        const drawEye = (ex, ey) => {
            if (isCrashed) {
                ctx.strokeStyle = '#c53030';
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                ctx.moveTo(ex - 4, ey - 4); ctx.lineTo(ex + 4, ey + 4);
                ctx.moveTo(ex + 4, ey - 4); ctx.lineTo(ex - 4, ey + 4);
                ctx.stroke();
            } else {
                // White sclera
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(ex, ey, 6, 7.2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#2d3748';
                ctx.lineWidth = 1.8;
                ctx.stroke();

                // Glossy pupil looking forward
                ctx.fillStyle = '#1a202c';
                ctx.beginPath();
                ctx.arc(ex + 2, ey - 0.5, 3.2, 0, Math.PI * 2);
                ctx.fill();

                // Specular catchlight
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(ex + 1, ey - 2, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        drawEye(-1, -29);
        drawEye(11, -29);

        // 8. CUTE TILT ARROW / BALANCE INDICATOR
        if (Math.abs(m.angle) > 0.08) {
            ctx.strokeStyle = 'rgba(255, 235, 59, 0.75)';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(0, -15, 46, -Math.PI / 2, -Math.PI / 2 + m.angle, m.angle < 0);
            ctx.stroke();
        }

        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        const { scale, width } = this._layout();

        ctx.save();
        ctx.scale(scale, scale);

        // 1. Dynamic Sky & Atmosphere
        this._drawSkyAndCosmos(ctx, width, MODEL.logicalHeight);

        // 2. Green Straight Plank Platforms
        for (const plank of this.planks) {
            this._drawPlank(ctx, plank, width);
        }

        // 3. Doodle Monster with Long Pogo Spring
        this._drawMonster(ctx, width);

        // 3.5. Mouse Aim Reticle / Guide Line
        if (this.parameters.mouseAimEnabled && this.mouseControlActive && this.mousePos && this.phase === 'running') {
            const aimY = this.parameters.lockMouseYToTop ? 14 : this.mousePos.y;
            const bodyScreen = this._toScreen(this.monster.x, this.monster.y, width);

            ctx.save();
            if (this.parameters.lockMouseYToTop) {
                // Horizontal track bar at the top of the window
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.lineWidth = 3;
                ctx.setLineDash([4, 6]);
                ctx.beginPath();
                ctx.moveTo(12, 14);
                ctx.lineTo(width - 12, 14);
                ctx.stroke();
            }

            // Faint aiming guide dashed line from monster snout/body to aim point
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(bodyScreen.x, bodyScreen.y - 25);
            ctx.lineTo(this.mousePos.x, aimY);
            ctx.stroke();

            // Aim target bead/crosshair
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(72, 187, 120, 0.9)';
            ctx.beginPath();
            ctx.arc(this.mousePos.x, aimY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();
        }

        // 4. Polished Modern Arcade HUD
        // Altitude Badge (Top-Left)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.roundRect(20, 20, 150, 44, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(74, 117, 8, 0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textBaseline = 'middle';
        ctx.font = '900 19px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#2d4a04';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.maxHeight.toFixed(1)} m`, 95, 42);

        // High Score / Record Pill (Top-Right)
        const bestText = `BEST ${this.bestHeight.toFixed(1)} m`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.roundRect(width - 180, 20, 160, 44, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(230, 140, 20, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '800 15px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#d97706';
        ctx.fillText(bestText, width - 100, 42);

        // Spring Charge / Leg Extension Indicator (Bottom Center)
        const isExtended = this.monster.legLength > this.parameters.legBentLength + 0.05;
        const chargeBg = isExtended ? 'rgba(76, 175, 80, 0.92)' : 'rgba(255, 255, 255, 0.85)';
        const chargeBorder = isExtended ? '#2e7d32' : '#cbd5e0';
        const chargeText = isExtended ? 'PUSH ACTIVE (SPACE / CLICK)' : 'HOLD SPACE / CLICK ON PLANK TO BOOST';

        ctx.fillStyle = chargeBg;
        ctx.beginPath();
        ctx.roundRect(width / 2 - 150, MODEL.logicalHeight - 52, 300, 34, 12);
        ctx.fill();
        ctx.strokeStyle = chargeBorder;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.font = '800 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = isExtended ? '#ffffff' : '#4a5568';
        ctx.fillText(chargeText, width / 2, MODEL.logicalHeight - 35);

        ctx.restore();
    }

    _createPlayOverlay() {
        if (typeof document === 'undefined') return;
        this.playOverlay = document.createElement('div');
        this.playOverlay.style.cssText = 'position:fixed;inset:0;z-index:8;display:grid;place-items:center;pointer-events:none;font-family:Inter,system-ui,sans-serif';
        this.playOverlay.innerHTML = `<div style="min-width:380px;padding:24px 28px;text-align:center;border:3px solid #2f855a;border-radius:22px;background:rgba(252,255,245,.97);box-shadow:0 18px 45px rgba(28,69,50,.28);pointer-events:auto">
            <div data-title style="font-size:32px;font-weight:950;color:#22543d"></div>
            <div data-result style="margin:8px 0 16px;font-size:14px;font-weight:750;color:#2f855a;line-height:1.4"></div>
            <button data-play type="button" style="width:100%;padding:12px;border:2px solid #22543d;border-radius:12px;background:linear-gradient(#48bb78,#2f855a);color:#ffffff;font-size:16px;font-weight:950;cursor:pointer;box-shadow:0 4px 12px rgba(47,133,90,.35)"></button>
        </div>`;
        (this.canvas.parentElement || document.body).appendChild(this.playOverlay);
        this.playTitle = this.playOverlay.querySelector('[data-title]');
        this.playResult = this.playOverlay.querySelector('[data-result]');
        this.playButton = this.playOverlay.querySelector('[data-play]');
        this._stopPlayPointer = event => event.stopPropagation();
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
            this.playButton.addEventListener(type, this._stopPlayPointer);
        }
        this._onPlay = event => {
            event.stopPropagation();
            if (this.phase === 'gameover') this._resetRun();
            this._startRun();
        };
        this.playButton.addEventListener('click', this._onPlay);
    }

    _syncPlayOverlay() {
        if (!this.playOverlay) return;
        const visible = this.phase === 'ready' || this.phase === 'gameover';
        this.playOverlay.style.display = visible ? 'grid' : 'none';
        if (!visible) return;
        this.playTitle.textContent = this.phase === 'gameover' ? 'GAME OVER' : 'POGO JUMP';
        this.playResult.textContent = this.phase === 'gameover'
            ? `Height: ${this.maxHeight.toFixed(1)} m · Best: ${this.bestHeight.toFixed(1)} m`
            : 'Aim with Mouse (or T/Z keys). Press Space or Left Click on planks to boost your spring!';
        this.playButton.textContent = this.phase === 'gameover' ? 'PLAY AGAIN' : 'START JUMPING';
    }

    _syncCursorVisibility() {
        if (!this.canvas) return;
        const shouldHide = Boolean(this.parameters?.lockMouseYToTop && this.phase === 'running');
        this.canvas.style.cursor = shouldHide ? 'none' : 'default';
    }

    onPause() {
        if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
            document.exitPointerLock?.();
        }
        if (this.canvas) this.canvas.style.cursor = 'default';
        if (this.playOverlay) this.playOverlay.style.visibility = 'hidden';
    }

    onResume() {
        if (this.playOverlay) this.playOverlay.style.visibility = '';
        this._syncCursorVisibility();
    }

    destroy() {
        if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
            document.exitPointerLock?.();
        }
        if (this.canvas) {
            this.canvas.style.cursor = 'default';
            if (this._onPointerDown) this.canvas.removeEventListener('pointerdown', this._onPointerDown);
        }
        if (typeof window !== 'undefined' && this._onMouseMove) {
            window.removeEventListener('mousemove', this._onMouseMove);
        } else if (this.canvas?.removeEventListener && this._onMouseMove) {
            this.canvas.removeEventListener('mousemove', this._onMouseMove);
        }
        this.playButton?.removeEventListener('click', this._onPlay);
        if (this.playButton) {
            for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
                this.playButton.removeEventListener(type, this._stopPlayPointer);
            }
        }
        this.playOverlay?.remove();
        this.playOverlay = null;
    }

    onResize() {}

    preparePauseSettings(settings) {
        validatePogoCloudJumpSettings(settings);
        this.parameters = readPogoCloudJumpSettings(settings);
        this._syncCursorVisibility();
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        return { ...readPogoCloudJumpSettings(settings) };
    }

    static getSettingsSchema() {
        const d = POGO_CLOUD_JUMP_DEFAULTS;
        return [
            { key: 'springStiffness', label: 'Spring stiffness [N/m]', type: 'range', min: 200, max: 3000, step: 20, default: d.springStiffness, group: 'Spring & legs' },
            { key: 'springRestLength', label: 'Spring rest length [m]', type: 'range', min: 0.2, max: 1.6, step: 0.02, default: d.springRestLength, group: 'Spring & legs' },
            { key: 'legBentLength', label: 'Bent leg length [m]', type: 'range', min: 0.05, max: 0.6, step: 0.01, default: d.legBentLength, group: 'Spring & legs' },
            { key: 'legExtendedLength', label: 'Extended leg length [m]', type: 'range', min: 0.2, max: 1.4, step: 0.01, default: d.legExtendedLength, group: 'Spring & legs' },
            { key: 'mouseAimEnabled', label: 'Enable mouse aiming', type: 'toggle', default: d.mouseAimEnabled, group: 'Controls' },
            { key: 'lockMouseYToTop', label: 'Lock mouse Y to top of window', type: 'toggle', default: d.lockMouseYToTop, group: 'Controls' },
            { key: 'angularSpeed', label: 'Rotation speed [°/s]', type: 'range', min: 30, max: 540, step: 5, default: d.angularSpeed, group: 'Controls' },
            { key: 'monsterMass', label: 'Monster mass [kg]', type: 'range', min: 2, max: 40, step: 0.5, default: d.monsterMass, group: 'Monster physics' },
            { key: 'gravity', label: 'Gravity [m/s²]', type: 'range', min: 4, max: 35, step: 0.5, default: d.gravity, group: 'Monster physics' },
            { key: 'monsterHeight', label: 'Monster scale [m]', type: 'range', min: 0.4, max: 1.6, step: 0.02, default: d.monsterHeight, group: 'Monster physics' },
            { key: 'platformGap', label: 'Mean plank gap [m]', type: 'range', min: 1.2, max: 5.0, step: 0.1, default: d.platformGap, group: 'Course' },
        ];
    }

    static getControlsSchema() {
        return [
            {
                action: 'rotateCcw',
                label: 'Rotate CCW (Left / Counter-Clockwise)',
                defaultBindings: [
                    { type: 'keyboard', code: 'KeyT' },
                    { type: 'keyboard', code: 'ArrowLeft' },
                    { type: 'keyboard', code: 'KeyA' },
                ],
            },
            {
                action: 'rotateCw',
                label: 'Rotate CW (Right / Clockwise)',
                defaultBindings: [
                    { type: 'keyboard', code: 'KeyZ' },
                    { type: 'keyboard', code: 'KeyY' },
                    { type: 'keyboard', code: 'ArrowRight' },
                    { type: 'keyboard', code: 'KeyD' },
                ],
            },
            {
                action: 'extendLegs',
                label: 'Extend legs / Pogo jump push',
                defaultBindings: [
                    { type: 'keyboard', code: 'Space' },
                    { type: 'keyboard', code: 'ArrowUp' },
                    { type: 'keyboard', code: 'KeyW' },
                    { type: 'mouse', code: 0 },
                ],
            },
        ];
    }
}
