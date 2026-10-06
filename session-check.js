'use strict';
import {memberText} from './member-copy.js';
const params=new URLSearchParams(location.search),language=params.get('lang')==='zh'?'zh':'en',ok=params.get('check')==='ok';
document.documentElement.lang=language==='zh'?'zh-CN':'en';
document.getElementById('check-title').textContent=memberText(language,ok?'browserCheckComplete':'signInUnavailable');
document.getElementById('check-message').textContent=memberText(language,ok?'returnToSite':'partitionRequired');
document.getElementById('return-site').textContent=memberText(language,'returnToSite');
document.getElementById('return-site').href='/?lang='+language;
if(location.origin==='https://zkmzyx.github.io'&&window.top===window.self&&window.isSecureContext&&window.opener){
 window.opener.postMessage({type:'zkmzyx-browser-check',ok},'https://zkmzyx.github.io');window.close();
}
