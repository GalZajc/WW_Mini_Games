const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
 const dir = path.join(__dirname, 'artifacts');
 const items = JSON.parse(fs.readFileSync(path.join(dir,'artwork-html.json'),'utf8'));
 const win = new BrowserWindow({width:1200,height:900,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
 const base = pathToFileURL(path.resolve(__dirname,'../../..') + path.sep).href;
 for (let i=0;i<items.length;i+=20) {
  const html = `<base href="${base}"><style>body{margin:0;background:#202428;color:white;font:13px sans-serif}.sheet{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:10px}.item{height:205px;overflow:hidden}.art{height:175px;background:#12151b;overflow:hidden}.art img,.art svg{width:100%;height:100%;object-fit:contain}.label{padding:5px}</style><div class="sheet">${items.slice(i,i+20).map(e=>`<div class="item"><div class="art">${e.html}</div><div class="label">${e.label}</div></div>`).join('')}</div>`;
  const file = path.join(dir,'artwork-sheet.html'); fs.writeFileSync(file,html);
  await win.loadFile(file); await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
  await new Promise(resolve=>setTimeout(resolve,200));
  fs.writeFileSync(path.join(dir,`artwork-review-${i/20+1}.png`),(await win.webContents.capturePage()).toPNG());
 }
 win.destroy(); app.quit();
});
