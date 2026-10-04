'use strict';
const API='https://zkmzyx-website-dev.zkmzyx.workers.dev';
const PREFIX='/__chips_probe/';
const el=id=>document.getElementById(id);
let popup=null;
const show=result=>{el('result').textContent=JSON.stringify(result,null,2);};
async function call(action){
 if(location.origin!=='https://zkmzyx.github.io'||window.top!==window)throw Error('Exact top-level test origin required');
 const response=await fetch(API+PREFIX+action,{method:'POST',credentials:'include',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json','X-Chips-Operator':el('capability').value,'X-Chips-Request':'1'},body:JSON.stringify({challenge:el('challenge').value})});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'Diagnostic unavailable');
 if(action==='start'&&typeof result.challenge==='string')el('challenge').value=result.challenge;
 // Never display a capability, challenge or cookie value.
 show({action,ok:result.ok===true,cookiePresent:result.cookiePresent??null,ordinaryControlPresent:result.ordinaryControlPresent??null,expiresInSeconds:result.expiresInSeconds??null});
}
for(const action of ['start','set','check','clear'])el(action).addEventListener('click',()=>{void call(action).catch(error=>show({error:error.message}));});
el('top').addEventListener('click',()=>{
 // This ticket is purpose-bound, short-lived and non-authentication. The
 // operator secret never enters a URL. It can authorize only probe observation.
 const challenge=el('challenge').value;
 if(!challenge){show({error:'Start the diagnostic first'});return;}
 popup=window.open(API+PREFIX+'top?challenge='+encodeURIComponent(challenge),'chips-partition-observation');
 if(!popup)show({error:'Observation window unavailable; no downgrade'});
});
window.addEventListener('message',event=>{
 if(event.origin!==API||event.source!==popup||!event.data||event.data.kind!=='chips-top-observation')return;
 show({action:'top',cookiePresent:event.data.cookiePresent===true,ordinaryControlPresent:event.data.ordinaryControlPresent===true});
});
