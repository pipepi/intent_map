export const flow = `
.flow-tools{display:flex;align-items:center;gap:5px;margin-left:auto}.flow-tools button{padding:2px 7px}.flow-state{font-size:11px;color:#8fd9ff}
.rail{position:absolute;top:42px;z-index:8;display:flex;flex-direction:column;gap:7px;max-width:150px}.rail.in{left:4px;align-items:flex-start}.rail.out{right:4px;align-items:flex-end}
.port{display:flex;gap:5px;align-items:center;padding:3px 6px;border-radius:12px;background:#101b3ddd;border:1px solid #49649c;color:#bcd1ff;font-size:11px;cursor:crosshair}
.port::before{content:"";width:7px;height:7px;border-radius:50%;background:#65c9ff;box-shadow:0 0 8px #65c9ff}.rail.out .port::before{order:2;background:#9cffb2}
.flow-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}.flow-svg path{fill:none;stroke:#58a8e8;stroke-width:2;opacity:.72}.flow-svg path.live{stroke:#8fffd0;stroke-dasharray:8 5;animation:dash .6s linear infinite}
.trigger-row{position:absolute;left:12px;bottom:10px;z-index:8;display:flex;gap:5px}.trigger-row button{padding:3px 8px}
.flow-off .rail,.flow-off .flow-svg,.flow-off .trigger-row{display:none}@keyframes dash{to{stroke-dashoffset:-13}}
`;
