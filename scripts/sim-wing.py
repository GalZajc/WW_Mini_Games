# Simulacija wingClock in wingPhase po kodi iz model.js
# vs GBA ROM koda

wingDrain = 4.25
wingSpeedScale = 2.0
wingClockInitial = 8.0
wingFrames = 8

# Poglejmo:
# GBA ROM:
# r0 = 0x44000 - 2 * vy (v 16.16)
# wingClock -= r0
# if wingClock <= 0:
#     wingClock = 0x80000 (8.0)
#     wingPhase = (wingPhase + 1) & 7

# Model.js:
# d.wingClock = (d.wingClock||0) - (wingDrain - wingSpeedScale * d.vy)
# if (d.wingClock <= 0) {
#     d.wingClock = wingClockInitial
#     d.wingPhase = ((d.wingPhase||0) + 1) % wingFrames
# }

# Začetek pri spawnu:
# V model.js: d.wingClock se začne pri undefined (torej 0) ali 8?
# Če se začne pri 0:
# 0 - (4.25 - 0) = -4.25 <= 0 -> wingClock = 8, wingPhase = 1 na prvem ticku!
# V GBA ROM-u:
# Na frame 58356 pred spawnom je bil wingClock = 8.0, wingPhase = 0!
# Na frame 58357 ob spawnu:
# vy = 0: wingClock = 8 - 4.25 = 3.75! wingPhase = 0!

print('Preverimo izračun:')
clock = 8.0 # v ROM-u pred spawnom
phase = 0
vy_list = [0.0, 0.125, 0.1875, 0.25, 0.3125, 0.375, 0.4375, 0.625, 0.5625, 0.75, 0.9375, 1.0, 1.0625, 1.125]
for i, vy in enumerate(vy_list):
    drain = 4.25 - 2.0 * vy
    clock -= drain
    if clock <= 0:
        clock = 8.0
        phase = (phase + 1) % 8
    print(f'Tick {i+1} (vy={vy}): clock={clock}, phase={phase}')
