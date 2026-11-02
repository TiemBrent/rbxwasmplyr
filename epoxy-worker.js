// epoxy-worker.js
// Runs Epoxy inside a module Web Worker.
// Requires COOP/COEP isolation (coi-serviceworker.js) so SharedArrayBuffer is available.

import init, {
  EpoxyClient,
  EpoxyClientOptions,
} from 'https://esm.sh/@mercuryworkshop/epoxy-tls@2.1.19-1/epoxy-bundled';

let client = null;

self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  // ---- init ----
  if (msg.type === 'init') {
    try {
      // For the bundled version, init() takes no arguments.
      await init();

      const options = new EpoxyClientOptions();
      options.user_agent =
        (self.navigator && self.navigator.userAgent) ||
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
      options.wisp_v2 = true;
      options.udp_extension_required = true;

      client = new EpoxyClient(msg.wispUrl, options);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({
        type: 'error',
        error: 'init failed: ' + ((err && err.message) || err),
      });
    }
    return;
  }

  // ---- fetch ----
  if (msg.type === 'fetch') {
    const { id, url, method, headers, body } = msg;
    try {
      if (!client) throw new Error('Epoxy client not initialized');

      const init = { method: method || 'GET' };
      if (headers && headers.length) init.headers = new Headers(headers);
      if (body) init.body = body;

      const res = await client.fetch(url, init);
      const buf = await res.arrayBuffer();

      const resHeaders = [];
      res.headers.forEach((v, k) => resHeaders.push([k, v]));

      self.postMessage(
        {
          type: 'fetch-response',
          id,
          status: res.status,
          statusText: res.statusText,
          headers: resHeaders,
          body: buf,
        },
        [buf]
      );
    } catch (err) {
      self.postMessage({
        type: 'fetch-response',
        id,
        error: String((err && err.message) || err),
      });
    }
    return;
  }
};
