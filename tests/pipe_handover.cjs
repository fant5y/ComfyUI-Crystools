const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const TO = 'Pipe to/edit any [Crystools]';
const FROM = 'Pipe from any [Crystools]';
const FIRST = 'CSWITCH_ANY_AUTO';
let extension;
const app = {
  registerExtension(value) { extension = value; },
  canvas: {canvas: new EventTarget(),
    default_connection_color_byType: {IMAGE:'#image', MASK:'#mask', STRING:'#string'},
    default_connection_color_byTypeOff: {IMAGE:'#image-off', MASK:'#mask-off', STRING:'#string-off'},
  },
};
const context = vm.createContext({console, queueMicrotask, CustomEvent});
const bridge = new vm.SyntheticModule(['app'], function() { this.setExport('app',app); }, {context});
const graph = {events:new EventTarget(), subgraphs:new Map(), _nodes:[], links:new Map(), getNodeById(id) { return this._nodes.find(n=>n.id===id); }, setDirtyCanvas(){}};
graph.rootGraph = graph;
app.rootGraph = graph;
let nextId = 1;
class Node {
  constructor(type, owner = graph) {
    this.id = nextId++;
    this.type = type;
    this.inputs = [{name:'CPipeAny',type:'CPipeAny',link:null}];
    this.outputs = [{name:'CPipeAny',type:'CPipeAny',links:[]}];
    if(type === FIRST) {
      this.inputs = []; this.outputs = [{name:'any',type:'*',links:[]}];
      for(let i=1;i<=100;i++) this.addInput('any_'+i,'*');
    }
    this.size = [200,200];
    if (type === TO) for (let i=1;i<=100;i++) this.addInput('any_'+i,'*');
    if (type === FROM) for (let i=1;i<=100;i++) this.addOutput('any_'+i,'*');
    this.onNodeCreated?.(); // A real LiteGraph node is not in a graph yet.
    this.graph = owner;
    owner._nodes.push(this);
    this.onAdded?.(owner);
  }
  getInputLink(slot) {
    if (!this.graph) throw Error('NullGraphError');
    return this.graph.links.get(this.inputs[slot]?.link) || null;
  }
  addInput(name,type) { this.inputs.push({name,type,link:null}); }
  addOutput(name,type) { this.outputs.push({name,type,links:[]}); }
  removeInput(index) { assert.equal(this.inputs[index].link,null); this.inputs.splice(index,1); }
  removeOutput(index) { assert(!this.outputs[index].links?.length); this.outputs.splice(index,1); }
  computeSize() { return [200, Math.max(this.inputs.length,this.outputs.length)*25]; }
  setSize(size) { this.size = size; }
}
class ToNode extends Node { constructor(owner){super(TO,owner);} }
class FirstNode extends Node { constructor(owner){super(FIRST,owner);} }
class FromNode extends Node { constructor(owner){super(FROM,owner);} }
let nextLink = 1;
function connect(source,sourceSlot,target,targetSlot) {
  const id = nextLink++;
  target.graph.links.set(id,{origin_id:source.id,origin_slot:sourceSlot,type:source.outputs[sourceSlot].type});
  target.inputs[targetSlot].link = id;
  source.outputs[sourceSlot].links.push(id);
  target.onConnectionsChange?.(1,targetSlot,true);
  source.onConnectionsChange?.(2,sourceSlot,true);
  return id;
}
function disconnect(source,sourceSlot,target,targetSlot) {
  const id = target.inputs[targetSlot].link;
  target.graph.links.delete(id);
  source.outputs[sourceSlot].links = source.outputs[sourceSlot].links.filter(value=>value!==id);
  target.inputs[targetSlot].link = null;
  target.onConnectionsChange?.(1,targetSlot,false);
  source.onConnectionsChange?.(2,sourceSlot,false);
}
const flush = () => new Promise(resolve=>setImmediate(resolve));

(async()=>{
  const source = fs.readFileSync(path.join(__dirname,'../web/pipe.js'),'utf8');
  const mod = new vm.SourceTextModule(source+'\nexport {mergeLayouts};',{context});
  await mod.link(()=>bridge);
  await mod.evaluate();
  extension.setup();
  extension.beforeRegisterNodeDef(ToNode,{name:TO});
  extension.beforeRegisterNodeDef(FromNode,{name:FROM});
  extension.beforeRegisterNodeDef(FirstNode,{name:FIRST});
  const to = new ToNode(), from = new FromNode();
  assert.equal(to.inputs.length,7);
  assert.equal(from.outputs.length,7);
  connect(to,0,from,0);
  const image = new Node('Image');
  image.outputs[0] = {name:'image',label:'Photo',type:'IMAGE',color_on:'#custom',links:[]};
  connect(image,0,to,3);
  await flush();
  assert.equal(to.inputs[3].name,'any_3');
  assert.equal(to.inputs[3].label,'Photo');
  assert.equal(to.inputs[3].type,'*');
  assert.equal(to.inputs[3].color_on,'#custom');
  assert.equal(from.outputs[3].label,'Photo');
  assert.equal(from.outputs[3].type,'IMAGE');
  assert.equal(from.outputs[3].color_off,'#image-off');
  // Expand beyond six and preserve holes and output indices.
  for (let i=6;i<=12;i++) {
    connect(image,0,to,i);
    await flush();
  }
  assert.equal(to.inputs.length,14); // Twelve values plus spare and pipe.
  assert.equal(from.outputs.length,13);
  assert.equal(from.outputs[12].label,'Photo');
  const edit = new ToNode(), last = new FromNode();
  connect(from,0,edit,0);
  connect(edit,0,last,0);
  await flush();
  assert.equal(edit.inputs[12].label,'Photo');
  assert.equal(last.outputs[12].type,'IMAGE');
  const text = new Node('Text');
  text.outputs[0] = {name:'prompt',type:'STRING',links:[]};
  connect(text,0,edit,3);
  await flush();
  assert.equal(last.outputs[3].label,'prompt / Photo');
  assert.equal(last.outputs[3].color_on,'#string');
  disconnect(text,0,edit,3);
  await flush();
  assert.equal(last.outputs[3].label,'Photo');
  // Existing outgoing connections retain their index even after upstream shrinks.
  const consumer = new Node('Consumer');
  const outgoing = connect(from,12,consumer,0);
  disconnect(image,0,to,12);
  await flush();
  assert.equal(from.outputs.length,13);
  assert.equal(consumer.inputs[0].link,outgoing);
  assert.equal(from.outputs[12].label,'any_12');
  assert.equal(graph.links.get(outgoing).type,'*');
  // Restore saved slots before configure; refresh must preserve active wiring.
  from.onConfigure?.({});
  await flush();
  assert.equal(consumer.inputs[0].link,outgoing);
  // A cycle cannot recurse forever in the metadata resolver.
  connect(last,0,to,0);
  await flush();
  // Capacity has no extra 101st value slot.
  disconnect(last,0,to,0);
  for(let i=12;i<=100;i++) {
    connect(image,0,to,i);
    await flush();
  }
  assert.equal(to.inputs.length,101);
  assert.equal(from.outputs.length,101);
  assert.equal(to.inputs[100].name,'any_100');
  // Reproduce ComfyUI's native subgraph boundary: output slots own internal links.
  const child = {
    _nodes:[], links:new Map(), rootGraph:graph, inputNode:{id:-10},
    outputNode:{slots:[]}, getNodeById:graph.getNodeById, setDirtyCanvas(){},
  };
  graph.subgraphs.set('child',child);
  const inside = new ToNode(child);
  const innerImage = new Node('Image',child);
  innerImage.outputs[0] = {name:'inner_image',type:'IMAGE',links:[]};
  for(let i=1;i<=7;i++) { connect(innerImage,0,inside,i); await flush(); }
  child.outputNode.slots = [{getLinks:()=>[{origin_id:inside.id,origin_slot:0}]}];
  const host = new Node('Subgraph');
  host.subgraph = child;
  const outside = new FromNode();
  connect(host,0,outside,0);
  await flush();
  assert.equal(outside.outputs.length,8);
  assert.equal(outside.outputs[7].label,'inner_image');
  assert.equal(outside.outputs[7].color_on,'#image');
  // Editing internally refreshes nodes in the parent graph, without reconnecting.
  connect(innerImage,0,inside,8);
  await flush();
  assert.equal(outside.outputs.length,9);
  // Nest the exported pipe another level deep.
  const outer = {
    _nodes:[], links:new Map(), rootGraph:graph, inputNode:{id:-10},
    outputNode:{slots:[]}, getNodeById:graph.getNodeById, setDirtyCanvas(){},
  };
  graph.subgraphs.set('outer',outer);
  const nestedHost = new Node('Subgraph',outer);
  nestedHost.subgraph = child;
  outer.outputNode.slots = [{getLinks:()=>[{origin_id:nestedHost.id,origin_slot:0}]}];
  const outerHost = new Node('Subgraph');
  outerHost.subgraph = outer;
  const nestedOutside = new FromNode();
  connect(outerHost,0,nestedOutside,0);
  await flush();
  assert.equal(nestedOutside.outputs[8].label,'inner_image');
  // Route an incoming pipe through a shared definition; resolve each instance separately.
  const insideFrom = new FromNode(child);
  const ioLink = nextLink++;
  child.links.set(ioLink,{origin_id:-10,origin_slot:0});
  insideFrom.inputs[0].link = ioLink;
  child.outputNode.slots = [{getLinks:()=>[{origin_id:insideFrom.id,origin_slot:0}]}];
  connect(to,0,host,0);
  const secondHost = new Node('Subgraph');
  secondHost.subgraph = child;
  const secondTo = new ToNode();
  connect(text,0,secondTo,1);
  connect(secondTo,0,secondHost,0);
  const secondOutside = new FromNode();
  connect(secondHost,0,secondOutside,0);
  await flush();
  assert.equal(outside.outputs[3].label,'Photo');
  assert.equal(secondOutside.outputs[1].label,'prompt');
  assert.equal(outside.outputs.length,101);
  assert.equal(secondOutside.outputs.length,7);
  // Input forwarding across two nested boundaries keeps the host context.
  const outerIo = nextLink++;
  outer.links.set(outerIo,{origin_id:-10,origin_slot:0});
  nestedHost.inputs[0].link = outerIo;
  connect(secondTo,0,outerHost,0);
  await flush();
  assert.equal(nestedOutside.outputs[1].label,'prompt');
  // Host callbacks are observed even when neither endpoint is a pipe.
  const originalHook = host.onConnectionsChange;
  assert.equal(typeof originalHook,'function');
  disconnect(to,0,host,0);
  await flush();
  assert.equal(outside.outputs[1].label,'any_1');
  assert.equal(secondOutside.outputs[1].label,'prompt');
  // Workflow configure events refresh metadata even without connection callbacks.
  text.outputs[0].name = 'loaded_prompt';
  graph.events.dispatchEvent(new Event('configured'));
  await flush();
  assert.equal(secondOutside.outputs[1].label,'loaded_prompt');
  assert.equal(nestedOutside.outputs[1].label,'loaded_prompt');
  const first = new FirstNode();
  assert.equal(first.inputs.length,2);
  connect(image,0,first,0);
  await flush();
  assert.equal(first.inputs[0].name,'any_1');
  assert.equal(first.inputs[0].label,'Photo');
  assert.equal(first.inputs[0].type,'*');
  assert.equal(first.inputs[0].color_on,'#custom');
  for(let i=1;i<=12;i++) {connect(text,0,first,i); await flush();}
  assert.equal(first.inputs.length,14);
  assert.equal(first.inputs[12].name,'any_13');
  assert.equal(first.inputs[12].label,'loaded_prompt');
  const insideSwitch = new FirstNode(outer);
  connect(nestedHost,0,insideSwitch,0);
  await flush();
  assert.equal(insideSwitch.inputs[0].label,'CPipeAny');
  assert.equal(first.outputs[0].type,'*');

  {
  const branchA = new ToNode(), branchB = new ToNode(), auto = new FirstNode();
  const model = new Node('Model'), clip = new Node('Clip'), vae = new Node('Vae');
  for (const [source,name,color] of [[model,'MODEL','#model'],[clip,'CLIP','#clip'],[vae,'VAE','#vae']]) {
    source.outputs[0] = {name,type:name,color_on:color,links:[]};
  }
  connect(model,0,branchA,1); connect(clip,0,branchA,2); connect(vae,0,branchA,3);
  connect(vae,0,branchB,1); connect(model,0,branchB,2);
  connect(branchA,0,auto,0); connect(branchB,0,auto,1);
  const after = new FromNode(), edit = new ToNode();
  connect(auto,0,after,0); connect(auto,0,edit,0);
  await flush();
  assert.equal(auto.outputs[0].type,'CPipeAny');
  assert.deepEqual(after.outputs.slice(1,4).map(slot=>slot.label),['MODEL','CLIP','VAE']);
  assert.deepEqual(edit.inputs.slice(1,4).map(slot=>slot.label),['MODEL','CLIP','VAE']);
  assert.equal(after.outputs[1].color_on,'#model');
  assert.deepEqual(JSON.parse(JSON.stringify(auto.properties.crystools_pipe_layout)).map(field=>field?.label),['MODEL','CLIP','VAE']);
  assert.deepEqual(JSON.parse(JSON.stringify(branchB.properties.crystools_pipe_layout)).map(field=>field?.label),['VAE','MODEL']);
  branchA.mode = 4;
  graph.events.dispatchEvent(new Event('configured'));
  await flush();
  assert.equal(after.outputs[1].label,'MODEL'); // The common layout stays stable across activation changes.
  const extra = new Node('Extra'); extra.outputs[0] = {name:'positive',type:'CONDITIONING',links:[]};
  connect(extra,0,branchB,3); await flush();
  assert.equal(after.outputs[4].label,'positive');
  assert.equal(edit.inputs[4].label,'positive');
  const nextAuto = new FirstNode(), afterNext = new FromNode();
  connect(auto,0,nextAuto,0); connect(branchB,0,nextAuto,1); connect(nextAuto,0,afterNext,0);
  await flush();
  assert.equal(afterNext.outputs[1].label,'MODEL');
  assert.equal(afterNext.outputs[4].label,'positive');
  const routed = {_nodes:[],links:new Map(),rootGraph:graph,inputNode:{id:-10},outputNode:{slots:[]},
    getNodeById:graph.getNodeById,setDirtyCanvas(){}};
  graph.subgraphs.set('routed',routed);
  const innerAuto = new FirstNode(routed);
  const inputLink = nextLink++; routed.links.set(inputLink,{origin_id:-10,origin_slot:0});
  innerAuto.inputs[0].link = inputLink;
  routed.outputNode.slots = [{getLinks:()=>[{origin_id:innerAuto.id,origin_slot:0}]}];
  const hostA = new Node('Subgraph'), hostB = new Node('Subgraph'); hostA.subgraph=routed; hostB.subgraph=routed;
  connect(branchA,0,hostA,0); connect(branchB,0,hostB,0);
  const outsideA = new FromNode(), outsideB = new FromNode();
  connect(hostA,0,outsideA,0); connect(hostB,0,outsideB,0); await flush();
  assert.equal(outsideA.outputs[1].label,'MODEL'); assert.equal(outsideB.outputs[1].label,'VAE');
  assert.equal(innerAuto.properties.crystools_pipe_layouts[hostA.id+':'+innerAuto.id][0].label,'MODEL');
  assert.equal(innerAuto.properties.crystools_pipe_layouts[hostB.id+':'+innerAuto.id][0].label,'VAE');
  // A switch carrying ordinary values must continue to advertise a wildcard output.
  connect(image,0,auto,2); await flush();
  assert.equal(auto.outputs[0].type,'*');
  assert.equal(after.outputs[1].label,'any_1');

  const template = new ToNode(), blank = new ToNode(), templated = new FirstNode();
  connect(model,0,template,1); connect(clip,0,template,2); connect(vae,0,template,3);
  // Connection time, rather than socket index, determines the saved template.
  connect(template,0,templated,1); connect(blank,0,templated,0); await flush();
  assert.deepEqual(blank.inputs.slice(1,4).map(slot=>slot.label),['MODEL','CLIP','VAE']);
  assert.equal(blank.inputs[1].color_on,'#model');
  template.mode=4; graph.events.dispatchEvent(new Event('configured')); await flush();
  assert.equal(blank.inputs[1].label,'MODEL');
  const templatedFrom = new FromNode(); connect(templated,0,templatedFrom,0); await flush();
  assert.equal(templatedFrom.outputs[1].label,'MODEL');
  connect(vae,0,blank,1); await flush();
  assert.equal(blank.inputs[1].label,'VAE'); // Actual source identity is never overwritten.
  const loadedOrder = JSON.parse(JSON.stringify(templated.properties.crystools_input_order));
  templated.onConfigure?.(); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(templated.properties.crystools_input_order)),loadedOrder);
  disconnect(template,0,templated,1); await flush();
  assert.equal(templatedFrom.outputs[1].label,'VAE');
  const latent = new Node('Latent'), latent2 = new Node('Latent');
  latent.outputs[0]={name:'latent',type:'LATENT',color_on:'#latent',links:[]};
  latent2.outputs[0]={name:'latent',type:'LATENT',color_on:'#latent',links:[]};
  const latentSwitch = new FirstNode(), latentPipe = new ToNode();
  connect(latent,0,latentSwitch,1); connect(latent2,0,latentSwitch,0); connect(latentSwitch,0,latentPipe,1);
  await flush();
  assert.equal(latentSwitch.outputs[0].label,'latent');
  assert.equal(latentSwitch.outputs[0].type,'LATENT');
  assert.equal(latentSwitch.outputs[0].color_on,'#latent');
  assert.equal(latentPipe.inputs[1].label,'latent');
  assert.equal(latentPipe.inputs[1].color_on,'#latent');
  connect(image,0,latentSwitch,2); await flush();
  assert.equal(latentSwitch.outputs[0].label,'latent'); assert.equal(latentSwitch.outputs[0].type,'*');
  const grouped = new ToNode(), groupedFrom = new FromNode(), groupSwitch = new FirstNode();
  grouped.pos=[10,10]; groupedFrom.pos=[10,10]; grouped.outputs[0].label='manual';
  graph.groups=[{title:'Outer',boundingRect:[0,0,1000,1000]},{title:'Sampler',boundingRect:[0,0,250,250]}];
  connect(grouped,0,groupSwitch,0); connect(grouped,0,groupedFrom,0); await flush();
  assert.equal(grouped.outputs[0].label,'Sampler'); assert.equal(groupedFrom.outputs[0].label,'Sampler');
  assert.equal(groupSwitch.inputs[0].label,'Sampler'); assert.equal(groupSwitch.outputs[0].label,'Sampler');
  graph.groups[1].title='Renamed'; grouped.onDrawForeground?.(); await flush();
  assert.equal(groupSwitch.outputs[0].label,'Renamed');
  grouped.pos=[2000,2000]; grouped.onDrawForeground?.(); await flush();
  assert.equal(grouped.outputs[0].label,'manual');
  assert.equal(groupSwitch.outputs[0].label,'manual');
  graph.groups=[];

  latent.outputs[0].label='fallback'; latent.outputs[0].color_on='#fallback';
  latent2.outputs[0].label='primary'; latent2.outputs[0].color_on='#primary';
  graph.onAfterChange?.(); await flush();
  assert.equal(latentSwitch.outputs[0].label,'primary'); // Selection uses socket order, not template connection order.
  assert.equal(latentSwitch.outputs[0].color_on,'#primary');
  latent2.mode=4; latentSwitch.onDrawForeground?.(); await flush();
  assert.equal(latentSwitch.outputs[0].label,'fallback');
  assert.equal(latentSwitch.outputs[0].color_on,'#fallback');
  assert.equal(latentPipe.inputs[1].label,'fallback');
  latent2.mode=2; graph.onAfterChange?.(); await flush();
  assert.equal(latentSwitch.outputs[0].label,'fallback');
  latent2.mode=0; latentSwitch.onDrawForeground?.(); await flush();
  assert.equal(latentSwitch.outputs[0].label,'primary');
  // Mode flags on subgraph hosts must survive traversal into the inner source.
  hostA.mode=4;
  const hostSwitch=new FirstNode(); connect(hostA,0,hostSwitch,0); connect(hostB,0,hostSwitch,1); await flush();
  hostA.outputs[0].label='host-label'; // The real source is inside the subgraph.
  assert.equal(hostSwitch.outputs[0].label,'CPipeAny');
  branchB.outputs[0].label='active-branch'; graph.onAfterChange?.(); await flush();
  assert.equal(hostSwitch.outputs[0].label,'active-branch');
  const reroute=new Node('Reroute'); connect(branchA,0,reroute,0);
  const routedSwitch=new FirstNode(); connect(reroute,0,routedSwitch,0); connect(branchB,0,routedSwitch,1);
  await flush(); assert.equal(routedSwitch.outputs[0].label,'active-branch');
  const commonBefore=JSON.stringify(routedSwitch.properties.crystools_pipe_layout);
  branchB.mode=4; routedSwitch.onDrawForeground?.(); await flush();
  assert.equal(routedSwitch.outputs[0].label,'any');
  assert.equal(JSON.stringify(routedSwitch.properties.crystools_pipe_layout),commonBefore);
  branchA.mode=0; routedSwitch.onDrawForeground?.(); await flush();
  assert.equal(routedSwitch.outputs[0].label,'CPipeAny');
  hostA.mode=0; branchB.mode=0;
  console.log('Passed active-input labels/colors, bypass/mute changes, subgraph hosts and reroutes');

  console.log('Passed persisted connection order, sibling templates, group labels and typed switch outputs');

  console.log('Passed switch pipe layouts, reordered branches, missing/extra fields, chains and shared subgraphs');
  }

  console.log('Passed expanding first-available inputs, labels/colors, stable input names and subgraph sources');
  console.log('Passed subgraph outputs, nested input/output forwarding, internal edits and shared-instance isolation');
  console.log('Passed pipe labels/colors, 100-slot growth, chaining/overrides, disconnects, index retention and cycles');

  // Audit: a template branch behind an extraction node.
  const auditTemplate = new ToNode(), auditBlank = new ToNode(), auditExtract = new FromNode(), auditSwitch = new FirstNode();
  const auditModel = new Node('Model'); auditModel.outputs[0] = {name:'MODEL',type:'MODEL',links:[]};
  connect(auditModel,0,auditTemplate,1);
  connect(auditBlank,0,auditExtract,0);
  connect(auditTemplate,0,auditSwitch,0);
  connect(auditExtract,0,auditSwitch,1);
  await flush();
  console.log('AUDIT indirect sibling template:', auditBlank.inputs[1].label, '(expected MODEL)');
  assert.equal(auditBlank.inputs[1].label,'MODEL');

  // Audit: serial instances of the same shared subgraph definition.
  const serial = {_nodes:[], links:new Map(), rootGraph:graph, inputNode:{id:-77}, outputNode:{slots:[]},
    getNodeById:graph.getNodeById, setDirtyCanvas(){}};
  graph.subgraphs.set('auditSerial',serial);
  const serialInside = new FromNode(serial);
  const serialLink = nextLink++; serial.links.set(serialLink,{origin_id:-77,origin_slot:0});
  serialInside.inputs[0].link = serialLink;
  serial.outputNode.slots=[{getLinks:()=>[{origin_id:serialInside.id,origin_slot:0}]}];
  const serialA = new Node('Subgraph'), serialB = new Node('Subgraph'); serialA.subgraph=serial; serialB.subgraph=serial;
  const serialEnd = new FromNode();
  connect(auditTemplate,0,serialA,0); connect(serialA,0,serialB,0); connect(serialB,0,serialEnd,0);
  await flush();
  app.canvas.canvas.dispatchEvent(new CustomEvent('subgraph-opened', {detail:{subgraph:serial,closingGraph:graph,fromNode:serialB}}));
  await flush();
  assert.equal(serialInside.outputs[1].label,'MODEL');
  console.log('AUDIT shared definition inner view:', serialInside.outputs[1].label, '(active serialB instance)');
  console.log('AUDIT serial shared definition:', serialEnd.outputs[1].label, '(expected MODEL)');
  assert.equal(serialEnd.outputs[1].label,'MODEL');

  // Audit: template hints displayed at a source are not passed to its extractor.
  const directBlank = new ToNode(), directSwitch = new FirstNode(), directEnd = new FromNode();
  connect(auditTemplate,0,directSwitch,0); connect(directBlank,0,directSwitch,1); connect(directBlank,0,directEnd,0);
  await flush();
  console.log('AUDIT template hint handover:', directBlank.inputs[1].label, '->', directEnd.outputs[1].label);
  assert.equal(directBlank.inputs[1].label,'MODEL'); assert.equal(directEnd.outputs[1].label,'MODEL');
  auditTemplate.outputs[0].label='Reference Image'; graph.onAfterChange?.(); await flush();
  const bundleExtract = new FromNode(), bundleSwitch = new FirstNode();
  connect(auditTemplate,0,bundleExtract,0); connect(bundleExtract,0,bundleSwitch,0); await flush();
  assert.equal(bundleExtract.outputs[0].label,'Reference Image');
  assert.equal(bundleSwitch.inputs[0].label,'Reference Image');
  console.log('AUDIT bundle name handover:', auditTemplate.outputs[0].label, '->', bundleExtract.outputs[0].label, '->', bundleSwitch.inputs[0].label);


  const duplicateSource = new ToNode(), duplicateEdit = new ToNode(), duplicateSwitch = new FirstNode();
  const duplicateImage = new Node('Image'); duplicateImage.outputs[0]={name:'IMAGE',type:'IMAGE',links:[]};
  const otherImage = new Node('Image'); otherImage.outputs[0]={name:'OTHER',type:'IMAGE',links:[]};
  connect(otherImage,0,duplicateSource,1);
  connect(duplicateImage,0,duplicateSource,2); connect(duplicateImage,0,duplicateSource,3);
  connect(duplicateSource,0,duplicateEdit,0); connect(duplicateImage,0,duplicateEdit,1);
  connect(duplicateEdit,0,duplicateSwitch,0);
  await flush();
  const duplicateLayout=JSON.parse(JSON.stringify(duplicateEdit.properties.crystools_pipe_layout));
  const canonical=JSON.parse(JSON.stringify(duplicateSwitch.properties.crystools_pipe_layout));
  assert.deepEqual(duplicateLayout.map(field=>field.occurrence),[2,0,1]);
  assert.deepEqual(canonical.map(field=>[field.label,field.occurrence]),[['IMAGE',2],['IMAGE',0],['IMAGE',1],['OTHER',0]]);
  const duplicateExtract=new FromNode(), repacked=new ToNode(), repackSwitch=new FirstNode();
  connect(duplicateEdit,0,duplicateExtract,0);
  connect(duplicateExtract,1,repacked,1); connect(duplicateExtract,2,repacked,2);
  connect(repacked,0,repackSwitch,0); await flush();
  if (process.env.CRYSTOOLS_HANDOVER_FIXTURE) fs.writeFileSync(process.env.CRYSTOOLS_HANDOVER_FIXTURE, JSON.stringify({
    base:duplicateSource.properties.crystools_pipe_layout,
    edited:duplicateEdit.properties.crystools_pipe_layout,
    canonical:duplicateSwitch.properties.crystools_pipe_layout,
    repacked:repacked.properties.crystools_pipe_layout,
    repackCanonical:repackSwitch.properties.crystools_pipe_layout,
  }));
  const typedEdit=new ToNode(), typedExtract=new FromNode();
  connect(auditTemplate,0,typedEdit,0); connect(text,0,typedEdit,1); connect(typedEdit,0,typedExtract,0);
  await flush(); assert.equal(typedExtract.outputs[1].type,'*');
  const localTemplate=new ToNode(), localBlank=new ToNode(), localSwitch=new FirstNode(), outerSwitch=new FirstNode();
  connect(text,0,localTemplate,1); connect(localTemplate,0,localSwitch,0); connect(localBlank,0,localSwitch,1);
  connect(auditTemplate,0,outerSwitch,0); connect(localSwitch,0,outerSwitch,1); await flush();
  assert.equal(localBlank.inputs[1].label,'loaded_prompt');
  const serialC=new Node('Subgraph'); serialC.subgraph=serial;
  connect(serialB,0,serialC,0); disconnect(serialB,0,serialEnd,0); connect(serialC,0,serialEnd,0);
  await flush(); assert.equal(serialEnd.outputs[1].label,'MODEL');
  auditModel.outputs[0].label='Renamed model'; graph.events.dispatchEvent(new Event('configured')); await flush();
  assert.equal(serialEnd.outputs[1].label,'Renamed model'); assert.equal(auditBlank.inputs[1].label,'Renamed model');
  let chain=auditTemplate;
  for(let i=0;i<40;i++) { const next=new ToNode(); connect(chain,0,next,0); chain=next; }
  const longEnd=new FromNode(); connect(chain,0,longEnd,0);
  const refreshStart=performance.now(); await flush();
  assert.equal(longEnd.outputs[1].label,'Renamed model');
  console.log('Passed alternatives, duplicate reservations, nested template priority, active inner context and rename propagation');
  console.log('40-editor refresh milliseconds:',Math.round(performance.now()-refreshStart));
  assert.throws(()=>mod.namespace.mergeLayouts([Array.from({length:100},(_,index)=>({label:'field_'+index,type:'*',occurrence:0})),
    [{label:'extra',type:'*',occurrence:0}]]), /limit is 100/);
  console.log('Passed canonical capacity rejection before exposing a truncated layout');

})().catch(error=>{console.error(error);process.exitCode=1;});

