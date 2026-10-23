/* Offline-friendly static asset cache for emoji.an4ous.
   Rendered native emoji atlases live in a separate CacheStorage bucket. */
const VERSION='emoji-site-v3';
const STATIC_CACHE=VERSION+'-assets';
const allowed=new Set(['','index.html','emoji-data.json','flag-atlas.png','favicon.svg']);
const base=new URL('./',self.location.href).pathname;
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    // First visit may load before this worker controls the page. Populate the
    // cache during install so the very next refresh can work from local bytes.
    const store=await caches.open(STATIC_CACHE);
    await Promise.allSettled(['index.html','emoji-data.json','flag-atlas.png','favicon.svg']
      .map(path=>store.add(new URL(path,self.registration.scope))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(name=>name.startsWith('emoji-site-')&&name!==STATIC_CACHE)
      .map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(base))return;
  const path=url.pathname.slice(base.length);
  if(!allowed.has(path))return;
  event.respondWith((async()=>{
    const store=await caches.open(STATIC_CACHE);
    const cached=await store.match(request,{ignoreSearch:true});
    // Serve immediately from persistent storage, verify a newer copy
    // in the background; never block the first display on the network.
    const network=fetch(request).then(response=>{
      if(response.ok&&response.type!=='opaque')
        event.waitUntil(store.put(request,response.clone()).catch(()=>{}));
      return response;
    });
    if(cached){
      event.waitUntil(network.catch(()=>{}));
      return cached;
    }
    try{return await network}
    catch(error){
      const fallback=path===''?await store.match(new URL('index.html',self.registration.scope)):null;
      if(fallback)return fallback;
      throw error;
    }
  })());
});
