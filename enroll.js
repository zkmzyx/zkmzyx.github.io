// Auth-only candidate. Exact-origin synthetic proof; publication requires separate approval.
export const frontendOrigin = 'https://zkmzyx.github.io';
export const apiOrigin = 'https://zkmzyx-website-dev.zkmzyx.workers.dev';
export const rpId = 'zkmzyx.github.io';
export function decode64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 32768) throw new Error('Invalid binary value');
  const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;
}
export function encode64(value) {
  const bytes=ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function createOptions(json) {
  if (json.rp?.id !== rpId || json.authenticatorSelection?.userVerification !== 'required' || json.authenticatorSelection?.residentKey !== 'required' || json.attestation !== 'none' || json.pubKeyCredParams?.length !== 1 || json.pubKeyCredParams[0].alg !== -7) throw new Error('Unexpected registration policy');
  return {...json,challenge:decode64(json.challenge),user:{...json.user,id:decode64(json.user.id)},excludeCredentials:(json.excludeCredentials||[]).map(c=>({...c,id:decode64(c.id)}))};
}
export function getOptions(json) {
  if (json.rpId !== rpId || json.userVerification !== 'required') throw new Error('Unexpected login policy');
  return {...json,challenge:decode64(json.challenge),allowCredentials:(json.allowCredentials||[]).map(c=>({...c,id:decode64(c.id)}))};
}
export function responseJSON(c) {
  const r=c.response,result={id:c.id,rawId:encode64(c.rawId),type:c.type,response:{clientDataJSON:encode64(r.clientDataJSON)}};
  if (r.attestationObject) {result.response.attestationObject=encode64(r.attestationObject);result.response.transports=r.getTransports?.()||[];}
  else {result.response.authenticatorData=encode64(r.authenticatorData);result.response.signature=encode64(r.signature);result.response.userHandle=r.userHandle?encode64(r.userHandle):null;}
  // No extension input is requested by the proposed controller.
  result.clientExtensionResults=c.getClientExtensionResults?.()||{};return result;
}

const allowed=new Set(['transport/start','transport/confirm','registration/options','registration/status','registration/verify','me','login/options','login/verify','credentials','credential/rename','credential/revoke','rotate','logout']);
export async function initOwnerSetup(doc=document,win=window) {
  const status=doc.querySelector('#status'),buttons=[...doc.querySelectorAll('button')];
  const say=text=>{status.textContent=text;};
  if(win.location.origin!==frontendOrigin || win.top!==win.self || !win.isSecureContext){say('This setup requires the exact HTTPS site in a top-level tab.');return;}
  let csrf=null,proof=null,pending=null,released=false,busy=false,nativeController=null,credentialRows=[];
  const $=id=>doc.querySelector('#'+id);
  function render(){
    for(const b of buttons)b.disabled=busy;
    $('confirm-transport').disabled=busy||!proof;
    $('prepare-owner').disabled=busy||!proof;
    $('prepare-login').disabled=busy||!proof;
    $('prepare-add').disabled=busy||!proof||!csrf;
    $('check-release').disabled=busy||pending?.purpose!=='bootstrap';
    $('complete').disabled=busy||!pending||(pending.purpose==='bootstrap'&&!released);
    for(const id of ['list','rename','revoke','rotate','logout'])$(id).disabled=busy||!csrf;
    $('top-check').hidden=!proof; $('receipt').textContent=pending?.handoffCode||'';
  }
  async function api(action,body,method='POST'){
    if(!allowed.has(action))throw Error('denied');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const response=await win.fetch(apiOrigin+'/api/auth/'+action,{method,credentials:'include',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,headers:{...(method==='POST'?{'Content-Type':'application/json','X-Zkmzyx-Request':'1'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(method==='POST'?{body:JSON.stringify(body||{})}:{})});
      const value=await response.json();if(!response.ok){if(response.status===401)csrf=null;throw Error(response.status===429?'limited':'denied');}return value;
    }finally{clearTimeout(timer);}
  }
  async function me(){const v=await api('me',null,'GET');if(typeof v.csrf!=='string')throw Error('denied');csrf=v.csrf; say(v.role==='owner'?'Signed in as Owner. Confirm the expected account privately.':'Signed in. This page is for Owner setup.');return v;}
  function resetCeremony(){pending=null;released=false;proof=null;$('admission').value='';$('top-check').removeAttribute('href');}
  async function run(action){if(busy)return;busy=true;render();try{await action();}catch(e){say(e?.name==='NotAllowedError'||e?.name==='AbortError'?'Cancelled or interrupted. If completion may have committed, sign in; do not repeat Owner bootstrap.':e?.message==='limited'?'Please wait for the normal rate-limit window.':'Unable to complete. Check expiry, operator release and browser support. For uncertain completion, sign in or contact the operator.');}finally{busy=false;render();}}
  $('start-transport').addEventListener('click',()=>run(async()=>{resetCeremony();const t=await api('transport/start');proof=t.id;$('top-check').href=apiOrigin+'/api/auth/transport/top?id='+encodeURIComponent(proof);say('Open the backend check in a new tab, then return here and confirm.');}));
  $('confirm-transport').addEventListener('click',()=>run(async()=>{await api('transport/confirm',{id:proof});say('Private session partition confirmed. Prepare the chosen ceremony.');}));
  async function prepare(purpose){
    let token; if(purpose==='bootstrap'){token=$('admission').value;$('admission').value='';if(!/^[a-f0-9]{64}$/.test(token))throw Error('denied');}
    try{const v=await api('registration/options',{purpose,...(token?{token}:{}),transportId:proof});pending={...v,purpose};released=purpose!=='bootstrap';say(purpose==='bootstrap'?'Pending ceremony. Privately confirm the receipt with the operator, then check release.':'Additional credential ready. Press Complete to verify on your device.');}finally{token=null;}
  }
  $('prepare-owner').addEventListener('click',()=>run(()=>prepare('bootstrap')));
  $('prepare-add').addEventListener('click',()=>run(()=>prepare('add')));
  $('check-release').addEventListener('click',()=>run(async()=>{const v=await api('registration/status',{id:pending.id});released=v.released===true;say(released?'Operator released this ceremony. Press Complete before expiry.':'Waiting for operator release. No account has been created.');}));
  $('prepare-login').addEventListener('click',()=>run(async()=>{const v=await api('login/options',{transportId:proof});pending={...v,purpose:'login'};released=true;say('Sign-in ready. Press Complete to verify on your device.');}));
  $('complete').addEventListener('click',()=>run(async()=>{
    const p=pending;if(!p||(p.purpose==='bootstrap'&&!released))throw Error('denied');nativeController=new AbortController();$('cancel').disabled=false;
    // Native call starts directly from this explicit click; no background/conditional ceremony.
    const credential=await win.navigator.credentials[p.purpose==='login'?'get':'create']({publicKey:p.purpose==='login'?getOptions(p.options):createOptions(p.options),signal:nativeController.signal});
    const response=responseJSON(credential);
    await api(p.purpose==='login'?'login/verify':'registration/verify',p.purpose==='login'?{id:p.id,response}:{id:p.id,purpose:p.purpose,response,label:$('label').value});
    resetCeremony();nativeController=null;await me();
  }));
  $('cancel').addEventListener('click',()=>{nativeController?.abort();resetCeremony();say('Local ceremony cleared. Ask the operator to abort an unused Owner admission. A committed credential must be reconciled through sign-in.');render();});
  $('me').addEventListener('click',()=>run(me));
  $('list').addEventListener('click',()=>run(async()=>{credentialRows=await api('credentials',null,'GET');const select=$('credential');select.replaceChildren();for(const r of credentialRows.filter(r=>r.revoked_at===null)){const option=doc.createElement('option');option.value=r.id;option.textContent=r.label;select.append(option);}say('Usable credential list updated. Synced copies do not prove independent recovery.');}));
  $('rename').addEventListener('click',()=>run(async()=>{await api('credential/rename',{id:$('credential').value,label:$('label').value});say('Credential renamed. Refresh the list.');}));
  $('revoke').addEventListener('click',()=>run(async()=>{if(!win.confirm('Revoke the selected credential? You must have another usable credential. This logs out sessions.'))return;await api('credential/revoke',{id:$('credential').value});csrf=null;credentialRows=[];$('credential').replaceChildren();resetCeremony();say('Credential revoked. Sign in with a remaining credential.');}));
  $('rotate').addEventListener('click',()=>run(async()=>{await api('rotate');await me();}));
  $('logout').addEventListener('click',()=>run(async()=>{await api('logout');csrf=null;credentialRows=[];$('credential').replaceChildren();resetCeremony();say('Signed out.');}));
  win.addEventListener('pagehide',()=>{nativeController?.abort();csrf=null;resetCeremony();});
  render();say('No ceremony starts automatically. Begin with the private session check.');
}
if(typeof document!=='undefined')initOwnerSetup();
