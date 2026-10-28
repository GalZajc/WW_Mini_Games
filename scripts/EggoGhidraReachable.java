// Export decompilation only for functions connected by direct ROM calls to
// the GBA startup body, verified Survival/Hard CPU routines, or measured
// Survival actor update.
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.symbol.Reference;
import java.io.BufferedWriter;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

public class EggoGhidraReachable extends ghidra.app.script.GhidraScript {
    private static final long ROM_START = 0x08000000L;
    private static final long ROM_END = 0x08400000L;
    private static final long[] ROOTS = {
        0x080000c0L, // first code after the cartridge's reset branch
        0x08005e30L, // field-manager update invoked once for each Survival field
        0x080190a0L, // frame loop projects player/CPU camera state before actor updates
        0x08019be4L, // VBlank copy of the waterline-dependent BG3/window registers
        0x08019cc8L, // per-field waterline screen-position compositor
        0x08005f48L, 0x080065f8L, 0x080066acL, 0x08006a14L,
        0x08006db4L, 0x080070acL, 0x08007208L, 0x08007abcL,
        0x08007dc4L, 0x08007ef0L, 0x0800819aL, 0x080081fcL,
        0x0800f7a0L, // actor movement/collision update; reached through state dispatch
        0x0800ea36L, // actor animation selector/handler dispatcher
        0x0800d748L, // actor-state dispatch; its table is at 0x0800d7f8
        0x0800ded8L, 0x0800dc28L, 0x0800d814L, 0x0800e0e8L,
        0x0800e040L, 0x0800e068L, 0x0800e0acL
    };
    private static final String[] ACTOR_ROOT_NAMES = {
        "actor_state_dispatch", "actor_state_1", "actor_state_2", "actor_state_3",
        "actor_state_4", "actor_state_5", "actor_state_6", "actor_state_7"
    };
    private static final long[] ACTOR_ROOTS = {
        0x0800d748L, 0x0800ded8L, 0x0800dc28L, 0x0800d814L,
        0x0800e0e8L, 0x0800e040L, 0x0800e068L, 0x0800e0acL
    };

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 1) throw new IllegalArgumentException("Expected output directory.");
        export(Paths.get(args[0]));
    }

    private void export(Path output) throws Exception {
        Files.createDirectories(output);
        seedActorJumpTableTargets();
        Map<Long, Function> reached = new HashMap<>();
        Map<Long, Set<Long>> edges = new HashMap<>();
        ArrayDeque<Long> pending = new ArrayDeque<>();
        for (long root : ROOTS) pending.add(root);

        while (!pending.isEmpty() && reached.size() < 600) {
            long address = pending.removeFirst();
            if (reached.containsKey(address) || address < ROM_START || address >= ROM_END) continue;
            Function function = currentProgram.getFunctionManager().getFunctionAt(toAddr(address));
            if (function == null) {
                function = currentProgram.getFunctionManager().getFunctionContaining(toAddr(address));
                if (function != null) address = function.getEntryPoint().getOffset();
            }
            if (reached.containsKey(address)) continue;
            if (function == null) continue;
            reached.put(address, function);
            TreeSet<Long> callees = new TreeSet<>();
            InstructionIterator instructions = currentProgram.getListing().getInstructions(function.getBody(), true);
            while (instructions.hasNext()) {
                Instruction instruction = instructions.next();
                for (Reference reference : currentProgram.getReferenceManager().getReferencesFrom(instruction.getAddress())) {
                    if (!reference.getReferenceType().isCall()) continue;
                    long target = reference.getToAddress().getOffset();
                    if (target < ROM_START || target >= ROM_END) continue;
                    callees.add(target);
                    if (!reached.containsKey(target)) pending.addLast(target);
                }
            }
            edges.put(address, callees);
        }

        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        int completed = 0;
        int failed = 0;
        Path cPath = output.resolve("survival-reachable-decompiled.c");
        Path jsonPath = output.resolve("survival-reachable-functions.json");
        Path edgePath = output.resolve("survival-reachable-call-edges.csv");
        List<String> json = new ArrayList<>();
        try (BufferedWriter c = Files.newBufferedWriter(cPath, StandardCharsets.UTF_8);
             BufferedWriter edgeCsv = Files.newBufferedWriter(edgePath, StandardCharsets.UTF_8)) {
            edgeCsv.write("caller,callee\n");
            for (Map.Entry<Long, Function> item : new java.util.TreeMap<>(reached).entrySet()) {
                long start = item.getKey();
                Function function = item.getValue();
                int instructionCount = 0;
                InstructionIterator instructions = currentProgram.getListing().getInstructions(function.getBody(), true);
                while (instructions.hasNext()) { instructions.next(); instructionCount++; }
                Set<Long> callees = edges.getOrDefault(start, new TreeSet<Long>());
                List<String> callJson = new ArrayList<>();
                for (long callee : callees) {
                    edgeCsv.write(String.format("0x%08x,0x%08x\n", start, callee));
                    callJson.add(quote(String.format("0x%08x", callee)));
                }
                int timeoutSeconds = (start == 0x080065f8L || start == 0x080066acL || start == 0x08006a14L ||
                    start == 0x0800d748L || start == 0x0800d814L || start == 0x0800e0e8L) ? 30 : 4;
                DecompileResults result = decompiler.decompileFunction(function, timeoutSeconds, monitor);
                boolean ok = result.decompileCompleted() && result.getDecompiledFunction() != null;
                if (ok) completed++; else failed++;
                c.write("\n/* " + function.getName(true) + " at " + String.format("0x%08x", start) +
                    (ok ? " */\n" : "; decompile failed: " + clean(result.getErrorMessage()) + " */\n"));
                if (ok) c.write(result.getDecompiledFunction().getC());
                c.write("\n\n");
                json.add("{\"name\":" + quote(function.getName(true)) +
                    ",\"start\":" + quote(String.format("0x%08x", start)) +
                    ",\"end\":" + quote(function.getBody().getMaxAddress().toString()) +
                    ",\"instructionCount\":" + instructionCount +
                    ",\"decompileCompleted\":" + ok +
                    ",\"calls\":[" + String.join(",", callJson) + "]}");
            }
        }
        decompiler.dispose();
        Files.write(jsonPath, ("[\n  " + String.join(",\n  ", json) + "\n]\n")
            .getBytes(StandardCharsets.UTF_8));
        String summary = "{\n" +
            "  \"rootCount\": " + ROOTS.length + ",\n" +
            "  \"reachableFunctionCount\": " + reached.size() + ",\n" +
            "  \"decompileCompleted\": " + completed + ",\n" +
            "  \"decompileFailed\": " + failed + ",\n" +
            "  \"reachabilityLimit\": 600,\n" +
            "  \"scopeLimit\": \"Direct call references only. Indirect dispatch, function pointers, unresolved jump tables, and data/code ambiguities are not included.\"\n" +
            "}\n";
        Files.write(output.resolve("survival-reachable-summary.json"), summary.getBytes(StandardCharsets.UTF_8));
        println("decompiled " + completed + " of " + reached.size() + " functions reachable from selected roots; failures=" + failed);
    }

    private void seedActorJumpTableTargets() throws Exception {
        ghidra.program.model.lang.Register thumb = currentProgram.getProgramContext().getRegister("TMode");
        if (thumb == null) throw new IllegalStateException("ARM TMode context register not found.");
        // This small span overlaps code/data that the timed-out whole-ROM pass
        // misclassified. Rebuild only this actor state machine in Thumb mode.
        currentProgram.getListing().clearCodeUnits(toAddr(0x0800d700L), toAddr(0x0800e300L), true);
        currentProgram.getProgramContext().setValue(thumb, toAddr(0x0800d700L), toAddr(0x0800e300L), BigInteger.ONE);
        for (int i = 0; i < ACTOR_ROOTS.length; i++) {
            Address address = toAddr(ACTOR_ROOTS[i]);
            disassemble(address);
            Function function = currentProgram.getFunctionManager().getFunctionAt(address);
            if (function == null) {
                if (currentProgram.getFunctionManager().getFunctionContaining(address) != null) {
                    println(String.format("actor root %s at %08x is already inside another function",
                        ACTOR_ROOT_NAMES[i], ACTOR_ROOTS[i]));
                    continue;
                }
                function = createFunction(address, ACTOR_ROOT_NAMES[i]);
            }
            if (function != null) {
                function.setName(ACTOR_ROOT_NAMES[i], ghidra.program.model.symbol.SourceType.USER_DEFINED);
                println(String.format("seeded verified actor-state target %s at %08x",
                    ACTOR_ROOT_NAMES[i], ACTOR_ROOTS[i]));
            }
        }
    }

    private static String clean(String value) {
        return value == null ? "unknown" : value.replace("\r", " ").replace("\n", " ");
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\r", "\\r").replace("\n", "\\n") + "\"";
    }
}
