// Keep a small independent native golden prefix; no recorded audio is shipped.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const P={commands:'scripts/OUTPUT/eggo-live-audio-commands_2026-10-26T21-06-30-342Z',
 oracle:'scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z',initialFrame:400,end:520,pcmSampleFrames:65536};
const hash=x=>createHash('sha256').update(x).digest('hex');
const commands=(await readFile(P.commands+'/commands.jsonl','utf8')).trim().split('\n').map(JSON.parse).filter(x=>x.frame>P.initialFrame&&x.frame<=P.end);
const ram=await readFile(P.oracle+'/sound-ram.bin'),pcm=await readFile(P.oracle+'/reference.wav');
const stride=0x3089-0x2470;
const fixture={parameters:P,provenance:JSON.parse(await readFile(P.oracle+'/parameters.json','utf8')),
 commands,finalSoundRamSha256:hash(ram.subarray((P.end-P.initialFrame-1)*stride,(P.end-P.initialFrame)*stride)),
 pcmSha256:hash(pcm.subarray(44,44+P.pcmSampleFrames*4))};
await mkdir('tests/fixtures',{recursive:true});await writeFile('tests/fixtures/eggo-audio-native-prefix.json',JSON.stringify(fixture,null,2));
console.log({frames:commands.length,pcmSha256:fixture.pcmSha256});
