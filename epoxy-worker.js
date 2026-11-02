// epoxy-worker.js
// Runs Epoxy inside a module Web Worker.

import init, {
  EpoxyClient,
  EpoxyClientOptions,
} from 'https://esm.sh/@mercuryworkshop/epoxy-tls@2.1.19-1/epoxy-bundled';

let client = null;

self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'init') {
    try {
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

  if (msg.type === 'fetch') {
    const { id, url, method, headers, body, bodyIsText } = msg;
    try {
      if (!client) throw new Error('Epoxy client not initialized');

      const init = { method: method || 'GET' };

      if (headers && headers.length) {
        init.headers = new Headers(headers);
      }

      if (body != null) {
        // KEY FIX: if the caller marked this as text, pass a string so
        // Epoxy forwards the Content-Type header instead of overwriting
        // it with application/octet-stream for binary bodies.
        if (bodyIsText) {
          init.body = new TextDecoder().decode(body);
        } else {
          init.body = body;
        }
      }

      // Belt-and-suspenders: if a Content-Type was provided but Epoxy
      // still drops it for some reason, force it back on the request.
      // (This is the header that was arriving as `undefined` in httpbin.)
      const ct = init.headers ? init.headers.get('content-type') : null;
      if (ct && bodyIsText) {
        // Redundant with the string body, but harmless.
        init.headers.set('content-type', ct);
      }

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
