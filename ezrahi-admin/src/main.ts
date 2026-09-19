import { bootstrapApplication } from '@angular/platform-browser';
import { setWorkerUrl } from 'maplibre-gl';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// MapLibre renders tiles in a Web Worker. Angular's builder does not emit
// the worker chunk, so serve the package worker files as static assets
// (angular.json) and point MapLibre at them. Without this the worker URL
// falls through to the hosting SPA rewrite (index.html), the worker fails
// silently, and maps render white with zero tile requests.
setWorkerUrl('/maplibre-gl-worker.mjs');

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
