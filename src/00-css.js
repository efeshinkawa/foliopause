// ---------------------------------------------------------------------------
// FolioPause design tokens + stylesheet.
// The colour, typography, geometry, and motion system is project-owned and
// deliberately distinct from the host site's visual identity. No external
// fonts or brand assets are loaded.
// ---------------------------------------------------------------------------

const CSS = `
#gps-root{
  /* FolioPause Night Ink */
  --sf:#111522; --sf1:#191f2f; --sf2:#232b3e; --sf3:#303a50;
  --on:#f3f5fa; --onv:#b8c0d4; --outline:#5c6982; --outline-s:#9aa6bc;
  --pri:#9b8cff; --on-pri:#171129; --pri-c:#312a63; --on-pri-c:#e1dcff;
  --err:#ffb3bd; --err-c:#641d2b; --on-err-c:#ffd9de;
  --ok:#64e0b8; --ok-c:#123f35; --on-ok-c:#c8f8e8;
  --scrim:rgba(0,0,0,.6);
  --el1:0 1px 2px rgba(0,0,0,.3),0 1px 3px 1px rgba(0,0,0,.15);
  --el2:0 1px 2px rgba(0,0,0,.3),0 2px 6px 2px rgba(0,0,0,.15);
  --el3:0 1px 3px rgba(0,0,0,.3),0 4px 8px 3px rgba(0,0,0,.15);
  --el5:0 4px 4px rgba(0,0,0,.3),0 8px 12px 6px rgba(0,0,0,.15);
  /* FolioPause motion: quick decisions, gentle review transitions */
  --e-std:cubic-bezier(.22,.8,.25,1);
  --e-dec:cubic-bezier(.16,1,.3,1);
  --e-acc:cubic-bezier(.55,0,1,.45);
  --d-s:140ms; --d-m:220ms; --d-l:360ms;

  position:fixed; inset:0; z-index:2147483000;
  background:var(--sf); color:var(--on);
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:14px; line-height:20px; letter-spacing:.2px;
  display:flex; flex-direction:column;
  -webkit-font-smoothing:antialiased;
  user-select:none; -webkit-user-select:none;
  contain:strict;
}
#gps-root.gps-light{
  --sf:#f8f9fd; --sf1:#eef1f8; --sf2:#e4e8f2; --sf3:#d5dbe8;
  --on:#182033; --onv:#4d5870; --outline:#7a8498; --outline-s:#49546a;
  --pri:#6254d8; --on-pri:#fff; --pri-c:#e4e0ff; --on-pri-c:#332970;
  --err:#b4233d; --err-c:#ffe1e5; --on-err-c:#6f1025;
  --ok:#1a725a; --ok-c:#d6f7eb; --on-ok-c:#0e4b3a;
  --scrim:rgba(0,0,0,.4);
  --el1:0 1px 2px rgba(60,64,67,.3),0 1px 3px 1px rgba(60,64,67,.15);
  --el2:0 1px 2px rgba(60,64,67,.3),0 2px 6px 2px rgba(60,64,67,.15);
  --el3:0 1px 3px rgba(60,64,67,.3),0 4px 8px 3px rgba(60,64,67,.15);
  --el5:0 4px 4px rgba(60,64,67,.3),0 8px 12px 6px rgba(60,64,67,.15);
}
#gps-root *,#gps-root *::before,#gps-root *::after{box-sizing:border-box}
/* Keep the host page's global rules out. Written with :where() so the whole
   selector has zero specificity — every rule below still wins over it. */
:where(#gps-root) :where(div,span,p,h2,button,a,i,b,table,tbody,tr,td,label,input,select,img,video){
  margin:0;padding:0;border:0;outline:none;background:none;color:inherit;font:inherit;
  text-align:left;text-transform:none;text-decoration:none;text-shadow:none;letter-spacing:inherit;
  float:none;box-shadow:none;list-style:none;vertical-align:baseline;min-width:0;max-width:none;max-height:none;
  line-height:inherit;font-size:inherit;font-weight:inherit;font-family:inherit;font-style:normal;white-space:normal;opacity:1;
  transform:none;filter:none;animation:none;visibility:visible}
#gps-root [hidden]{display:none!important}
:where(#gps-root) :where(button){cursor:pointer}
#gps-root svg{display:block;flex:none}
#gps-root :focus-visible{outline:2px solid var(--pri);outline-offset:2px;border-radius:4px}

/* ---------- app bar ---------- */
.gps-bar{height:68px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px 0 14px;position:relative;z-index:3}
.gps-bar.on-stage{background:linear-gradient(rgba(8,11,20,.72),rgba(8,11,20,0));color:#f3f5fa}
.gps-bar.on-surface{background:var(--sf);border-bottom:1px solid transparent}
.gps-bar.on-surface.scrolled{border-bottom-color:var(--outline)}
.gps-brand{display:flex;align-items:center;gap:12px;padding-left:4px;min-width:0}
.gps-brand .n{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:18px;line-height:24px;font-weight:650;letter-spacing:-.2px;white-space:nowrap}
.gps-mark{width:24px;height:24px;flex:none}
.gps-spacer{flex:1 1 auto;min-width:8px}
.gps-count{font-size:13px;color:var(--onv);white-space:nowrap;padding:0 4px;font-variant-numeric:tabular-nums}
.gps-bar.on-stage .gps-count{color:#cbd2e3}
.gps-score{display:flex;align-items:center;gap:4px;padding:0}
.gps-score-item{height:32px;padding:0 8px;border-radius:10px;display:inline-flex;align-items:center;gap:5px;background:var(--sf1);color:var(--onv)}
.gps-bar.on-stage .gps-score-item{background:rgba(25,31,47,.84);backdrop-filter:blur(10px);color:#cbd2e3}
.gps-score-item b{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;font-weight:650;color:var(--on)}
.gps-bar.on-stage .gps-score-item b{color:#fff}
.gps-score-item.pending svg{color:#d9ccff}
.gps-score-item.deleted svg{color:var(--err)}

/* compact icon button with a 48px pointer target */
.gps-ib{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;position:relative;color:var(--onv);flex:none;-webkit-tap-highlight-color:transparent}
.gps-ib::after{content:"";position:absolute;left:50%;top:50%;width:48px;height:48px;transform:translate(-50%,-50%)}
.gps-bar.on-stage .gps-ib{color:#cbd2e3}
.gps-ib::before{content:"";position:absolute;inset:0;border-radius:inherit;background:currentColor;opacity:0;transition:opacity var(--d-s) var(--e-std)}
.gps-ib:hover::before{opacity:.08}
.gps-ib:active::before{opacity:.12}
.gps-ib:disabled{opacity:.38;cursor:default}
.gps-ib:disabled::before{opacity:0!important}

/* filled and tonal action buttons */
.gps-btn{height:42px;border-radius:14px;padding:0 16px 0 12px;display:inline-flex;align-items:center;gap:8px;position:relative;overflow:hidden;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;font-weight:650;letter-spacing:.05px;white-space:nowrap;
  background:var(--sf2);color:var(--on);transition:box-shadow var(--d-s) var(--e-std)}
.gps-btn::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity var(--d-s) var(--e-std)}
.gps-btn:hover::before{opacity:.08}
.gps-btn:active::before{opacity:.12}
.gps-btn:hover{box-shadow:var(--el1)}
.gps-btn.tonal{background:var(--pri-c);color:var(--on-pri-c)}
.gps-btn.filled{background:var(--pri);color:var(--on-pri)}
.gps-btn.danger{background:var(--err-c);color:var(--on-err-c)}
/* a destructive primary action needs to carry weight on a light surface too */
#gps-root.gps-light .gps-btn.danger{background:#a91e39;color:#fff}
.gps-btn.text{background:none;padding:0 12px}
.gps-btn.text:hover{box-shadow:none}
.gps-btn:disabled{opacity:.38;cursor:default;box-shadow:none}
.gps-btn:disabled::before{opacity:0!important}
.gps-badge{min-width:20px;height:20px;border-radius:10px;padding:0 6px;display:grid;place-items:center;background:var(--err);color:var(--sf);font-size:11px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.gps-btn.tonal .gps-badge{background:var(--on-pri-c);color:var(--pri-c)}

/* ---------- body / views ---------- */
.gps-body{flex:1 1 auto;position:relative;min-height:0;display:flex;flex-direction:column}
.gps-view{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0}
.gps-view[hidden]{display:none}

/* ---------- swipe stage ---------- */
.gps-stage{position:relative;flex:1 1 auto;min-height:0;background:#000;overflow:hidden;touch-action:none;
  display:flex;align-items:center;justify-content:center;margin-top:-68px;padding-top:68px}
.gps-glow{position:absolute;top:0;bottom:0;width:38%;pointer-events:none;opacity:0;transition:opacity 90ms linear}
.gps-glow.l{left:0;background:radial-gradient(120% 80% at 0% 50%,color-mix(in srgb,var(--err) 42%,transparent),transparent 70%)}
.gps-glow.r{right:0;background:radial-gradient(120% 80% at 100% 50%,color-mix(in srgb,var(--pri) 42%,transparent),transparent 70%)}

.gps-card{position:absolute;border-radius:16px;overflow:hidden;background:#0b0b0c;
  box-shadow:var(--el5);will-change:transform,opacity;touch-action:none;cursor:grab;
  transition:transform var(--d-m) var(--e-dec),opacity var(--d-m) var(--e-std)}
.gps-card.grab{cursor:grabbing;transition:none}
.gps-card.fly{transition:transform 360ms var(--e-acc),opacity 360ms var(--e-acc)}
.gps-card.enter{animation:gps-card-in var(--d-l) var(--e-dec) both}
@keyframes gps-card-in{from{transform:scale(.92);opacity:0}to{transform:none;opacity:1}}
.gps-card img,.gps-card video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;background:#0b0b0c}
.gps-card video{object-fit:contain;background:#000}
.gps-card .ph{position:absolute;inset:0;background:linear-gradient(100deg,#1a1b1d 30%,#232527 50%,#1a1b1d 70%);background-size:220% 100%;animation:gps-shim 1.1s linear infinite}
@keyframes gps-shim{to{background-position:-220% 0}}
.gps-card .meta{position:absolute;left:0;right:0;bottom:0;padding:56px 20px 18px;pointer-events:none;
  background:linear-gradient(transparent,rgba(0,0,0,.78));color:#fff;display:flex;flex-direction:column;gap:2px}
.gps-card .meta .d1{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:22px;font-weight:600;letter-spacing:0}
.gps-card .meta .d2{font-size:12px;line-height:18px;color:#cbd2e3;display:flex;gap:6px;flex-wrap:wrap}
.gps-card .meta .d2 i{font-style:normal;opacity:.55}
.gps-chips{position:absolute;top:14px;left:14px;display:flex;gap:6px;flex-wrap:wrap;pointer-events:none;max-width:70%}
.gps-chip{height:26px;padding:0 10px;border-radius:13px;display:inline-flex;align-items:center;gap:5px;
  background:rgba(0,0,0,.55);backdrop-filter:blur(8px);color:#fff;font-size:12px;font-weight:500;letter-spacing:.2px}
.gps-chip svg{width:14px;height:14px}
.gps-chip.vid{background:rgba(118,103,245,.86);color:#fff}

/* video affordance — a video must never read as a still photo */
.gps-play{position:absolute;top:50%;left:50%;width:74px;height:74px;border-radius:37px;z-index:2;
  display:grid;place-items:center;color:#fff;background:rgba(10,12,18,.5);backdrop-filter:blur(10px);
  box-shadow:0 8px 26px rgba(0,0,0,.5),inset 0 0 0 1.5px rgba(255,255,255,.34);
  transform:translate(-50%,-50%);
  transition:opacity var(--d-s) var(--e-std),background var(--d-s) var(--e-std),transform var(--d-s) var(--e-std)}
.gps-play svg{width:34px;height:34px;margin-left:4px}
.gps-play svg path{fill:currentColor}
.gps-play:hover{background:rgba(26,30,44,.76);transform:translate(-50%,-50%) scale(1.06)}
.gps-card.playing .gps-play,.gps-light-box.playing .gps-play{opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(.82)}
/* resolving a source takes seconds on a cold rendition; the card says so */
.gps-vload{position:absolute;inset:0;display:none;place-items:center;z-index:3;pointer-events:none}
.gps-card.loading .gps-vload,.gps-light-box.loading .gps-vload{display:grid}

/* verdict stamps */
.gps-stamp{position:absolute;top:24px;display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:14px;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:20px;font-weight:700;letter-spacing:1px;
  opacity:0;pointer-events:none;box-shadow:var(--el2);will-change:opacity,transform}
.gps-stamp svg{width:22px;height:22px}
.gps-stamp.del{right:24px;background:var(--err-c);color:var(--on-err-c);transform:rotate(9deg) scale(.9)}
.gps-stamp.keep{left:24px;background:var(--pri-c);color:var(--on-pri-c);transform:rotate(-9deg) scale(.9)}

/* side navigation chevrons */
.gps-nav{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:24px;
  display:grid;place-items:center;background:rgba(25,31,47,.82);backdrop-filter:blur(8px);color:#f3f5fa;
  opacity:0;transition:opacity var(--d-m) var(--e-std),background var(--d-s) var(--e-std);z-index:2}
.gps-stage:hover .gps-nav{opacity:1}
.gps-nav:hover{background:rgba(48,58,80,.96)}
.gps-nav.l{left:16px}
.gps-nav.r{right:16px}
.gps-nav:disabled{opacity:0!important}
.gps-light-box .gps-nav{opacity:1}
.gps-light-box .gps-nav:hover{background:rgba(48,58,80,.98)}

/* ---------- bottom action bar ---------- */
.gps-actions{flex:none;display:flex;align-items:center;justify-content:center;gap:16px;padding:10px 16px 12px;background:var(--sf);position:relative;z-index:3}
.gps-act{display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--onv);font-size:11px;letter-spacing:.4px}
.gps-act .c{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;position:relative;overflow:hidden;
  background:var(--sf2);color:var(--on);transition:transform var(--d-s) var(--e-std),box-shadow var(--d-s) var(--e-std),border-radius var(--d-s) var(--e-std)}
.gps-act .c svg{width:26px;height:26px}
.gps-act.sm .c{width:44px;height:44px;border-radius:14px}
.gps-act.sm .c svg{width:22px;height:22px}
.gps-act .c::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity var(--d-s) var(--e-std)}
.gps-act:hover .c::before{opacity:.1}
.gps-act:hover .c{box-shadow:var(--el2);border-radius:28px}
.gps-act.sm:hover .c{border-radius:22px}
.gps-act:active .c{transform:scale(.94)}
.gps-act.del .c{background:var(--err-c);color:var(--on-err-c)}
.gps-act.review .c{background:var(--sf3);color:var(--pri)}
.gps-act-badge{position:absolute;right:-4px;top:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;display:grid;place-items:center;
  background:var(--err);color:var(--sf);font-size:10px;font-weight:700;line-height:1;box-shadow:var(--el1);z-index:2}
.gps-act.keep .c{background:var(--pri-c);color:var(--on-pri-c)}
.gps-act:disabled{opacity:.38;cursor:default}
.gps-act:disabled .c{box-shadow:none!important;border-radius:18px!important;transform:none!important}
.gps-act:disabled .c::before{opacity:0!important}
.gps-key{font-size:10px;line-height:14px;color:var(--outline-s);border:1px solid var(--outline);border-radius:4px;padding:0 5px;min-width:18px;text-align:center}

/* ---------- review grid ---------- */
.gps-scroll{flex:1 1 auto;overflow:auto;overscroll-behavior:contain;padding:0 16px 120px}
.gps-scroll::-webkit-scrollbar{width:12px}
.gps-scroll::-webkit-scrollbar-thumb{background:var(--sf3);border-radius:6px;border:3px solid var(--sf)}
.gps-rhead{display:flex;align-items:center;gap:12px;padding:4px 4px 16px;flex-wrap:wrap}
.gps-rhead h2{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:22px;line-height:28px;font-weight:700;letter-spacing:-.25px}
.gps-rhead p{margin:2px 0 0;color:var(--onv);font-size:13px}
.gps-grid{display:flex;flex-wrap:wrap;gap:4px}
.gps-tile{position:relative;height:200px;flex-grow:1;border-radius:8px;overflow:hidden;background:var(--sf1);cursor:pointer;
  transition:transform var(--d-m) var(--e-std),box-shadow var(--d-m) var(--e-std),filter var(--d-m) var(--e-std),opacity var(--d-m) var(--e-std);
  animation:gps-tile-in var(--d-m) var(--e-dec) both}
@keyframes gps-tile-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
.gps-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.gps-tile::after{content:"";position:absolute;inset:0;background:#000;opacity:0;transition:opacity var(--d-s) var(--e-std)}
.gps-tile:hover::after{opacity:.12}
.gps-tile .mark{position:absolute;top:8px;left:8px;width:26px;height:26px;border-radius:13px;display:grid;place-items:center;
  background:var(--err);color:var(--sf);box-shadow:var(--el1);transition:transform var(--d-m) var(--e-dec),background var(--d-s) var(--e-std),color var(--d-s) var(--e-std)}
.gps-tile .mark svg{width:16px;height:16px}
.gps-tile .zoom{position:absolute;top:8px;right:8px;width:30px;height:30px;border-radius:15px;display:grid;place-items:center;
  background:rgba(0,0,0,.55);backdrop-filter:blur(6px);color:#fff;opacity:0;transition:opacity var(--d-s) var(--e-std)}
.gps-tile .zoom svg{width:17px;height:17px}
.gps-tile:hover .zoom{opacity:1}
.gps-tile .tvid{position:absolute;right:8px;bottom:8px;z-index:1;display:inline-flex;align-items:center;gap:5px;
  height:24px;padding:0 9px;border-radius:12px;background:rgba(0,0,0,.66);backdrop-filter:blur(6px);
  color:#fff;font-size:11px;font-weight:600;pointer-events:none}
.gps-tile .tvid svg{width:13px;height:13px}
.gps-tile .tvid svg path{fill:currentColor}
.gps-tile .cap{position:absolute;left:0;right:0;bottom:0;padding:22px 10px 8px;font-size:11px;color:#fff;
  background:linear-gradient(transparent,rgba(0,0,0,.7));opacity:0;transition:opacity var(--d-s) var(--e-std);pointer-events:none}
.gps-tile:hover .cap{opacity:1}
/* spared (unmarked) */
.gps-tile.spared{filter:grayscale(.7);opacity:.62;transform:scale(.94);box-shadow:inset 0 0 0 2px var(--ok)}
.gps-tile.spared .mark{background:var(--ok);color:var(--sf)}
.gps-tile .kchip{display:none}
.gps-tile.spared .kchip{position:absolute;top:8px;left:40px;display:inline-flex;align-items:center;height:26px;padding:0 10px;
  border-radius:13px;background:var(--ok);color:var(--sf);font-size:11px;font-weight:600;letter-spacing:.2px;white-space:nowrap}
.gps-grid .sp{flex-grow:10;height:0;pointer-events:none;background:none}

/* sticky confirm bar */
.gps-confirm{position:absolute;left:0;right:0;bottom:0;padding:14px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  background:color-mix(in srgb,var(--sf1) 92%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--outline);z-index:4;
  animation:gps-up var(--d-m) var(--e-dec) both}
@keyframes gps-up{from{transform:translateY(100%)}to{transform:none}}
.gps-confirm .sum{font-size:14px;color:var(--on)}
.gps-confirm .sum b{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:650}

/* ---------- empty / loading / error states ---------- */
.gps-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  text-align:center;padding:32px;color:var(--onv)}
.gps-center .big{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:24px;line-height:32px;color:var(--on);font-weight:700;letter-spacing:-.3px}
.gps-center .ic{width:72px;height:72px;border-radius:36px;background:var(--sf1);display:grid;place-items:center;color:var(--onv);margin-bottom:4px}
.gps-center .ic svg{width:34px;height:34px}
.gps-spin{width:36px;height:36px;border-radius:50%;border:3px solid var(--sf3);border-top-color:var(--pri);animation:gps-rot .9s linear infinite}
@keyframes gps-rot{to{transform:rotate(360deg)}}

/* linear progress */
.gps-lin{width:min(420px,80%);height:4px;border-radius:2px;background:var(--sf3);overflow:hidden}
.gps-lin i{display:block;height:100%;background:var(--pri);border-radius:2px;transition:width var(--d-m) var(--e-std)}

/* ---------- dialog ---------- */
.gps-scrim{position:absolute;inset:0;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10;
  animation:gps-fade var(--d-s) var(--e-std) both;overflow:auto}
@keyframes gps-fade{from{opacity:0}to{opacity:1}}
.gps-dlg{background:var(--sf1);color:var(--on);border-radius:20px;padding:24px;width:min(92vw,480px);max-height:calc(100% - 32px);overflow:auto;margin:auto;
  box-shadow:var(--el3);display:flex;flex-direction:column;gap:16px;animation:gps-dlg-in var(--d-m) var(--e-dec) both}
@keyframes gps-dlg-in{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}
.gps-dlg h2{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:24px;line-height:32px;font-weight:700;letter-spacing:-.3px}
.gps-dlg p{margin:0;color:var(--onv);font-size:14px;line-height:20px}
.gps-dlg .hi{color:var(--on)}
.gps-dlg .gps-legal{font-size:12px;line-height:18px;padding-top:12px;border-top:1px solid var(--outline)}
.gps-dlg .row{display:flex;align-items:center;gap:12px}
.gps-dlg label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--onv)}
.gps-dlg label.row{flex-direction:row;align-items:center;gap:12px;font-size:14px;color:var(--on);cursor:pointer;
  padding:6px 8px;margin:0 -8px;border-radius:8px}
.gps-dlg label.row:hover{background:var(--sf2)}
.gps-dlg select,.gps-dlg input[type=date],.gps-dlg input[type=number]{background:var(--sf);color:var(--on);border:1px solid var(--outline);
  border-radius:8px;padding:10px 12px;font:inherit;color-scheme:dark}
#gps-root.gps-light .gps-dlg select,#gps-root.gps-light .gps-dlg input{color-scheme:light}
.gps-dlg input[type=checkbox]{width:18px;height:18px;accent-color:var(--pri);flex:none}
.gps-dlg .hint{font-size:12px;color:var(--outline-s)}
.gps-dlg .acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}
.gps-dlg .strip{display:flex;gap:6px;overflow:hidden;border-radius:12px}
.gps-dlg .strip img{width:64px;height:64px;object-fit:cover;border-radius:8px;background:var(--sf2)}
.gps-dlg .strip .more{width:64px;height:64px;border-radius:8px;background:var(--sf2);display:grid;place-items:center;color:var(--onv);font-size:13px}
.gps-dlg table{border-collapse:collapse;width:100%}
.gps-dlg td{padding:7px 4px;border-bottom:1px solid var(--outline);color:var(--onv);font-size:13px;vertical-align:top}
.gps-dlg tr:last-child td{border-bottom:0}
.gps-dlg td:first-child{color:var(--on);white-space:nowrap;width:44%}
.gps-kbd{display:inline-block;border:1px solid var(--outline);border-bottom-width:2px;border-radius:5px;padding:1px 6px;font-size:11px;color:var(--on);background:var(--sf2);margin-right:4px}

/* ---------- lightbox preview ---------- */
.gps-light-box{position:absolute;inset:0;background:#000;z-index:11;display:flex;flex-direction:column;animation:gps-fade var(--d-s) var(--e-std) both}
.gps-light-box .im{flex:1 1 auto;position:relative;min-height:0}
.gps-light-box img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.gps-light-box video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:1}

/* ---------- snackbar ---------- */
.gps-snacks{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);display:flex;flex-direction:column-reverse;gap:8px;z-index:20;align-items:center;pointer-events:none}
/* Snackbars stay dark in both themes to preserve hierarchy. */
.gps-snack{min-height:48px;max-width:min(560px,92vw);border-radius:14px;background:#20273a;color:#f3f5fa;
  box-shadow:var(--el3);display:flex;align-items:center;gap:8px;padding:8px 8px 8px 16px;font-size:14px;pointer-events:auto;
  animation:gps-snack-in var(--d-m) var(--e-dec) both}
@keyframes gps-snack-in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
.gps-snack.out{animation:gps-snack-out var(--d-s) var(--e-acc) both}
@keyframes gps-snack-out{to{opacity:0;transform:translateY(10px)}}
.gps-snack .txt{flex:1 1 auto}
.gps-snack .act{color:#b7adff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:650;font-size:14px;
  padding:8px 12px;border-radius:8px;white-space:nowrap;position:relative;overflow:hidden}
.gps-snack .act::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity var(--d-s) var(--e-std)}
.gps-snack .act:hover::before{opacity:.1}
.gps-snack.err{background:#641d2b;color:#ffd9de}
.gps-snack.err .act{color:#ffd9de}
.gps-snack .gps-ib{color:#cbd2e3}
.gps-dry{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:12px;background:var(--ok-c);color:var(--on-ok-c);font-size:12px;font-weight:500;white-space:nowrap}

/* ---------- banner ---------- */
.gps-banner{flex:none;display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--err-c);color:var(--on-err-c);font-size:13px;z-index:4}
.gps-banner .gps-btn{background:transparent;border:1px solid currentColor;color:inherit;height:32px}
.gps-banner .sp{flex:1}

/* ---------- floating launcher (extension / userscript) ---------- */
#gps-fab{position:fixed;right:24px;bottom:24px;z-index:2147482000;height:56px;padding:0 20px;border-radius:16px;
  display:inline-flex;align-items:center;gap:10px;border:0;cursor:pointer;
  background:#7667f5;color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;font-weight:700;
  box-shadow:0 1px 3px rgba(0,0,0,.3),0 4px 8px 3px rgba(0,0,0,.15);
  transition:transform 150ms cubic-bezier(.2,0,0,1),box-shadow 150ms cubic-bezier(.2,0,0,1),border-radius 150ms cubic-bezier(.2,0,0,1)}
#gps-fab:hover{transform:translateY(-1px);border-radius:22px;box-shadow:0 4px 4px rgba(0,0,0,.3),0 8px 12px 6px rgba(0,0,0,.15)}
#gps-fab:active{transform:scale(.97)}
#gps-fab svg{width:24px;height:24px}
#gps-fab .b{min-width:20px;height:20px;border-radius:10px;padding:0 6px;display:grid;place-items:center;background:#641d2b;color:#ffd9de;font-size:11px;font-weight:650}

@media (max-width:720px){
  .gps-bar{height:58px;padding:0 4px 0 8px}
  .gps-brand .n{display:none}
  .gps-score{gap:3px}
  .gps-score-item{height:30px;padding:0 7px}
  .gps-score-item .lbl{display:none}
  .gps-top-review{display:none!important}
  .gps-stage{margin-top:-58px;padding-top:58px}
  .gps-act .c{width:52px;height:52px}
  .gps-key{display:none}
  .gps-tile{height:140px}
  .gps-tile .zoom,.gps-tile .cap{opacity:1}
  .gps-play{width:60px;height:60px;border-radius:30px}
  .gps-play svg{width:28px;height:28px}
  .gps-scroll{padding-left:8px;padding-right:8px}
  .gps-banner{flex-wrap:wrap;gap:8px}
  .gps-banner>span:not(.sp){flex:1 1 calc(100% - 36px)}
  .gps-dlg{border-radius:18px;padding:20px}
}
@media (max-width:520px){
  .gps-bar{gap:4px}
  .gps-brand{padding-left:0;gap:0}
  .gps-score-item{padding:0 5px;gap:3px}
  .gps-bar .gps-btn.tonal{width:40px;padding:0;justify-content:center;gap:0;overflow:visible}
  .gps-review-label{display:none}
  .gps-bar .gps-badge{position:absolute;right:-3px;top:-4px;min-width:18px;height:18px;padding:0 5px}
  .gps-dry{width:28px;padding:0;justify-content:center}
  .gps-dry>span{display:none}
  .gps-actions{gap:9px;padding-left:8px;padding-right:8px}
  .gps-act .c,.gps-act.sm .c{width:48px;height:48px;border-radius:16px}
  .gps-act>span:not(.c){font-size:10px}
  .gps-rhead{align-items:flex-start;padding-left:0;padding-right:0}
  .gps-rhead .gps-spacer{display:none}
  .gps-rhead .gps-btn{margin-left:auto}
  .gps-confirm{padding:10px 12px;gap:8px}
  .gps-confirm .sum{flex:1 0 100%}
  .gps-confirm .gps-spacer{display:none}
  .gps-confirm .gps-btn{flex:1 1 auto;justify-content:center}
  .gps-snacks{bottom:10px;width:100%;padding:0 8px}
  .gps-snack{max-width:100%;width:100%}
  #gps-fab{right:16px;bottom:16px}
}
@media (prefers-reduced-motion:reduce){
  #gps-root *,#gps-root *::before,#gps-root *::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}
}
`;
