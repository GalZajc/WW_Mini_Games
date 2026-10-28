import json

with open("scripts/OUTPUT/eggo-model-state_2026-10-24T04-17-46-162Z/states.json", "r") as f:
    records = json.load(f)

for r in records:
    frame = r["frame"]
    cpu = r["fields"][1]
    egg = cpu["egg"]
    print(f"Frame {frame}: round={r.get('round')} cpu x={egg['x']} y={egg['y']} vy={egg['vy']} state={cpu['nativeActorState']} carried={egg.get('carried')} jumper_captured={cpu.get('jumper', {}).get('captured')}")
