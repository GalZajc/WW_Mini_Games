/**
 * Persistent, independent settings profiles for games with a launcher mode.
 *
 * The active profile is mirrored at the top level so existing game code can
 * continue reading `settings.foo`. All profiles are stored under the hidden
 * `modeProfiles` key. This also migrates old single-profile settings: the old
 * top-level values become the profile of the mode that was last active.
 */

const PROFILE_KEY = 'modeProfiles';

function clone(value) {
    if (value === undefined) return value;
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function modeList(modes) {
    return Array.isArray(modes) ? modes : Object.keys(modes || {});
}

function profileSchema(schema, modeKey = 'mode') {
    return (schema || []).filter(setting =>
        setting.key !== modeKey && setting.key !== PROFILE_KEY && setting.modeProfile !== false);
}

function profileDefaults(schema, modeKey) {
    return Object.fromEntries(profileSchema(schema, modeKey).map(setting => [setting.key, clone(setting.default)]));
}

function profileValues(settings, schema, modeKey) {
    const values = {};
    for (const setting of profileSchema(schema, modeKey)) {
        if (settings?.[setting.key] !== undefined) values[setting.key] = clone(settings[setting.key]);
    }
    return values;
}

export function withModeProfiles(schema) {
    if ((schema || []).some(setting => setting.key === PROFILE_KEY)) return schema;
    return [
        ...(schema || []),
        { key: PROFILE_KEY, label: 'Mode profiles', type: 'hidden', default: {} },
    ];
}

export function initializeModeSettings(rawSettings, modes, schema, fallbackMode, modeKey = 'mode') {
    const allowed = modeList(modes);
    const fallback = allowed.includes(fallbackMode) ? fallbackMode : allowed[0];
    const source = isObject(rawSettings) ? clone(rawSettings) : {};
    const currentMode = allowed.includes(source[modeKey]) ? source[modeKey] : fallback;
    const stored = isObject(source[PROFILE_KEY]) ? source[PROFILE_KEY] : {};
    const defaults = profileDefaults(schema, modeKey);
    const profiles = {};

    for (const mode of allowed) {
        profiles[mode] = {
            ...clone(defaults),
            ...(isObject(stored[mode]) ? clone(stored[mode]) : {}),
        };
    }

    // Top-level values are authoritative for the active profile. This keeps
    // legacy saves and settings just edited in the pause menu lossless.
    profiles[currentMode] = {
        ...profiles[currentMode],
        ...profileValues(source, schema, modeKey),
    };

    return {
        ...source,
        ...clone(profiles[currentMode]),
        [modeKey]: currentMode,
        [PROFILE_KEY]: profiles,
    };
}

export function switchModeSettings(rawSettings, nextMode, modes, schema, fallbackMode, modeKey = 'mode') {
    const allowed = modeList(modes);
    if (!allowed.includes(nextMode)) return initializeModeSettings(rawSettings, allowed, schema, fallbackMode, modeKey);
    const current = initializeModeSettings(rawSettings, allowed, schema, fallbackMode, modeKey);
    return {
        ...current,
        ...clone(current[PROFILE_KEY][nextMode]),
        [modeKey]: nextMode,
        [PROFILE_KEY]: current[PROFILE_KEY],
    };
}

export function syncActiveModeProfile(rawSettings, modes, schema, fallbackMode, modeKey = 'mode') {
    return initializeModeSettings(rawSettings, modes, schema, fallbackMode, modeKey);
}

export function modeProfilesOf(settings) {
    return clone(settings?.[PROFILE_KEY] || {});
}
