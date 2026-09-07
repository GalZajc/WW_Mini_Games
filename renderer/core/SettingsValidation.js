/*
 * Shared settings validation helpers.
 *
 * HTML `min`/`max` attributes are only UI hints.  A game must never silently
 * replace a value entered by the player with a different value.  The pause
 * menu therefore compares the requested numeric settings with the prepared
 * settings returned by the game and reports any actual change immediately.
 */

function numeric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function sameNumericOrValue(left, right) {
    const a = numeric(left);
    const b = numeric(right);
    if (a !== null && b !== null) return Object.is(a, b) || Math.abs(a - b) <= 1e-12;
    return Object.is(left, right);
}

/**
 * Return the numeric settings which a game changed while preparing a restart.
 * String-to-number conversion is accepted; rounding and clamping are not.
 */
export function changedNumericSettings(requested, prepared, schema = []) {
    const changed = [];
    for (const setting of schema || []) {
        if (!['number', 'range'].includes(setting.type)) continue;
        if (requested?.[setting.key] === undefined) continue;
        if (prepared?.[setting.key] === undefined) continue;
        if (!sameNumericOrValue(requested[setting.key], prepared[setting.key])) {
            changed.push({
                key: setting.key,
                label: setting.label || setting.key,
                requested: requested[setting.key],
                prepared: prepared[setting.key],
            });
        }
    }
    return changed;
}

/**
 * Validate a finite numeric field without imposing an arbitrary upper bound.
 * `minimum` is reserved for a genuine mathematical/physical domain boundary.
 */
export function requireFiniteNumber(value, label, { minimum = -Infinity, maximum = Infinity } = {}) {
    const parsed = numeric(value);
    if (parsed === null) throw new Error(`${label} must be a finite number.`);
    if (parsed < minimum || parsed > maximum) {
        // Never expose the IEEE-754 smallest subnormal as a user-facing
        // “boundary”; it is simply the implementation's spelling of > 0.
        const lower = Number.isFinite(minimum)
            ? (minimum === Number.MIN_VALUE ? ' greater than zero' : ` at least ${minimum}`)
            : '';
        const upper = Number.isFinite(maximum) ? ` at most ${maximum}` : '';
        throw new Error(`${label} must be${lower}${lower && upper ? ' and' : ''}${upper}.`);
    }
    return parsed;
}

/**
 * Validate a finite positive quantity. `maximum` is optional and is useful
 * for positive fractions such as a reachability factor; it keeps the error
 * message human-sized instead of exposing Number.MIN_VALUE as a fake floor.
 */
export function requirePositiveNumber(value, label, { allowZero = false, maximum = Infinity } = {}) {
    const parsed = numeric(value);
    if (parsed === null) throw new Error(`${label} must be a finite number.`);
    const belowMinimum = allowZero ? parsed < 0 : parsed <= 0;
    const aboveMaximum = parsed > maximum;
    if (belowMinimum || aboveMaximum) {
        const lowerMessage = allowZero ? 'non-negative' : 'greater than zero';
        const upperMessage = Number.isFinite(maximum) ? ` and at most ${maximum}` : '';
        throw new Error(`${label} must be ${lowerMessage}${upperMessage}.`);
    }
    return parsed;
}

export function requireInteger(value, label, { minimum = -Infinity, maximum = Infinity } = {}) {
    const parsed = requireFiniteNumber(value, label, { minimum, maximum });
    if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`);
    return parsed;
}

export function requireOrderedRange(lower, upper, lowerLabel, upperLabel) {
    const a = requireFiniteNumber(lower, lowerLabel);
    const b = requireFiniteNumber(upper, upperLabel);
    if (b < a) throw new Error(`${upperLabel} must be greater than or equal to ${lowerLabel}.`);
    return [a, b];
}
