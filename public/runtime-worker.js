let pyodide=null,ready=false;
const PYODIDE_BASE=new URL('pyodide/',self.location.href).href;
async function init(bundleUrl){if(ready)return;importScripts(PYODIDE_BASE+'pyodide.js');pyodide=await loadPyodide({indexURL:PYODIDE_BASE});const response=await fetch(bundleUrl);if(!response.ok)throw new Error(`runtime bundle HTTP ${response.status}`);pyodide.FS.writeFile('/runtime.tgz',new Uint8Array(await response.arrayBuffer()));await pyodide.runPythonAsync(`
import os,sys,tarfile
os.makedirs('/nobu',exist_ok=True)
with tarfile.open('/runtime.tgz','r:gz') as tf: tf.extractall('/nobu')
os.chdir('/nobu/02_ENGINE');sys.path.insert(0,'/nobu/02_ENGINE')
from browser_runtime_api import calculate,search,formal
`);ready=true;self.postMessage({type:'ready'});}
self.onmessage=async(event)=>{const msg=event.data||{};try{await init(msg.bundleUrl);pyodide.globals.set('request_json_js',JSON.stringify(msg.request));const fn={calculate:'calculate',search:'search',formal:'formal'}[msg.type];if(!fn)throw new Error(`unknown operation: ${msg.type}`);const raw=await pyodide.runPythonAsync(`${fn}(request_json_js)`);self.postMessage({type:'result',requestId:msg.requestId,result:JSON.parse(raw)});}catch(error){self.postMessage({type:'error',requestId:msg.requestId,message:error?.stack||String(error)});}};
