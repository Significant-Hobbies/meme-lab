import {createApp} from '../server.mjs';
import {configFromEnv} from '../src/config.mjs';

// Owner review needs no model, credentials or environment-file loading.
const app=createApp(configFromEnv({}));
app.listen(0,'127.0.0.1',()=>{
  console.log(`Review: http://127.0.0.1:${app.address().port}/review?dataset=dialogue`);
  console.log('Owner labels persist in runs/; use Export for a partial or complete JSONL snapshot.');
});
