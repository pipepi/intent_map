import { encodeElementPackage } from "./element-package.ts";
import type { ElementPluginManifest, NodeTypePackage } from "./package-types.ts";

const componentSource = `
const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
class IntentInput extends HTMLElement { static get observedAttributes(){return ["value","field","label"]} connectedCallback(){this.render()} attributeChangedCallback(){this.render()} render(){const area=this.tagName.endsWith("TEXTAREA");this.innerHTML='<label>'+esc(this.getAttribute("label"))+(area?'<textarea>':'<input>')+(area?esc(this.getAttribute("value"))+'</textarea>':' value="'+esc(this.getAttribute("value"))+'">')+'</label>';const input=this.querySelector(area?'textarea':'input');input.oninput=()=>this.dispatchEvent(new CustomEvent("intent-value-change",{bubbles:true,composed:true,detail:{field:this.getAttribute("field"),value:input.value}}))} }
class IntentText extends HTMLElement { static get observedAttributes(){return ["value"]} connectedCallback(){this.render()} attributeChangedCallback(){this.render()} render(){this.textContent=this.getAttribute("value")||"等待输入文本…"} }
for(const [tag,klass] of [["intent-text-input",IntentInput],["intent-text-textarea",IntentInput],["intent-text-preview",IntentText]]) if(!customElements.get(tag)) customElements.define(tag,klass);
`;
const mediaSource = `
class IntentImage extends HTMLElement { static get observedAttributes(){return ["value"]} connectedCallback(){this.render()} attributeChangedCallback(){this.render()} render(){const value=this.getAttribute("value")||"";this.replaceChildren();if(!value){this.textContent="输入图片 URL 后显示图片";return}let url;try{url=new URL(value)}catch{}if(!url||!["http:","https:"].includes(url.protocol)){this.textContent="仅支持 HTTP/HTTPS 图片地址";return}const img=document.createElement("img");img.src=value;img.alt="节点图片";img.style.cssText="width:100%;max-height:130px;object-fit:cover;border-radius:5px";img.onerror=()=>{this.textContent="图片加载失败"};this.append(img)} }
if(!customElements.get("intent-media-image")) customElements.define("intent-media-image",IntentImage);
`;

const base = (id: string, name: string, elements: ElementPluginManifest["elements"]): ElementPluginManifest => ({
  format: "intent-element-plugin", schemaVersion: 1, id, name, version: "1.0.0", entry: "entry.mjs", elements,
  permissions: id.includes("media") ? ["network:image"] : [], sourcePaths: ["source/index.js"], sourceSha256: "0".repeat(64), entrySha256: "0".repeat(64),
  communityTags: ["source-reviewed", "maintained"], redistributable: true,
});

export async function sampleElementArchives() {
  return [
    await encodeElementPackage(base("official.text-elements", "Text Elements", [
      { id: "input", tag: "intent-text-input", purpose: "control" }, { id: "textarea", tag: "intent-text-textarea", purpose: "control" }, { id: "text", tag: "intent-text-preview", purpose: "preview" },
    ]), componentSource, { "source/index.js": componentSource }),
    await encodeElementPackage(base("official.media-elements", "Media Elements", [{ id: "image", tag: "intent-media-image", purpose: "preview" }]), mediaSource, { "source/index.js": mediaSource }),
  ];
}

export const SAMPLE_NODE_TYPE_PACKAGES: NodeTypePackage[] = [
  { format: "intent-node-type-plugin", schemaVersion: 1, id: "official.text-nodes", name: "Text Plugin", version: "1.0.0", dependencies: [{ id: "official.text-elements", version: "1.0.0" }], nodeTypes: [{ type: "text", displayName: "文本节点", defaultName: "intent", fields: [{ key: "text", defaultValue: "", control: { pluginId: "official.text-elements", elementId: "input", sourceField: "text", properties: { label: "文本" } } }], view: [{ pluginId: "official.text-elements", elementId: "text", sourceField: "text" }] }] },
  { format: "intent-node-type-plugin", schemaVersion: 1, id: "official.media-nodes", name: "Media Plugin", version: "1.0.0", dependencies: [{ id: "official.text-elements", version: "1.0.0" }, { id: "official.media-elements", version: "1.0.0" }], nodeTypes: [
    { type: "image", displayName: "图片节点", defaultName: "image-intent", fields: [{ key: "imageUrl", defaultValue: "", control: { pluginId: "official.text-elements", elementId: "input", sourceField: "imageUrl", properties: { label: "图片 URL" } } }], view: [{ pluginId: "official.media-elements", elementId: "image", sourceField: "imageUrl" }] },
    { type: "image-description", displayName: "图片与简介", defaultName: "image-intent", fields: [{ key: "imageUrl", defaultValue: "", control: { pluginId: "official.text-elements", elementId: "input", sourceField: "imageUrl", properties: { label: "图片 URL" } } }, { key: "description", defaultValue: "", control: { pluginId: "official.text-elements", elementId: "textarea", sourceField: "description", properties: { label: "简介" } } }], view: [{ pluginId: "official.media-elements", elementId: "image", sourceField: "imageUrl" }, { pluginId: "official.text-elements", elementId: "text", sourceField: "description" }] },
  ] },
];
