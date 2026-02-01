// app.js (module)
import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk';

const root = document.getElementById('app');

// Do your own bootstrapping first
root.textContent = 'hello from mini app';

// IMPORTANT: call ready() once your UI is stable
try {
  await sdk.actions.ready(); // top-level await requires <script type="module">
  // optionally disable native gestures if your UI conflicts with the modal
  // await sdk.setOptions({ disableNativeGestures: true });
} catch (err) {
  console.error('ready() failed (likely not running in a Mini App host):', err);
}
