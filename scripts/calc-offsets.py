# V eval-out.json za Frame 58670 imamo:
# robX: 20, robY: 601.2311859130859
# Frame 58669: robX: 18.5625, robY: 602.6061859130859
# renderCamera za CPU na frame 58670:
# GBA OAM je imel: OBJ #27 na (146, 34)!

TILE = 16
RULES_nativeActorFloor = 720
RULES_factorySecondarySpriteLift = 16
left = 128
DIVIDER = 16
width = 112
FLOOR = 152

# V pixel-renderer.js:
# const X = x => left + x * TILE;
# worldY = (RULES.nativeActorFloor - (d.previousY ?? d.y)) / TILE;
# x = Math.floor(X((d.previousX ?? d.x) / TILE));
# y = Math.floor(FLOOR - (worldY - renderCamera) * TILE) - RULES.factorySecondarySpriteLift;

# Preverimo:
# Če je GBA robot na (146, 34):
# V GBA OAM je OBJ #31 na (166, 59)!
# Če je OBJ #31 na (166, 59) in velikost 16x16:
# Top-left je (166, 59). Spodnji desni kot je (182, 75).
# Center je (174, 67).

print("GBA OAM OBJ #31: pos=(166, 59) -> center is (174, 67)")
