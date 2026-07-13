export type AppleInstallState='unsupported'|'browser'|'standalone';

export function getAppleInstallState(userAgent:string,maxTouchPoints:number,mediaStandalone:boolean,navigatorStandalone:boolean):AppleInstallState{
 const appleMobile=/iPhone|iPad|iPod/.test(userAgent)||(/Macintosh/.test(userAgent)&&maxTouchPoints>1);
 if(!appleMobile)return 'unsupported';
 return mediaStandalone||navigatorStandalone?'standalone':'browser';
}

export function readAppleInstallState():AppleInstallState{
 const legacyNavigator=navigator as Navigator&{standalone?:boolean};
 return getAppleInstallState(navigator.userAgent,navigator.maxTouchPoints,window.matchMedia('(display-mode: standalone)').matches,legacyNavigator.standalone===true);
}
