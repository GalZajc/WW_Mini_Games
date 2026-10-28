// Headless Ghidra setup/index pass for the local Eggo Mania GBA ROM.
// The ROM is read-only; this indexes code reached from the GBA entry point and
// verified Survival/Hard roots without pretending every ROM byte is code.
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSpace;
import ghidra.program.model.lang.Register;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.SourceType;
import java.io.BufferedWriter;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

public class EggoGhidraSurvival extends ghidra.app.script.GhidraScript {
    private static final long ROM_START = 0x08000000L;
    private static final long ROM_END = 0x08400000L;
    private static final long THUMB_START = 0x08005f00L;
    private static final long THUMB_END = 0x08008300L;
    private static final long[] ENTRIES = {
        0x08005f48L, 0x080065f8L, 0x080066acL, 0x08006a14L,
        0x08006db4L, 0x080070acL, 0x08007208L, 0x08007abcL,
        0x08007dc4L, 0x08007ef0L, 0x0800819aL, 0x080081fcL
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

    private Address at(long value) { return toAddr(value); }

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
        currentProgram.getProgramContext().setValue(thumb, at(THUMB_START), at(THUMB_END), BigInteger.ONE);

        // The GBA cartridge header begins with an ARM branch at 0x08000000.
        // Create the real reset root, then explicitly seed verified Thumb code.
        disassemble(at(ROM_START));
        Function reset = createFunction(at(ROM_START), "gba_rom_entry");
        if (reset != null) reset.setName("gba_rom_entry", SourceType.USER_DEFINED);
        println("seeded ARM GBA entry at 08000000");
        for (int i = ENTRIES.length - 1; i >= 0; i--) {
            Address entry = at(ENTRIES[i]);
            disassemble(entry);
            Function function = createFunction(entry, NAMES[i]);
            if (function != null) function.setName(NAMES[i], SourceType.USER_DEFINED);
            println(String.format("seeded verified Thumb routine %s at %08x", NAMES[i], ENTRIES[i]));
        }
    }

    private void addRamBlock(Memory memory, AddressSpace space, String name, long start, long size)
            throws Exception {
        Address address = space.getAddress(start);
        if (memory.getBlock(address) != null) return;
        MemoryBlock block = memory.createUninitializedBlock(name, address, size, false);
        block.setRead(true);
        block.setWrite(true);
        block.setExecute(false);
    }

    private void export(Path output) throws Exception {
        Path jsonPath = output.resolve("survival-functions.json");
        Path csvPath = output.resolve("survival-functions.csv");
        Path callsPath = output.resolve("survival-call-edges.csv");
        List<String> functionsJson = new ArrayList<>();
        int functionCount = 0;
        try (BufferedWriter csv = Files.newBufferedWriter(csvPath, StandardCharsets.UTF_8);
             BufferedWriter calls = Files.newBufferedWriter(callsPath, StandardCharsets.UTF_8)) {
            csv.write("name,start,end,instruction_count\n");
            calls.write("caller,callee,reference_type\n");
            FunctionIterator iterator = currentProgram.getFunctionManager().getFunctions(true);
            while (iterator.hasNext()) {
                Function function = iterator.next();
                long start = function.getEntryPoint().getOffset();
                if (start < ROM_START || start >= ROM_END) continue;
                functionCount++;
                int instructionCount = 0;
                TreeSet<String> callees = new TreeSet<>();
                InstructionIterator instructions = currentProgram.getListing().getInstructions(function.getBody(), true);
                while (instructions.hasNext()) {
                    Instruction instruction = instructions.next();
                    instructionCount++;
                    for (Reference reference : currentProgram.getReferenceManager().getReferencesFrom(instruction.getAddress())) {
                        if (reference.getReferenceType().isCall()) {
                            String target = String.format("0x%08x", reference.getToAddress().getOffset());
                            callees.add(target);
                            calls.write(String.format("%s,%s,%s\n",
                                String.format("0x%08x", start), target,
                                reference.getReferenceType().getName()));
                        }
                    }
                }
                String name = function.getName(true);
                String end = function.getBody().getMaxAddress().toString();
                csv.write(csv(name) + "," + String.format("0x%08x", start) + "," + end + "," + instructionCount + "\n");
                functionsJson.add("{\"name\":" + quote(name) +
                    ",\"start\":" + quote(String.format("0x%08x", start)) +
                    ",\"end\":" + quote(end) +
                    ",\"instructionCount\":" + instructionCount +
                    ",\"calls\":" + stringArray(callees) + "}");
            }
        }
        Files.write(jsonPath, ("[\n  " + String.join(",\n  ", functionsJson) + "\n]\n")
            .getBytes(StandardCharsets.UTF_8));
        Files.write(output.resolve("analysis-summary.json"),
            ("{\n  \"romRange\": [\"0x08000000\", \"0x08400000\"],\n" +
             "  \"functionRecordCount\": " + functionCount + ",\n" +
             "  \"analysisStatus\": \"See headless.log for whether auto-analysis completed or timed out.\",\n" +
             "  \"index\": \"All function records Ghidra created with entry points in the imported ROM range.\",\n" +
             "  \"scopeLimit\": \"The record count includes false positives where graphics, tables, or other ROM data were decoded as code; it is not the game's true function count or a complete decompilation. Indirect targets require review.\"\n}\n")
            .getBytes(StandardCharsets.UTF_8));
        println("exported " + functionCount + " Ghidra ROM function records (may include data false positives)");
    }

    private static String csv(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
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
