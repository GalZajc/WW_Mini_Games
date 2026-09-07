// Local, pinned HiGHS runtime. No network request is needed while playing.
const runtime = new URL('./vendor/highs/', import.meta.url);
let loadHighs;
if (globalThis.process?.versions?.node && globalThis.process?.type !== 'renderer') {
    loadHighs = (await import('./vendor/highs/highs.js')).default;
} else {
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('highs.js', runtime).href;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Cannot load the local structural solver'));
        document.head.append(script);
    });
    loadHighs = globalThis.Module;
}
const native = await loadHighs({
    locateFile: file => new URL(file, runtime).href,
});

// The upstream convenience API rounds solutions to six significant digits.
// Read native full-precision values so near-neutral configurations stay exact.
const writeSolution = native.cwrap('Highs_writeSolution', 'number', ['number', 'string']);
const setBool = native.cwrap('Highs_setBoolOptionValue', 'number', ['number', 'string', 'number']);
const setDouble = native.cwrap('Highs_setDoubleOptionValue', 'number', ['number', 'string', 'number']);
const setString = native.cwrap('Highs_setStringOptionValue', 'number', ['number', 'string', 'string']);
export const structuralSolver = {
    solve(model, options) {
        const handle = native._Highs_create();
        const check = status => { if (status < 0) throw new Error('HiGHS structural solve failed'); };
        try {
            native.FS.writeFile('/structural.lp', model);
            for (const [name, value] of Object.entries(options)) {
                const setter = typeof value === 'boolean' ? setBool : typeof value === 'number' ? setDouble : setString;
                check(setter(handle, name, value));
            }
            check(native.Highs_readModel(handle, '/structural.lp'));
            check(native._Highs_run(handle));
            const status = native._Highs_getModelStatus(handle);
            if (status !== 7) return { Status: `HiGHS status ${status}` };
            check(writeSolution(handle, '/structural.sol'));
            return parseSolution(native.FS.readFile('/structural.sol', { encoding: 'utf8' }));
        } finally {
            native._Highs_destroy(handle);
            for (const file of ['/structural.lp', '/structural.sol']) {
                if (native.FS.analyzePath(file).exists) native.FS.unlink(file);
            }
        }
    },
};

function parseSolution(text) {
    const result = { Status: 'Optimal', Columns: {}, Rows: [], ObjectiveValue: 0 };
    const rows = new Map();
    let kind = null, section = null;
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('# Primal')) { kind = 'Primal'; section = null; }
        else if (line.startsWith('# Dual')) { kind = 'Dual'; section = null; }
        else if (line.startsWith('# Columns')) section = 'Columns';
        else if (line.startsWith('# Rows')) section = 'Rows';
        else if (line.startsWith('#')) { kind = null; section = null; }
        else if (line.startsWith('Objective ')) result.ObjectiveValue = Number(line.slice(10));
        else if (kind && section) {
            const [name, value] = line.trim().split(/\s+/);
            if (!name || !Number.isFinite(Number(value))) continue;
            if (section === 'Columns') {
                result.Columns[name] ||= {};
                result.Columns[name][kind] = Number(value);
            } else {
                if (!rows.has(name)) rows.set(name, { Name: name });
                rows.get(name)[kind] = Number(value);
            }
        }
    }
    result.Rows = [...rows.values()];
    return result;
}

export const STRUCTURAL_SOLVER_OPTIONS = Object.freeze({
    output_flag: false,
    primal_feasibility_tolerance: 1e-9,
    dual_feasibility_tolerance: 1e-9,
    solver: 'simplex',
});
