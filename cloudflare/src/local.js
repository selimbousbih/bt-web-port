// Local multiplayer rooms with assets streamed from serve.mjs.
import worker from './worker.js';
export { Room } from './room.js';
export default { fetch(req, env) {
  const assets = {fetch(request) {
    const url = new URL(request.url);
    url.protocol = 'http:'; url.host = '127.0.0.1:4700';
    return fetch(new Request(url, request));
  }};
  return worker.fetch(req, {...env, ASSETS: assets});
}};
