import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.AddressSet;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import java.io.BufferedWriter;
import java.util.Arrays;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class EggoGhidraCameraProbe extends ghidra.app.script.GhidraScript {
    @Override
    protected void run() throws Exception {
        if (getScriptArgs().length < 1) throw new IllegalArgumentException("Expected output directory.");
        Path output = Paths.get(getScriptArgs()[0]);
        Files.createDirectories(output);
        Path report = output.resolve("camera-input-helper.txt");
        try (BufferedWriter writer = Files.newBufferedWriter(report, StandardCharsets.UTF_8)) {
            Address entry = toAddr(0x0800f6a8L);
            Function before = currentProgram.getFunctionManager().getFunctionContaining(entry);
            writer.write("Target: " + entry + "\n");
            writer.write("Existing containing function: " + (before == null ? "none" : before.getName(true) +
                " [" + before.getEntryPoint() + ".." + before.getBody().getMaxAddress() + "]") + "\n\n");
            writer.write("References to target:\n");
            ReferenceIterator targetRefs = currentProgram.getReferenceManager().getReferencesTo(entry);
            while (targetRefs.hasNext()) {
                Reference ref = targetRefs.next();
                writer.write("  " + ref.getFromAddress() + " " + ref.getReferenceType() + "\n");
            }
            Address camera = toAddr(0x02003914L);
            writer.write("\nReferences to player camera position 0x02003914:\n");
            ReferenceIterator cameraRefs = currentProgram.getReferenceManager().getReferencesTo(camera);
            while (cameraRefs.hasNext()) {
                Reference ref = cameraRefs.next();
                Function caller = currentProgram.getFunctionManager().getFunctionContaining(ref.getFromAddress());
                writer.write("  " + ref.getFromAddress() + " " + ref.getReferenceType() + " in " +
                    (caller == null ? "<no function>" : caller.getName(true)) + "\n");
                Instruction instruction = currentProgram.getListing().getInstructionAt(ref.getFromAddress());
                if (instruction != null) {
                    writer.write("    instruction: " + instruction + "\n");
                    Instruction previous = instruction.getPrevious();
                    if (previous != null) writer.write("    previous: " + previous + "\n");
                    Instruction next = instruction.getNext();
                    if (next != null) writer.write("    next: " + next + "\n");
                }
            }
            for (long address : new long[]{0x0200f3ccL, 0x0200f3d0L, 0x0200f3e8L, 0x0200f3ecL}) {
                writer.write("\nReferences to camera-follow source " + toAddr(address) + ":\n");
                ReferenceIterator sourceRefs = currentProgram.getReferenceManager().getReferencesTo(toAddr(address));
                while (sourceRefs.hasNext()) {
                    Reference ref = sourceRefs.next();
                    Function caller = currentProgram.getFunctionManager().getFunctionContaining(ref.getFromAddress());
                    writer.write("  " + ref.getFromAddress() + " " + ref.getReferenceType() + " in " +
                        (caller == null ? "<no function>" : caller.getName(true)) + "\n");
                }
            }
            writer.write("\nReferences to the 0x0eb8 field-offset literal:\n");
            for (long address : new long[]{0x08004948L,0x080049e8L,0x0800fbf8L,
                0x0800fc48L,0x0800fd18L,0x080100c0L}) {
                Address literalAddress = toAddr(address);
                writer.write("  Literal " + literalAddress + ":\n");
                ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(literalAddress);
                while (refs.hasNext()) {
                    Reference ref = refs.next();
                    Function caller = currentProgram.getFunctionManager().getFunctionContaining(ref.getFromAddress());
                    Instruction instruction = currentProgram.getListing().getInstructionAt(ref.getFromAddress());
                    writer.write("    " + ref.getFromAddress() + " in " +
                        (caller == null ? "<no function>" : caller.getName(true)) +
                        (instruction == null ? "" : " : " + instruction) + "\n");
                }
            }
            writer.write("\nThumb disassembly around camera write in 0x080187b8:\n");
            InstructionIterator cameraBlock = currentProgram.getListing().getInstructions(
                new AddressSet(toAddr(0x08018a70L), toAddr(0x08018c0bL)), true);
            while (cameraBlock.hasNext()) {
                Instruction instruction = cameraBlock.next();
                writer.write("  " + instruction.getAddress() + ": " + instruction + "\n");
            }
            writer.write("\nState dispatch tables (fixed-width pointers):\n");
            for (long table : new long[]{0x0801882cL,0x08018a20L}) {
                writer.write("  Table " + toAddr(table) + ":\n");
                for (int index=0; index<20; index++) {
                    Address tableEntry=toAddr(table + 4L*index);
                    writer.write("    " + index + " -> ");
                    try { writer.write(String.format("0x%08x\n", currentProgram.getMemory().getInt(tableEntry))); }
                    catch (Exception ex) { writer.write("<unreadable: " + ex.getMessage() + ">\n"); }
                }
            }
            writer.write("\nActor animation-selector table at 0x0800eac0:\n");
            for (int index=0; index<11; index++) {
                Address animationEntry=toAddr(0x0800eac0L+4L*index);
                writer.write("  " + index + " -> ");
                try { writer.write(String.format("0x%08x\n", currentProgram.getMemory().getInt(animationEntry))); }
                catch (Exception ex) { writer.write("<unreadable: " + ex.getMessage() + ">\n"); }
            }
            writer.write("\nActor animation-selector dispatch instructions:\n");
            long[][] animationRanges={{0x0800ea36L,0x0800eabcL},{0x0800eaecL,0x0800eb60L},
                {0x0800ec00L,0x0800ec70L},
                {0x0800ed40L,0x0800ed90L}};
            for (long[] range : animationRanges) {
                writer.write("  Range " + toAddr(range[0]) + ".." + toAddr(range[1]) + ":\n");
                if (currentProgram.getListing().getInstructionAt(toAddr(range[0])) == null)
                    disassemble(toAddr(range[0]));
                InstructionIterator instructions=currentProgram.getListing().getInstructions(
                    new AddressSet(toAddr(range[0]),toAddr(range[1])),true);
                while (instructions.hasNext()) {
                    Instruction instruction=instructions.next();
                    writer.write("    " + instruction.getAddress() + ": " + instruction + "\n");
                }
            }
            writer.write("\nTracker state-handler instructions (from the dispatch-table entries):\n");
            long[] handlerEntries = new long[]{
                0x080188c4L,0x080188e8L,0x0801887cL,0x080188a0L,0x0801890cL,
                0x08018930L,0x08018954L,0x080189d0L,0x08018978L,0x0801899cL,
                0x08018ab8L,0x08018bc4L,0x08018a70L,0x08018a94L,0x08018adcL,
                0x08018b00L,0x08018b24L,0x08018b90L,0x08018b48L,0x08018b6cL
            };
            for (long handler : handlerEntries) {
                Address start = toAddr(handler);
                writer.write("  Handler " + start + ":\n");
                if (currentProgram.getListing().getInstructionAt(start) == null) disassemble(start);
                InstructionIterator block = currentProgram.getListing().getInstructions(
                    new AddressSet(start, start.add(0x50)), true);
                while (block.hasNext()) {
                    Instruction instruction = block.next();
                    if (instruction.getAddress().getOffset() >= handler + 0x50) break;
                    writer.write("    " + instruction.getAddress() + ": " + instruction + "\n");
                    if (instruction.getFlowType().isTerminal()) break;
                }
            }
            writer.write("\nLiteral-pool values used by the camera-writing block:\n");
            for (long literal : new long[]{0x08018c0cL, 0x08018c10L, 0x08018c14L, 0x08018c18L,
                0x08018c1cL, 0x08018c20L, 0x08018c24L, 0x08018c28L, 0x08018c2cL,
                0x08018c30L, 0x08018c34L}) {
                Address literalAddress = toAddr(literal);
                writer.write("  " + literalAddress + " = ");
                try {
                    writer.write(String.format("0x%08x\n", currentProgram.getMemory().getInt(literalAddress)));
                } catch (Exception ex) {
                    writer.write("<unreadable: " + ex.getMessage() + ">\n");
                }
            }

            DecompInterface decompiler = new DecompInterface();
            decompiler.openProgram(currentProgram);
            for (long address : Arrays.asList(0x0800f6a8L, 0x080187b8L, 0x08018568L,
                0x08019a48L, 0x08019cc8L, 0x0800d18cL, 0x0800240eL, 0x080033bcL, 0x0800342cL,
                0x08018e70L, 0x080b8cfcL, 0x08004b02L, 0x08018c38L, 0x0800af40L,
                0x080048d0L, 0x080048eaL, 0x08004458L, 0x08004908L, 0x08019248L, 0x0800b074L,
                0x08018590L, 0x0800ad10L, 0x0800ad6cL, 0x0800d0ccL, 0x080033a4L,
                0x08019910L, 0x0801a1b8L, 0x080b8482L, 0x080b860eL,
                0x0800d000L, 0x0800d328L, 0x0800d3d0L, 0x0800d468L,
                0x0800d546L, 0x0800d57aL, 0x08005e30L, 0x08013974L,
                0x0800279cL, 0x080139fcL, 0x08019f74L, 0x0801a380L,
                0x0801aa90L, 0x0801b3fcL, 0x0800f7a0L, 0x08010070L,
                0x0800eaa6L,0x0800eaecL,0x0800ec14L,0x0800ec38L,0x0800ed50L,0x0800ed5eL,
                0x0800ded8L,0x0800dc28L,0x0800d814L,0x0800e0e8L,0x0800e040L,0x0800e068L,
                0x0800e0acL)) {
                Address functionAddress = toAddr(address);
                Function function = currentProgram.getFunctionManager().getFunctionAt(functionAddress);
                if (function == null) function = currentProgram.getFunctionManager().getFunctionContaining(functionAddress);
                writer.write("\n\n===== Function " + functionAddress + " =====\n");
                if (function == null) {
                    writer.write("No function at this address.\n");
                    continue;
                }
                writer.write(function.getName(true) + " [" + function.getEntryPoint() + ".." +
                    function.getBody().getMaxAddress() + "]\nCallers:\n");
                ReferenceIterator functionRefs = currentProgram.getReferenceManager().getReferencesTo(function.getEntryPoint());
                while (functionRefs.hasNext()) {
                    Reference ref = functionRefs.next();
                    Function caller = currentProgram.getFunctionManager().getFunctionContaining(ref.getFromAddress());
                    writer.write("  " + ref.getFromAddress() + " " + ref.getReferenceType() + " in " +
                        (caller == null ? "<no function>" : caller.getName(true)) + "\n");
                }
                DecompileResults result = decompiler.decompileFunction(function, 20, monitor);
                if (result.decompileCompleted() && result.getDecompiledFunction() != null) {
                    writer.write(result.getDecompiledFunction().getC());
                } else {
                    writer.write("Decompile failed: " + result.getErrorMessage());
                }
            }
            decompiler.dispose();
        }
        println("Wrote targeted camera/input decompile: " + report);
    }
}
