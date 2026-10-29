"use client";

/**
 * The hall's HDR, decoded off the main thread (perf v21.4, fix:1: T1, T3). three's HDRLoader parsed it inside the
 * download's task, on the critical path to the environment and so to the warm gate: 60 to 74 ms in development at 1x
 * (RGBEByteToRGBHalf 29 to 40, the RLE decode 12, toHalfFloat 11), 324 ms at 4x CPU.
 *
 * Here the bytes are fetched on the main thread (the very request the (hall) layout preloads: a worker's own fetch
 * would not find it) and decoded in a throwaway worker into the same half-float RGBA texels, bit for bit: the worker's
 * source below is HDRLoader.parse (three 0.186.1, examples/jsm/loaders/HDRLoader.js) and DataUtils.toHalfFloat's tables,
 * the conversion looked up per exponent byte instead of worked out per texel (the same arithmetic, once per value).
 * The texture is the one HDRLoader's load() makes (DataTextureLoader._applyTexData). Where the worker cannot run, fails
 * or takes too long, HDRLoader itself parses on the main thread, as before.
 */
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

/** past this the worker is taken as unable to answer (blocked, crashed): the main thread parses */
const WORKER_MS = 4000;

export interface HdrData { width: number; height: number; data: Uint16Array }

// the worker's whole source (String.raw: the regular expressions keep their backslashes). half(): toHalfFloat; header()
// and pixels(): RGBE_ReadHeader and RGBE_ReadPixels_RLE; decode(): parse() for HalfFloatType
const WORKER_SRC = String.raw`"use strict";
const base=new Uint32Array(512),shift=new Uint32Array(512);
for(let i=0;i<256;++i){const e=i-127;
if(e<-27){base[i]=0;base[i|256]=0x8000;shift[i]=24;shift[i|256]=24}
else if(e<-14){base[i]=0x400>>(-e-14);base[i|256]=(0x400>>(-e-14))|0x8000;shift[i]=-e-1;shift[i|256]=-e-1}
else if(e<=15){base[i]=(e+15)<<10;base[i|256]=((e+15)<<10)|0x8000;shift[i]=13;shift[i|256]=13}
else if(e<128){base[i]=0x7c00;base[i|256]=0xfc00;shift[i]=24;shift[i|256]=24}
else{base[i]=0x7c00;base[i|256]=0xfc00;shift[i]=13;shift[i|256]=13}}
const fv=new Float32Array(1),uv=new Uint32Array(fv.buffer);
const half=(v)=>{fv[0]=Math.max(-65504,Math.min(65504,v));const f=uv[0],e=(f>>23)&0x1ff;return base[e]+((f&0x7fffff)>>shift[e])};
const line=(b,p)=>{let e=p;while(e<b.length&&e-p<1024&&b[e]!==10)e++;if(e>=b.length||b[e]!==10)return null;let s="";for(let i=p;i<e;i++)s+=String.fromCharCode(b[i]);return [s,e+1]};
const header=(b)=>{let r=line(b,0),m;if(!r)throw new Error("no header found");if(!/^#\?(\S+)/.test(r[0]))throw new Error("bad initial token");
let p=r[1],fmt=false,dim=false,w=0,h=0;
for(;;){r=line(b,p);if(!r)break;p=r[1];const s=r[0];if(s.charAt(0)==="#")continue;
if(/^\s*FORMAT=(\S+)\s*$/.test(s))fmt=true;
if((m=/^\s*\-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/.exec(s))){dim=true;h=parseInt(m[1],10);w=parseInt(m[2],10)}
if(fmt&&dim)break}
if(!fmt)throw new Error("missing format specifier");if(!dim)throw new Error("missing image size specifier");return {w,h,p}};
const pixels=(b,w,h)=>{
if(w<8||w>0x7fff||b[0]!==2||b[1]!==2||(b[2]&0x80))return new Uint8Array(b);
if(w!==((b[2]<<8)|b[3]))throw new Error("wrong scanline width");
const out=new Uint8Array(4*w*h),end=4*w,sl=new Uint8Array(end);let off=0,pos=0,n=h;
while(n>0&&pos<b.byteLength){
if(pos+4>b.byteLength)throw new Error("read error");
const a0=b[pos++],a1=b[pos++],a2=b[pos++],a3=b[pos++];
if(a0!==2||a1!==2||((a2<<8)|a3)!==w)throw new Error("bad rgbe scanline format");
let ptr=0;
while(ptr<end&&pos<b.byteLength){let c=b[pos++];const run=c>128;if(run)c-=128;
if(c===0||ptr+c>end)throw new Error("bad scanline data");
if(run){const v=b[pos++];for(let i=0;i<c;i++)sl[ptr++]=v}else{sl.set(b.subarray(pos,pos+c),ptr);ptr+=c;pos+=c}}
for(let i=0;i<w;i++){out[off]=sl[i];out[off+1]=sl[i+w];out[off+2]=sl[i+2*w];out[off+3]=sl[i+3*w];off+=4}
n--}
return out};
const decode=(buf)=>{const b=new Uint8Array(buf),hd=header(b),px=pixels(b.subarray(hd.p),hd.w,hd.h),n=px.length/4,out=new Uint16Array(n*4),one=half(1),rows=[];
for(let j=0;j<n;j++){const k=j*4,e=px[k+3];let row=rows[e];
if(!row){row=rows[e]=new Uint16Array(256);const s=Math.pow(2,e-128)/255;for(let v=0;v<256;v++)row[v]=half(Math.min(v*s,65504))}
out[k]=row[px[k]];out[k+1]=row[px[k+1]];out[k+2]=row[px[k+2]];out[k+3]=one}
return {width:hd.w,height:hd.h,data:out}};
onmessage=(m)=>{try{const r=decode(m.data);postMessage(r,[r.data.buffer])}catch(e){postMessage({error:String((e&&e.message)||e)})}};`;

/** The texels decoded in a worker; null when no worker answered (none here, blocked, failed, too slow). */
function inWorker(buf: ArrayBuffer): Promise<HdrData | null> {
  return new Promise((resolve) => {
    let w: Worker | null = null, url = "", timer = 0;
    const done = (r: HdrData | null) => {
      clearTimeout(timer);
      try { w?.terminate(); } catch { /* gone */ }
      if (url) URL.revokeObjectURL(url);
      resolve(r);
    };
    try {
      if (typeof Worker === "undefined") { resolve(null); return; }
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      w = new Worker(url);
      w.onmessage = (e: MessageEvent<Partial<HdrData>>) => { const d = e.data; done(d && d.data instanceof Uint16Array && d.width && d.height ? (d as HdrData) : null); };
      w.onerror = () => done(null);
      timer = window.setTimeout(() => done(null), WORKER_MS);
      // (copied, not transferred: the main thread's fallback keeps the bytes)
      w.postMessage(buf);
    } catch { done(null); }
  });
}

/** How the last HDR was decoded, and how long its decode took from the bytes (development: env.ts's log). */
export const hdrStats = { how: "", ms: 0 };

async function decode(buf: ArrayBuffer): Promise<HdrData> {
  const t0 = performance.now();
  const d = await inWorker(buf);
  if (d) { hdrStats.how = "worker"; hdrStats.ms = Math.round(performance.now() - t0); return d; }
  const t1 = performance.now();
  const p = new HDRLoader().parse(buf) as { width: number; height: number; data: Uint16Array };
  hdrStats.how = "main"; hdrStats.ms = Math.round(performance.now() - t1);
  return { width: p.width, height: p.height, data: p.data };
}

/** HDRLoader's texture (DataTextureLoader._applyTexData with its parse()'s fields) on the decoded texels. */
function texture(d: HdrData): THREE.DataTexture {
  const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, THREE.HalfFloatType);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.anisotropy = 1;
  t.colorSpace = THREE.LinearSRGBColorSpace;
  t.flipY = true;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** one download and one decode per URL at a time (development's double effect, a remount): each caller its own texture */
const inflight = new Map<string, Promise<HdrData>>();

/**
 * The equirectangular HDR at `url` as a half-float DataTexture, decoded off the main thread. Rejects as
 * HDRLoader.loadAsync did (a failed download, a file that is not RGBE).
 */
export function loadHDR(url: string): Promise<THREE.DataTexture> {
  let p = inflight.get(url);
  if (!p) {
    // (fetch's defaults are FileLoader's: mode cors, same-origin credentials; the preload's crossorigin="anonymous")
    const job = fetch(url).then((r) => { if (!r.ok) throw new Error(`HDR ${r.status}`); return r.arrayBuffer(); }).then(decode);
    const clear = () => { if (inflight.get(url) === job) inflight.delete(url); };
    job.then(clear, clear);
    inflight.set(url, job);
    p = job;
  }
  return p.then(texture);
}
