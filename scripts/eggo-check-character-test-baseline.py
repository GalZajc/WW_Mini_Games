"""Check whether legacy character assertions already failed in the saved baseline."""
from pathlib import Path
from datetime import datetime
import zipfile,json,hashlib,subprocess
ROOT=Path(__file__).resolve().parents[1]
ARCHIVE=Path.home()/'Downloads/Eggo Mania verified source backup 2026-10-18_04-35-46.zip'
out=ROOT/'scripts/OUTPUT'/('eggo-baseline-character-tests_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
files=['renderer/games/eggo-mania/'+name for name in
 ['model.js','view.js','pixel-renderer.js','native-water.js','assets/characters.js']]
with zipfile.ZipFile(ARCHIVE)as archive:
 sources={str(ROOT/file).lower():archive.read(file).decode('utf-8')for file in files}
(out/'sources.json').write_text(json.dumps(sources),encoding='utf-8')
(out/'loader.mjs').write_text("""import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const sources=JSON.parse(readFileSync(new URL('./sources.json',import.meta.url),'utf8'));
export async function load(url,context,next){
 const path=url.startsWith('file:')?fileURLToPath(url).toLowerCase():'';
 return Object.hasOwn(sources,path)?{format:'module',source:sources[path],shortCircuit:true}:next(url,context);
}
""",encoding='utf-8')
parameters={'archive':str(ARCHIVE),'sha256':hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
 'source_overrides':files,'test':'tests/eggo-characters.test.mjs','random_seed':'Test fixtures'}
(out/'parameters.json').write_text(json.dumps(parameters,indent=2)+'\n',encoding='utf-8')
with(out/'baseline.log').open('w',encoding='utf-8')as log:
 result=subprocess.run(['node','--experimental-loader',(out/'loader.mjs').as_uri(),'--test',parameters['test']],
  cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
print('Exit:',result.returncode)
print(out)
