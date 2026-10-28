import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'tests','OUTPUT','eggo-factory-waterline-bg3_'+
    new Date().toISOString().replace(/[:.]/g,'-'));
const electron=path.join(root,'node_modules','electron','dist','electron.exe');
const port=9398;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class Client{
    constructor(url){this.socket=new WebSocket(url);this.nextId=1;this.pending=new Map();}
    async connect(){await new Promise((resolve,reject)=>{
        this.socket.once('open',resolve);this.socket.once('error',reject);
    });this.socket.on('message',raw=>{
        const message=JSON.parse(raw.toString());if(!message.id)return;
        const pending=this.pending.get(message.id);if(!pending)return;
        this.pending.delete(message.id);
        if(message.error)pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
    });}
    call(method,params={}){
        const id=this.nextId++;
        return new Promise((resolve,reject)=>{
            this.pending.set(id,{resolve,reject});
            this.socket.send(JSON.stringify({id,method,params}));
        });
    }
    async evaluate(expression){
        const result=await this.call('Runtime.evaluate',{
            expression,awaitPromise:true,returnByValue:true,userGesture:true,
        });
        if(result.exceptionDetails)throw new Error(
            result.exceptionDetails.exception?.description||result.exceptionDetails.text);
        return result.result.value;
    }
    close(){this.socket.close();}
}

let client;
const child=spawn(electron,['--mute-audio',`--remote-debugging-port=${port}`,'.'],{
    cwd:root,windowsHide:true,
    env:{...process.env,WW_MINI_GAMES_HEADLESS_TEST:'1'},
    stdio:['ignore','pipe','pipe'],
});
let stdout='',stderr='';
child.stdout.on('data',chunk=>stdout+=chunk.toString());
child.stderr.on('data',chunk=>stderr+=chunk.toString());

async function findPage(){
    const response=await fetch(`http://127.0.0.1:${port}/json`);
    if(!response.ok)return null;
    return (await response.json()).find(entry=>entry.type==='page'&&entry.webSocketDebuggerUrl)||null;
}
async function reconnect(){
    client?.close();client=null;
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
        try{
            const page=await findPage();
            if(page){client=new Client(page.webSocketDebuggerUrl);await client.connect();return;}
        }catch{}
        await pause(100);
    }
    throw new Error(`Timed out reconnecting to muted Electron. stderr=${stderr.slice(-2000)}`);
}
async function evaluateWithRecovery(expression){
    for(let attempt=0;attempt<3;attempt++){
        try{return await client.evaluate(expression);}
        catch(error){
            if(!String(error?.message||error).includes('Execution context was destroyed')||attempt===2)throw error;
            await reconnect();
        }
    }
}

try{
    await mkdir(output,{recursive:true});
    const deadline=Date.now()+20000;
    let page;
    while(Date.now()<deadline){
        try{
            page=await findPage();if(page)break;
        }catch{}
        await pause(100);
    }
    if(!page)throw new Error(`Timed out waiting for muted Electron. stderr=${stderr.slice(-2000)}`);
    console.log('renderer-ready');
    client=new Client(page.webSocketDebuggerUrl);await client.connect();
    await evaluateWithRecovery("new Promise(resolve=>{const wait=()=>window.app?.gameLoader?.games?.length?resolve(true):setTimeout(wait,50);wait();})");
    console.log('game-loader-ready');
    const result=await evaluateWithRecovery(`(async()=>{
        window.app.settingsManager.save=async()=>{};
        let g=window.app.currentGame;
        if(!g){
            const config=window.app.gameLoader.games.find(game=>game._id==='eggo-mania');
            if(!config)throw Error('Eggo Mania card not found');
            await window.app.launchGame(config);g=window.app.currentGame;
        }
        window.app._isPaused=true;
        g.p={...g.p,mode:'survival',difficulty:'hard',columns:7,hazards:false,seed:42};
        g.seed=42;g.round=1;g.startingStage=0;g.startRound({intro:false});
        await import('./games/eggo-mania/pixel-renderer.js').then(module=>module.waitForPixelAssets());
        const t=g.cpu;if(!t)throw Error('CPU field not available');
        for(const tower of [g.player,g.cpu]){
            tower.rows=[];tower.crates=[];tower.bombs=[];tower.hammers=[];tower.clouds=[];
            tower.held=null;tower.placing=null;tower.previousWater=-3.5;tower.water=-3.5;
            tower.egg.x=3.5;tower.egg.y=20;tower.egg.ground=false;tower.egg.offTower=true;
            tower.bird=null;tower.explosions=[];
        }
        g.views[1].camera=0;g.views[1].boardCamera=0;g.views[1].backgroundCamera=0;g.camera[1]=0;
        const image=new Image();
        image.src=new URL('./games/eggo-mania/assets/factory-waterline-bg3.png',location.href).href;
        await image.decode();
        const atlasCanvas=document.createElement('canvas');atlasCanvas.width=112;atlasCanvas.height=60*18;
        const atlasContext=atlasCanvas.getContext('2d',{willReadFrequently:true});
        atlasContext.drawImage(image,0,0);
        const atlas=atlasContext.getImageData(0,0,112,60*18).data;
        g.render();
        const context=g.pixelCanvas.getContext('2d',{willReadFrequently:true});
        const results=[];let baselineData=null,actualData=null,expectedData=null;
        for(let phase=0;phase<60;phase++){
            t.nativeFrame=phase;t.previousWater=-3.5;g.render();
            const baseline=context.getImageData(128,142,112,6);
            t.previousWater=-2.375;g.render();
            const actual=context.getImageData(128,142,112,6),expected=context.createImageData(112,6);
            let differentPixels=0;
            for(let y=0;y<6;y++)for(let x=0;x<112;x++){
                const i=(y*112+x)*4,si=((phase*18+y)*112+x)*4;
                if(atlas[si+3]===0){
                    expected.data.set(baseline.data.subarray(i,i+4),i);
                }else{
                    const sr=Math.round(atlas[si]*31/255),sg=Math.round(atlas[si+1]*63/255)>>1,sb=Math.round(atlas[si+2]*31/255),
                        dr=Math.round(baseline.data[i]*31/255),dg=Math.round(baseline.data[i+1]*63/255)>>1,db=Math.round(baseline.data[i+2]*31/255),
                        r=Math.min(31,(12*sr+4*dr)>>4),green=Math.min(31,(12*sg+4*dg)>>4),b=Math.min(31,(12*sb+4*db)>>4);
                    expected.data[i]=Math.floor(r*255/31);
                    expected.data[i+1]=Math.floor((green*2)*255/63);
                    expected.data[i+2]=Math.floor(b*255/31);expected.data[i+3]=255;
                }
                if(actual.data[i]!==expected.data[i]||actual.data[i+1]!==expected.data[i+1]||
                    actual.data[i+2]!==expected.data[i+2])differentPixels++;
            }
            results.push({phase,differentPixels});
            if(phase===37){baselineData=baseline;actualData=actual;expectedData=expected;}
        }
        const cropUrl=data=>{const canvas=document.createElement('canvas');canvas.width=112;canvas.height=6;
            canvas.getContext('2d').putImageData(data,0,0);return canvas.toDataURL('image/png');};
        return {results,splitY:Math.max(0,Math.min(160,Math.floor(112-(-2.375)*16-8))),
            baselinePng:cropUrl(baselineData),actualPng:cropUrl(actualData),expectedPng:cropUrl(expectedData)};
    })()`);
    console.log('pixel-check-complete');

    const decode=data=>Buffer.from(data.slice(data.indexOf(',')+1),'base64');
    await Promise.all([
        writeFile(path.join(output,'baseline-phase-37.png'),decode(result.baselinePng)),
        writeFile(path.join(output,'actual-phase-37.png'),decode(result.actualPng)),
        writeFile(path.join(output,'expected-phase-37.png'),decode(result.expectedPng)),
    ]);
    const failures=result.results.filter(row=>row.differentPixels);
    const report={
        experiment:'Eggo Mania factory CPU-field alternate BG3 renderer pixel check',
        audioOutputMuted:true,
        electronArguments:['--mute-audio'],
        phaseFormula:'t.nativeFrame % 60',
        splitY:result.splitY,
        comparedPhases:result.results.length,
        comparedPixelsPerPhase:112*6,
        differingPixels:result.results.reduce((sum,row)=>sum+row.differentPixels,0),
        failedPhases:failures,
        screenshots:{baseline:'baseline-phase-37.png',actual:'actual-phase-37.png',expected:'expected-phase-37.png'},
    };
    await writeFile(path.join(output,'parameters.json'),JSON.stringify({
        experiment:report.experiment,audioOutputMuted:true,seed:42,phases:[0,59],
        splitY:142,clip:{x:128,y:142,width:112,height:6},blend:{eva:12,evb:4},
    },null,2));
    await writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({output,report},null,2));
    if(failures.length)throw new Error(`Factory BG3 render differs in ${failures.length}/60 phases`);
}catch(error){
    console.error(error.stack||error);
    console.error(stdout.slice(-4000));
    console.error(stderr.slice(-4000));
    process.exitCode=1;
}finally{
    client?.close();child.kill();
}
