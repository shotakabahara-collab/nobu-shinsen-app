import {defineConfig,devices} from '@playwright/test';

const baseURL='http://127.0.0.1:4173/nobu-shinsen-app/';

export default defineConfig({
 testDir:'./e2e',
 workers:1,
 reporter:[['line'],['html',{open:'never'}]],
 webServer:{
  command:'npm run build && npm run preview -- --host 127.0.0.1',
  url:baseURL,
  reuseExistingServer:true,
  timeout:120_000,
 },
 use:{baseURL,trace:'retain-on-failure'},
 projects:[
  {
   name:'iPhone viewport / Chromium',
   testMatch:/app\.spec\.ts/,
   use:{...devices['iPhone 13'],browserName:'chromium'},
  },
  {
   name:'iPhone compatibility / WebKit',
   testMatch:/webkit\.spec\.ts/,
   use:{...devices['iPhone 13'],browserName:'webkit'},
  },
 ],
});
