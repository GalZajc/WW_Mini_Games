const normalizeEntry = value => String(value ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('sl-SI');

function compileCondition(type, condition) {
    const source = condition === '.' ? '.' : condition;
    return new RegExp(type === 'PFX' ? `^(?:${source})` : `(?:${source})$`, 'u');
}

/** Parse the PFX/SFX subset used by the official Slovenian Hunspell dictionary. */
export function parseHunspellAff(raw) {
    const groups = new Map();
    const lines = String(raw ?? '').split(/\r?\n/);
    for (const sourceLine of lines) {
        const line = sourceLine.trim();
        if (!/^(PFX|SFX)\s/u.test(line)) continue;
        const fields = line.split(/\s+/u);
        const [type, flag] = fields;
        if (fields.length === 4 && /^[YN]$/u.test(fields[2])) {
            groups.set(flag, { type, flag, cross: fields[2] === 'Y', rules: [] });
            continue;
        }
        if (fields.length < 5) continue;
        const group = groups.get(flag);
        if (!group || group.type !== type) continue;
        const strip = fields[2] === '0' ? '' : fields[2];
        const add = (fields[3].split('/')[0] === '0' ? '' : fields[3].split('/')[0]);
        group.rules.push({ type, strip, add, condition: compileCondition(type, fields[4]) });
    }
    return groups;
}

export function parseHunspellDic(raw) {
    const entries = [];
    const lines = String(raw ?? '').split(/\r?\n/u);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();
        if (!line || (index === 0 && /^\d+$/u.test(line))) continue;
        const token = line.split(/\s+/u)[0];
        const slash = token.indexOf('/');
        const word = normalizeEntry(slash < 0 ? token : token.slice(0, slash));
        const flags = slash < 0 ? '' : token.slice(slash + 1);
        if (word) entries.push({ word, flags: [...flags] });
    }
    return entries;
}

function applyRule(word, rule) {
    if (!rule.condition.test(word)) return null;
    if (rule.type === 'PFX') {
        if (rule.strip && !word.startsWith(rule.strip)) return null;
        return rule.add + word.slice(rule.strip.length);
    }
    if (rule.strip && !word.endsWith(rule.strip)) return null;
    return word.slice(0, word.length - rule.strip.length) + rule.add;
}

function expandEntry(entry, groups, addWord) {
    addWord(entry.word);
    const activeGroups = entry.flags.map(flag => groups.get(flag)).filter(Boolean);
    const prefixes = activeGroups.filter(group => group.type === 'PFX');
    const suffixes = activeGroups.filter(group => group.type === 'SFX');
    for (const group of activeGroups) {
        for (const rule of group.rules) {
            const expanded = applyRule(entry.word, rule);
            if (expanded !== null) addWord(expanded);
        }
    }
    for (const prefix of prefixes) for (const suffix of suffixes) {
        if (!prefix.cross || !suffix.cross) continue;
        for (const prefixRule of prefix.rules) {
            const prefixed = applyRule(entry.word, prefixRule);
            if (prefixed === null) continue;
            for (const suffixRule of suffix.rules) {
                const expanded = applyRule(prefixed, suffixRule);
                if (expanded !== null) addWord(expanded);
            }
        }
    }
}

function expansionContext(dicRaw, affRaw, options) {
    const minimumLength = Math.max(1, Number(options.minimumLength ?? 2));
    const maximumLength = Math.max(minimumLength, Number(options.maximumLength ?? 21));
    const allowed = options.allowed ?? /^[a-zčšž]+$/u;
    const groups = parseHunspellAff(affRaw);
    const entries = parseHunspellDic(dicRaw);
    const words = new Set();
    const addWord = word => {
        const normalized = normalizeEntry(word);
        if (normalized.length >= minimumLength && normalized.length <= maximumLength && allowed.test(normalized)) words.add(normalized);
    };
    return { groups, entries, words, addWord };
}

/** Expand stems exactly as the dictionary's Hunspell flags prescribe. */
export function expandHunspellDictionary(dicRaw, affRaw, options = {}) {
    const { groups, entries, words, addWord } = expansionContext(dicRaw, affRaw, options);
    for (const entry of entries) expandEntry(entry, groups, addWord);
    return words;
}

/** Browser-friendly expansion that yields regularly so loading progress renders. */
export async function expandHunspellDictionaryAsync(dicRaw, affRaw, options = {}) {
    const { groups, entries, words, addWord } = expansionContext(dicRaw, affRaw, options);
    const chunkSize = Math.max(250, Math.round(Number(options.chunkSize ?? 4000)));
    for (let index = 0; index < entries.length; index++) {
        expandEntry(entries[index], groups, addWord);
        if ((index + 1) % chunkSize === 0) {
            options.onProgress?.((index + 1) / entries.length);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    options.onProgress?.(1);
    return words;
}
