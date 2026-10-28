// Isolated hidden browser with normal website autoplay rules (Electron's
// default is no-user-gesture-required and would conceal website-only bugs).
const {app,BrowserWindow}=require('electron');
let win;
app.whenReady().then(()=>{
 win=new BrowserWindow({show:false,webPreferences:{autoplayPolicy:'document-user-activation-required',backgroundThrottling:false}});
 win.loadURL('about:blank');
});
app.on('window-all-closed',()=>app.quit());
