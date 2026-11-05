export const THEME_KEY = 'zoro-theme';

/**
 * Runs in <head> before the first paint, so a saved light theme never flashes dark. Dark is the default; a choice
 * made with the theme switch is remembered on this device. Kept outside the client component so the server layout
 * receives the string itself.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark')t='dark';var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme='dark'}`;
