// Headless Ghidra helper for the local Eggo Mania GBA ROM.
// Modes: prepare <output-dir>  |  export <output-dir>
// The ROM itself is imported read-only as a raw image at 0x08000000.
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSpace;
import ghidra.program.model.lang.Register;
import ghidra.program.model.lang.RegisterValue;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.SourceType;
import ghidra.util.task.TaskMonitor;
import java.io.BufferedWriter;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

public class EggoGhidraExport extends ghidra.app.script.GhidraScript {
    private static final long CODE_START = 0x08005f00L;
    private static final long CODE_END = 0x08008300L;
    private static final long[] ENTRIES = {
        0x08005f48L, // bounded tower-route search
        0x080065f8L, // Hard Survival CPU controller
        0x080066acL, // native CPU timers and decision gate
        0x08006a14L, // ordinary piece policy
        0x08006db4L, // special-item policy dispatcher
        0x080070acL, // incremental rotation/column sweep
        0x08007208L, // candidate scoring and placement search
        0x08007abcL, // CPU movement decisions
        0x08007dc4L, // horizontal steering
        0x08007ef0L, // enemy avoidance
        0x0800819aL, // rotation request gate
        0x080081fcL  // direction cooldown and key filtering
    };
    private static final String[] NAMES = {
        "cpu_route_search", "cpu_survival_controller", "cpu_timer_gate",
        "cpu_ordinary_piece_policy", "cpu_special_item_policy",
        "cpu_candidate_sweep", "cpu_candidate_scoring", "cpu_movement_policy",
        "cpu_horizontal_steering", "cpu_enemy_avoidance", "cpu_rotation_gate",
        "cpu_direction_filter"
    };

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) throw new IllegalArgumentException("Expected: prepare|export <output-dir>");
        Path output = Paths.get(args[1]);
        Files.createDirectories(output);
        if ("prepare".equals(args[0])) prepare();
        else if ("export".equals(args[0])) export(output);
        else throw new IllegalArgumentException("Unknown mode: " + args[0]);
    }

    private Address romAddress(long value) { return toAddr(value); }

    private void prepare() throws Exception {
        AddressSpace ram = currentProgram.getAddressFactory().getAddressSpace("ram");
        if (ram == null) ram = currentProgram.getAddressFactory().getDefaultAddressSpace();
        Memory memory = currentProgram.getMemory();
        addRamBlock(memory, ram, "EWRAM", 0x02000000L, 0x40000L);
        addRamBlock(memory, ram, "IWRAM", 0x03000000L, 0x8000L);
        addRamBlock(memory, ram, "IO", 0x04000000L, 0x400L);
        addRamBlock(memory, ram, "PaletteRAM", 0x05000000L, 0x400L);
        addRamBlock(memory, ram, "VRAM", 0x06000000L, 0x18000L);
        addRamBlock(memory, ram, "OAM", 0x07000000L, 0x400L);

        Register thumb = currentProgram.getProgramContext().getRegister("TMode");
        if (thumb == null) throw new IllegalStateException("ARM TMode context register not found.");
        currentProgram.getProgramContext().setValue(thumb,
            romAddress(CODE_START), romAddress(CODE_END), BigInteger.ONE);

        // Seed known, previously instruction-verified Thumb entries from leaves
        // back toward the top-level controller so their function boundaries stay distinct.
        for (int index = ENTRIES.length - 1; index >= 0; index--) {
            Address entry = romAddress(ENTRIES[index]);
            disassemble(entry);
            Function function = createFunction(entry, NAMES[index]);
            if (function != null) function.setName(NAMES[index], SourceType.USER_DEFINED);
            println(String.format("seeded %s at %08x", NAMES[index], ENTRIES[index]));
        }
    }

    private void addRamBlock(Memory memory, AddressSpace ram, String name, long start, long size)
            throws Exception {
        Address address = ram.getAddress(start);
        if (memory.getBlock(address) != null) return;
        MemoryBlock block = memory.createUninitializedBlock(name, address, size, false);
        block.setRead(true);
        block.setWrite(true);
        block.setExecute(false);
    }

    private void export(Path output) throws Exception {
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        List<String> json = new ArrayList<>();
        Path cPath = output.resolve("cpu-controller-decompiled.c");
        Path listingPath = output.resolve("cpu-controller-listing.txt");

        try (BufferedWriter cWriter = Files.newBufferedWriter(cPath, StandardCharsets.UTF_8);
             BufferedWriter listingWriter = Files.newBufferedWriter(listingPath, StandardCharsets.UTF_8)) {
            for (int index = 0; index < ENTRIES.length; index++) {
                Address entry = romAddress(ENTRIES[index]);
                Function function = currentProgram.getFunctionManager().getFunctionAt(entry);
                if (function == null) {
                    disassemble(entry);
                    function = createFunction(entry, NAMES[index]);
                }
                if (function == null) {
                    json.add("{\"name\":" + quote(NAMES[index]) + ",\"address\":" +
                        quote(String.format("0x%08x", ENTRIES[index])) + ",\"error\":\"function not created\"}");
                    continue;
                }
                function.setName(NAMES[index], SourceType.USER_DEFINED);
                TreeSet<String> calls = new TreeSet<>();
                InstructionIterator instructions = currentProgram.getListing().getInstructions(function.getBody(), true);
                while (instructions.hasNext()) {
                    Instruction instruction = instructions.next();
                    listingWriter.write(String.format("%08x  %-10s %s%n",
                        instruction.getAddress().getOffset(), instruction.getMnemonicString(),
                        instruction.getDefaultOperandRepresentation(0)));
                    for (Reference reference : currentProgram.getReferenceManager().getReferencesFrom(instruction.getAddress())) {
                        if (reference.getReferenceType().isCall()) {
                            calls.add(String.format("0x%08x", reference.getToAddress().getOffset()));
                        }
                    }
                }
                DecompileResults result = decompiler.decompileFunction(function, 60, monitor);
                String c = result.decompileCompleted() && result.getDecompiledFunction() != null
                    ? result.getDecompiledFunction().getC()
                    : "/* decompilation failed: " + result.getErrorMessage() + " */";
                cWriter.write("\n/* " + NAMES[index] + " at " +
                    String.format("0x%08x", ENTRIES[index]) + " */\n");
                cWriter.write(c);
                cWriter.write("\n\n");
                json.add("{\"name\":" + quote(NAMES[index]) +
                    ",\"address\":" + quote(String.format("0x%08x", ENTRIES[index])) +
                    ",\"bodyStart\":" + quote(function.getBody().getMinAddress().toString()) +
                    ",\"bodyEnd\":" + quote(function.getBody().getMaxAddress().toString()) +
                    ",\"decompileCompleted\":" + result.decompileCompleted() +
                    ",\"calls\":" + stringArray(calls) + "}");
                println(String.format("exported %s (%s)", NAMES[index], result.decompileCompleted()));
            }
        }
        Files.write(output.resolve("cpu-controller-functions.json"),
            ("[\n  " + String.join(",\n  ", json) + "\n]\n").getBytes(StandardCharsets.UTF_8));
        decompiler.dispose();
    }

    private static String stringArray(Iterable<String> values) {
        List<String> escaped = new ArrayList<>();
        for (String value : values) escaped.add(quote(value));
        return "[" + String.join(",", escaped) + "]";
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\r", "\\r").replace("\n", "\\n") + "\"";
    }
}
