let pyodide=null,ready=false;
const PYODIDE_BASE=new URL('pyodide/',self.location.href).href;
const EXAMPLE_API_URL=new URL('battle-example-api.py',self.location.href).href;
async function init(bundleUrl){
 if(ready)return;
 importScripts(PYODIDE_BASE+'pyodide.js');
 pyodide=await loadPyodide({indexURL:PYODIDE_BASE});
 const [bundleResponse,exampleResponse]=await Promise.all([fetch(bundleUrl),fetch(EXAMPLE_API_URL)]);
 if(!bundleResponse.ok)throw new Error(`runtime bundle HTTP ${bundleResponse.status}`);
 if(!exampleResponse.ok)throw new Error(`battle example API HTTP ${exampleResponse.status}`);
 pyodide.FS.writeFile('/runtime.tgz',new Uint8Array(await bundleResponse.arrayBuffer()));
 pyodide.FS.writeFile('/battle-example-api.py',await exampleResponse.text(),{encoding:'utf8'});
 await pyodide.runPythonAsync(`
import os,sys,tarfile,shutil
os.makedirs('/nobu',exist_ok=True)
with tarfile.open('/runtime.tgz','r:gz') as tf: tf.extractall('/nobu')
shutil.copy2('/battle-example-api.py','/nobu/02_ENGINE/battle_example_api.py')
os.chdir('/nobu/02_ENGINE');sys.path.insert(0,'/nobu/02_ENGINE')
from browser_runtime_api import calculate,search,formal
from battle_example_api import build_battle_examples
`);
 ready=true;self.postMessage({type:'ready'});
}
self.onmessage=async(event)=>{
 const msg=event.data||{};
 try{
  await init(msg.bundleUrl);
  pyodide.globals.set('request_json_js',JSON.stringify(msg.request));
  const fn={calculate:'calculate',search:'search',formal:'formal'}[msg.type];
  if(!fn)throw new Error(`unknown operation: ${msg.type}`);
  const raw=await pyodide.runPythonAsync(`${fn}(request_json_js)`);
  const result=JSON.parse(raw);
  if(msg.type==='calculate'&&msg.request?.include_examples){
   pyodide.globals.set('summary_json_js',raw);
   const examplesRaw=await pyodide.runPythonAsync('build_battle_examples(request_json_js, summary_json_js)');
   result.battle_examples=JSON.parse(examplesRaw);
  }
  self.postMessage({type:'result',requestId:msg.requestId,result});
 }catch(error){self.postMessage({type:'error',requestId:msg.requestId,message:error?.stack||String(error)});}
};
