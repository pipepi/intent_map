export const shared = `
:host{display:block;height:100%;color:#e9edff;font:13px/1.45 ui-sans-serif,system-ui;background:rgba(9,14,34,.55)}
*{box-sizing:border-box}button,select{font:inherit;color:inherit;background:#172343;border:1px solid #405584;border-radius:6px}
button{cursor:pointer}.bar{height:34px;display:flex;align-items:center;gap:8px;padding:5px 9px;background:#111a36cc;border-bottom:1px solid #30436e}
.bar strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.muted{color:#91a0c9}.pill{margin-left:auto;color:#8fcfff}
`;
export const properties = `${shared}
.panel{height:100%;overflow:auto;padding:12px}.compact .panel{padding:8px}.compact .details{display:none}
h3{margin:0 0 8px;font-size:16px}.row{display:grid;grid-template-columns:minmax(80px,.7fr) 1.3fr;gap:8px;padding:5px 0;border-top:1px solid #26365c}
code{color:#8fd9ff;overflow-wrap:anywhere}.value{overflow-wrap:anywhere}.enter{margin-left:auto}
.compact .bar strong{min-width:0;flex:1}.compact .bar .muted,.compact .bar button{flex:none;white-space:nowrap}.compact .enter{margin-left:0}
`;
export const contains = `${shared}
:host{position:relative;overflow:hidden}.surface{position:relative;height:calc(100% - 34px);min-height:900px;overflow:hidden}.world{position:absolute;inset:0;min-height:900px;background-image:linear-gradient(#24345b44 1px,transparent 1px),linear-gradient(90deg,#24345b44 1px,transparent 1px);background-size:28px 28px;transform:translate(var(--projection-pan-x,0),var(--projection-pan-y,0)) scale(var(--projection-zoom,1));transform-origin:top left;transition:transform 90ms ease-out}
::slotted(article){position:absolute;display:block;overflow:hidden;border:1px solid #42598e;border-radius:10px;background:#0c1530;box-shadow:0 8px 24px #0007}
.menu{position:absolute;z-index:20;width:280px;max-height:260px;overflow:auto;padding:8px;background:#111a35;border:1px solid #526aa1;border-radius:10px;box-shadow:0 12px 38px #0009}
.menu button{display:block;width:100%;padding:8px;text-align:left;margin:3px 0}.hint{margin-left:auto;color:#8192bc;font-size:11px}
`;
