// Observe the real offscreen compositor without creating a visible window.
const {app}=require('electron');
app.setAppPath(require('node:path').resolve(__dirname,'..'));
app.on('browser-window-created',(_event,window)=>{
    window.webContents.on('paint',()=>process.stdout.write(`EGGO_PAINT ${Date.now()}\n`));
});
require('../main.js');
