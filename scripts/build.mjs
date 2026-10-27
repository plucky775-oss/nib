import {APP_VERSION} from '../src/app-update.js';
import {cp,mkdir,rm,writeFile} from 'node:fs/promises';await rm('dist',{recursive:true,force:true});await mkdir('dist');await cp('index.html','dist/index.html');await cp('src','dist/src',{recursive:true});await cp('public','dist',{recursive:true});console.log('Built dist (static frontend); api/ stays server-only.');

await writeFile('dist/version.json',JSON.stringify({version:APP_VERSION}));
