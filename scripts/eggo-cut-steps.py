"""Cut the first N frames from an Eggo steps.json: python scripts/eggo-cut-steps.py steps.json N out.json"""
import json, sys
steps = json.load(open(sys.argv[1], encoding='utf-8')); limit = int(sys.argv[2]); out = []; t = 0
for d, keys in steps:
    if t + d <= limit: out.append([d, keys]); t += d
    else:
        if limit - t > 0: out.append([limit - t, keys]); t = limit
        break
json.dump(out, open(sys.argv[3], 'w', encoding='utf-8'), separators=(',', ':'))
print(t, 'frames', len(out), 'steps')
