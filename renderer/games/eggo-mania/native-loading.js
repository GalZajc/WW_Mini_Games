// GBA startup work, in CPU cycles. The ROM executes two 320-step warmups,
// aligning to VBlank between them. A constant number of blank frames loses
// this dependence on pickup trajectories and the initially filled board.
// Resource costs: pixel-preserving 18C38/18590 instrumentation; workload
// calibration: scripts/eggo-native-prefill-work-audit.mjs. These are cost
// estimates, not a cycle-accurate ARM/IRQ emulator. Keep them centralized.
export const NATIVE_LOADING=Object.freeze({
    frameCycles:280896,passes:2,fields:2,descriptorSlots:256,
    prefillBaseCycles:189526.17,pickupVisitCycles:646.42,specialDescriptorCycles:622.59,
    setupCycles:247500,initialPieceCycles:3000,initialCellCycles:350,
    firstPhaseCycles:17387,firstTailCycles:40000,
    secondPhaseCycles:745,secondTailCycles:100000,
    resources:Object.freeze({dragon:2111585,castle:2079468,pirate:2050517,space:2087300,
        jungle:2115177,park:2085250,beanstalk:2037449,factory:2062321}),
    sceneSetup:Object.freeze({dragon:51357,castle:47369,pirate:55283,space:50432,
        jungle:44522,park:53654,beanstalk:49338,factory:51822}),
});

export function createNativeLoadingWork(){
    return {activeVisits:0,renderAllocations:0,specialAllocations:0};
}

export function recordNativeLoadingPickup(work,motion,kind){
    work.activeVisits++;
    const x=Math.floor(motion.x),y=Math.floor(motion.y);
    // Loader cameras are zero. Both identical field streams update in
    // alternating order, sharing the 256-descriptor pool (ROM 09630/096E0).
    if(x< -15||x>111||y<= -16||y>=160)return;
    if(work.renderAllocations>=NATIVE_LOADING.descriptorSlots/NATIVE_LOADING.fields)return;
    work.renderAllocations++;
    if(kind>=8)work.specialAllocations++;
}

export function nativeRoundLoadingBudget(stage,fieldPasses,initialBoard){
    const p=NATIVE_LOADING;
    if(!Object.hasOwn(p.resources,stage)||fieldPasses?.length!==p.fields||
        fieldPasses.some(passes=>passes?.length!==p.passes))return null;
    const fixed=p.resources[stage]+p.setupCycles+p.sceneSetup[stage]+
        initialBoard.pieces*p.initialPieceCycles+initialBoard.cells*p.initialCellCycles;
    const warmups=Array.from({length:p.passes},(_,pass)=>{
        const visits=fieldPasses.reduce((n,field)=>n+field[pass].activeVisits,0);
        const special=fieldPasses.reduce((n,field)=>n+field[pass].specialAllocations,0);
        return p.prefillBaseCycles+visits*p.pickupVisitCycles+special*p.specialDescriptorCycles;
    });
    const cycles=[fixed+warmups[0]+p.firstPhaseCycles+p.firstTailCycles,
        fixed+warmups[1]+p.secondPhaseCycles+p.secondTailCycles];
    const frames=cycles.map(value=>Math.ceil(value/p.frameCycles));
    const soundTicks=frames[0]+Math.ceil((cycles[1]-p.secondTailCycles)/p.frameCycles);
    return {ticks:frames[0]+frames[1],soundTicks,frames,cycles,warmups,fixed};
}
