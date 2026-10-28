// ROM-backed Survival/Hard airborne poses. Keys are the native descriptor
// state, selected frame table and cel index; OAM uses the prior update's tuple.
export const NATIVE_PLAYER_AIR_TABLES = Object.freeze({
    7: Object.freeze({free:'0x083f2274',held:'0x083f227c'}),
    9: Object.freeze({free:'0x083f2284',held:'0x083f228c'}),
    11:Object.freeze({free:'0x083f2294',held:'0x083f229c'}),
    13:Object.freeze({free:'0x083f22a4',held:'0x083f22ac'}),
});

// The selector-3 walk table normally points into the compact actor atlas.
// Its third entry is a ROM OBJ cell that is not present in that atlas.
export const NATIVE_PLAYER_WALK_TABLES = Object.freeze({
    3: '0x083f222c',
    4: '0x083f222c',
});

export const NATIVE_PLAYER_AIR_ART = Object.freeze({
    "7|0x083f2274|0": {
        "state": "rise-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 1
    },
    "7|0x083f2274|1": {
        "state": "rise-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 2
    },
    "7|0x083f227c|0": {
        "state": "rise-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 13
    },
    "7|0x083f227c|1": {
        "state": "rise-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 3
    },
    "9|0x083f2284|0": {
        "state": "rise",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 4
    },
    "9|0x083f2284|1": {
        "state": "rise",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 5
    },
    "9|0x083f228c|0": {
        "state": "rise",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 14
    },
    "9|0x083f228c|1": {
        "state": "rise",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 15
    },
    "11|0x083f2294|0": {
        "state": "fall-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 6
    },
    "11|0x083f2294|1": {
        "state": "fall-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 16
    },
    "11|0x083f229c|0": {
        "state": "fall-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 17
    },
    "11|0x083f229c|1": {
        "state": "fall-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 18
    },
    "13|0x083f22a4|0": {
        "state": "fall-moving",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 19
    },
    "13|0x083f22a4|1": {
        "state": "fall-moving",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 20
    },
    "13|0x083f22ac|0": {
        "state": "fall-moving",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 7
    },
    "13|0x083f22ac|1": {
        "state": "fall-moving",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 8
    }
});

export const NATIVE_PLAYER_WALK_ART = Object.freeze({
    "4|0x083f222c|0": {
        "state": "walk-free",
        "row": 7,
        "frame": 0
    },
    "4|0x083f2248|0": {
        "state": "walk",
        "row": 1,
        "frame": 0
    },
    "4|0x083f222c|1": {
        "state": "walk-free",
        "row": 7,
        "frame": 1
    },
    "4|0x083f2248|1": {
        "state": "walk",
        "row": 1,
        "frame": 1
    },
    "4|0x083f222c|2": {
        "state": "walk-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 0
    },
    "4|0x083f2248|2": {
        "state": "walk",
        "row": 1,
        "frame": 2
    },
    "4|0x083f222c|3": {
        "state": "walk-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 9
    },
    "4|0x083f2248|3": {
        "state": "walk",
        "row": 1,
        "frame": 3
    },
    "4|0x083f222c|4": {
        "state": "walk-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 10
    },
    "4|0x083f2248|4": {
        "state": "walk",
        "row": 1,
        "frame": 4
    },
    "4|0x083f222c|5": {
        "state": "walk-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 11
    },
    "4|0x083f2248|5": {
        "state": "walk",
        "row": 1,
        "frame": 5
    },
    "4|0x083f222c|6": {
        "state": "walk-free",
        "sheet": "yolko-native-poses",
        "row": 0,
        "column": 12
    },
    "4|0x083f2248|6": {
        "state": "walk",
        "row": 1,
        "frame": 6
    }
});
