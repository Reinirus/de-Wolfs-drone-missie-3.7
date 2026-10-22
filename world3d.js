(()=>{'use strict';
const $=id=>document.getElementById(id);
const canvas=$('view');
const g=canvas.getContext('2d');
if(!g){ $('load').textContent='Deze browser ondersteunt Canvas 2D niet.'; throw new Error('Canvas 2D ontbreekt'); }
const key=new Set();
const craft={
  mini:['DJI Mini 4 Pro','C0-configuratie · standaardaccu · <249 g'],
  neo:['DJI Neo','C0 · circa 135 g'],
  mavic:['DJI Mavic 2 Zoom','Legacy · 905 g · Open A3']
};
const assets={
  logo:'assets/logo.jpg', pilot:'assets/pilot.jpg', bridge:'assets/bridge.jpg', river:'assets/river.jpg',
  church1:'assets/church1.jpg', church2:'assets/church2.jpg', church3:'assets/church3.jpg', church4:'assets/church4.jpg',
  millMain:'assets/mill_main.jpg', millSide:'assets/mill_side.jpg', millRiver:'assets/mill_river.jpg',
  bridgeSide2:'assets/bridge_side2.jpg', bridgeUnder:'assets/bridge_under.jpg',
  crowdSquare:'assets/crowd_square.jpg', pedestrians2:'assets/pedestrians2.jpg',
  streetRow:'assets/street_row.jpg', oldStreet2:'assets/old_street2.jpg',
  forestA:'assets/forest_a.jpg', forestB:'assets/forest_b.jpg', forestC:'assets/forest_c.jpg',
  churchAerial:'assets/church_aerial2.jpg', churchDoes:'assets/church_does2.jpg', square2:'assets/square2.jpg', fair2:'assets/fair2.jpg',
  drone:'assets/drone_sprite.png'
};
const pics={};
for(const [k,src] of Object.entries(assets)){ const img=new Image(); img.src=src; pics[k]=img; }
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const missionNames={
  mixed:'Wisselende basisroute', bridge:'Onder de brug', mill:'360° rond de molen', church:'360° rond de kerk',
  forest:'Tussen bomen door', town:'Huizenrij en straat', square:'Stadsplein en obstakels', crowd:'Mensenmenigte: veiligheidsmissie', slalom:'Combi-route: brug, bos en straat'
};
const routeFacts={
  mixed:'Afwisselende allround-route met gemengde obstakels.',
  bridge:'Leer hoogte houden boven water en precies onder een brug door vliegen.',
  mill:'Oefen een 360° vlucht rond een object met constante bocht en afstand.',
  church:'Oefen bochten rond een hoog object en houd overzicht op hoogte.',
  forest:'Werk aan nauwkeurige stuurbewegingen tussen bomen en bosranden.',
  town:'Train in een bebouwde omgeving met huizenrijen en smalle doorgangen.',
  square:'Let op gebouwen, pleinruimte en obstakels in een open stedelijke setting.',
  crowd:'Veiligheidsmissie: herken dat je niet boven of dicht bij mensenmenigtes mag vliegen.',
  slalom:'Combi-oefening: brug, bomen en bebouwing in één route.'
};
let routeMode='mixed', area='village', craftKey='mini', routeVariant=0;
let objs=[], rings=[], walkers=[], cars=[], signs=[], crowd=[], boats=[];
let noFlyCircle=null, plane=null;
let camMode=0, lookYaw=0, lookPitch=0, paused=false, air=false, ended=false, rth=false, landingMode=false;
let progress=0, score=0, battery=100, speed=0, last=performance.now(), drone={x:0,y:1.8,z:52}, yaw=Math.PI;
let lastDebrief='Klaar om te oefenen.';
const BOARD='dewolf-drone-v37-scores'; let missionSaved=false; function board(){try{return JSON.parse(localStorage.getItem(BOARD)||'[]')}catch{return []}} function renderBoard(){let el=$('leaderboard'); if(!el)return; el.replaceChildren();let a=board();if(!a.length){let li=document.createElement('li');li.textContent='Nog geen voltooide missies';el.append(li);} a.forEach(x=>{let li=document.createElement('li');li.textContent=x.pilot+' · '+x.score+' punten · '+x.route;el.append(li);});} function saveVictory(){if(missionSaved)return;missionSaved=true;let name=($('pilotName').value||'Piloot').trim().slice(0,24)||'Piloot';let list=board();list.push({pilot:name,score,route:missionNames[routeMode],time:Date.now()});list.sort((a,b)=>b.score-a.score||a.time-b.time);try{localStorage.setItem(BOARD,JSON.stringify(list.slice(0,10)))}catch{}renderBoard();}

function msg(s,cls=''){ const n=$('notice'); if(n){ n.textContent=s; n.className='notice '+cls; } }
function add(type,x,z,h=5,w=5,d=5,extra={}){ objs.push({type,x,z,h,w,d,...extra}); }

function setMissionUI(){
  const map={
    mixed:['assets/pilot.jpg','Welkom bij De Wolf\'s Drone Missie Academie','Kies een route en toestel. Iedere herstart levert een andere variant op.'],
    bridge:['assets/bridge_side2.jpg','Brugmissie','Vlieg langs de rivier, onder de brug door en keer veilig terug.'],
    mill:['assets/mill_main.jpg','Molenroute','Oefen een 360° route rond de molen en houd afstand tot de wieken.'],
    church:['assets/church_aerial2.jpg','Kerkroute','Vlieg rond een markant object en stuur strak in bogen om het gebouw.'],
    forest:['assets/forest_a.jpg','Bosroute','Stuur tussen bomen en bosranden door zonder takken te raken.'],
    town:['assets/street_row.jpg','Huizenrij en straat','Oefen in een bebouwde omgeving met straten, huizen en smalle doorgangen.'],
    square:['assets/square2.jpg','Pleinroute','Vlieg rond een plein en langs gebouwen en voetgangerszones.'],
    crowd:['assets/crowd_square.jpg','Mensenmenigte','Veiligheidsmissie: herken dat dicht boven mensen vliegen niet is toegestaan.'],
    slalom:['assets/bridge_under.jpg','Combi-slalom','Eerst brug, dan bomen, daarna bebouwing en gecontroleerd terug landen.']
  };
  const [src,title,cap]=map[routeMode]||map.mixed;
  if($('missionPreview')) $('missionPreview').src=src;
  if($('previewTitle')) $('previewTitle').textContent=title+' · variant '+(routeVariant+1);
  if($('previewCaption')) $('previewCaption').textContent=cap;
  if($('mission')) $('mission').textContent='MISSIE: '+(missionNames[routeMode]||missionNames.mixed);
}

function updateCoachUI(advice=''){ 
  if($('routeMeta')) $('routeMeta').textContent='Route: '+(missionNames[routeMode]||routeMode)+' · variant '+(routeVariant+1)+' · omgeving '+area+'.';
  if($('coachAdvice')) $('coachAdvice').textContent=advice || routeFacts[routeMode] || 'Oefen rustig en gecontroleerd.';
  if($('landingHint')) $('landingHint').textContent='Landinghint: groen baken = home. Druk op LANDEN voor gecontroleerd dalen of op RTH om eerst terug te keren naar de H-mat.';
}

function applyModeLinks(){
  if(routeMode==='bridge') area='river';
  if(routeMode==='town') area='town';
  if(routeMode==='square' || routeMode==='crowd') area='square';
  if(routeMode==='slalom') area='river';
  $('area').value=area;
}

function setupWorld(){
  objs=[]; rings=[]; walkers=[]; cars=[]; signs=[]; crowd=[]; boats=[]; plane=null; noFlyCircle=null;
  // open practice space around the start area
  for(let i=0;i<10;i++) add('tree', rnd(-88,-62), rnd(-80,30), rnd(6,10), 3, 3);
  for(let i=0;i<10;i++) add('tree', rnd(62,88), rnd(-80,30), rnd(6,10), 3, 3);
  for(let i=0;i<12;i++) if(!['forest','town','slalom'].includes(routeMode)) add('house', rnd(-55,55), rnd(-78,18), rnd(5,9), rnd(7,11), rnd(7,10));
  add('road', 24, -6, 0.12, 8, 220);
  add('road', 0, -28, 0.12, 220, 7);
  signs.push({kind:'logo',x:-15,z:63,w:13,h:13});
  signs.push({kind:'pilot',x:16,z:63,w:10,h:12});

  switch(routeMode){
    case 'bridge': setupBridgeMission(); break;
    case 'mill': setupMillMission(); break;
    case 'church': setupChurchMission(); break;
    case 'forest': setupForestMission(); break;
    case 'town': setupTownMission(); break;
    case 'square': setupSquareMission(false); break;
    case 'crowd': setupSquareMission(true); break;
    case 'slalom': setupSlalomMission(); break;
    default: setupMixedMission(); break;
  }
  if(area==='industry'){ for(let i=0;i<6;i++) add('factory', -56+i*16, -56, 13, 13, 12); }
  if(area==='airport'){ plane={x:-85,y:27,z:-50}; }
}

function setupMixedMission(){
  if(routeVariant===0){
    add('church', -24, -27, 28, 13, 17);
    add('mill', 42, -30, 23, 12, 12);
    rings.push({x:0,z:34,y:8},{x:8,z:18,y:9},{x:-4,z:0,y:10},{x:-24,z:-10,y:12},{x:16,z:-28,y:8});
    signs.push({kind:'churchAerial',x:-46,z:-42,w:19,h:14},{kind:'millMain',x:54,z:-33,w:16,h:16});
  } else if(routeVariant===1){
    add('bridgeDeck', -18, -12, 5.8, 30, 6); add('bridgePillar', -30, -12, 4.8, 4, 5); add('bridgePillar', -6, -12, 4.8, 4, 5); add('water', -18, -11, 0.08, 24, 90);
    add('church', 32, -24, 26, 13, 17);
    rings.push({x:-4,z:34,y:7},{x:-18,z:8,y:4.8},{x:-8,z:-10,y:6.6},{x:12,z:-20,y:8},{x:32,z:-10,y:11});
    signs.push({kind:'bridgeSide2',x:-50,z:20,w:18,h:12},{kind:'churchDoes',x:48,z:-35,w:16,h:10}); boats.push({x:-18,z:-25,w:6,d:2.5,speed:.18});
  } else {
    add('mill', -36, -24, 23, 12, 12);
    for(let i=0;i<14;i++) add('tree', (i%2===0?-10:10)+rnd(-2,2), 26-i*6, rnd(6,10), 3, 3);
    add('rowhouse', 34, -20, 9, 9, 10); add('rowhouse', 34, -36, 8, 9, 10);
    rings.push({x:0,z:32,y:7},{x:0,z:10,y:8},{x:0,z:-10,y:9},{x:-18,z:-26,y:10},{x:20,z:-30,y:8});
    signs.push({kind:'forestB',x:50,z:16,w:17,h:12},{kind:'millSide',x:-54,z:-22,w:18,h:12});
  }
  walkers.push({x:18,z:-58,t:0},{x:18,z:-42,t:2},{x:18,z:-22,t:4});
  cars.push({x:25,z:-60,t:1},{x:25,z:-14,t:4});
}

function setupBridgeMission(){
  const cx = routeVariant===0?-33: routeVariant===1?-26:-40;
  add('water', cx, -4, 0.08, 30, 220);
  add('bridgeDeck', cx, -6, 6.2, 42, 6);
  add('bridgePillar', cx-18, -5, 5, 4.5, 5);
  add('bridgePillar', cx+18, -5, 5, 4.5, 5);
  add('mill', -77, -6, 22, 12, 12);
  signs.push({kind:'bridgeSide2',x:-61,z:29,w:23,h:12},{kind:'bridgeUnder',x:-57,z:-36,w:23,h:12},{kind:'millRiver',x:-77,z:23,w:14,h:13});
  if(routeVariant===0) rings.push({x:-8,z:30,y:8},{x:cx,z:10,y:7.5},{x:cx,z:-4,y:4.3},{x:cx-10,z:-22,y:5.5},{x:-20,z:-42,y:7});
  if(routeVariant===1) rings.push({x:-14,z:28,y:8},{x:cx+5,z:8,y:6.8},{x:cx,z:-6,y:4.5},{x:cx+12,z:-22,y:6},{x:4,z:-40,y:7.5});
  if(routeVariant===2) rings.push({x:-2,z:30,y:8},{x:cx-6,z:12,y:7.2},{x:cx,z:-4,y:4.2},{x:cx+9,z:-18,y:5.7},{x:-24,z:-40,y:8});
  walkers.push({x:18,z:-50,t:0},{x:18,z:-30,t:2});
  cars.push({x:25,z:-58,t:0},{x:25,z:-22,t:3});
  boats.push({x:cx,z:12,w:6,d:2.5,speed:.16+(routeVariant*.03)});
}

function setupMillMission(){
  const c={x:-25,z:-24};
  add('mill', c.x, c.z, 23, 12, 12);
  signs.push({kind:'millMain',x:-46,z:-18,w:14,h:19},{kind:'millSide',x:-3,z:-47,w:16,h:12},{kind:'millRiver',x:-50,z:-55,w:18,h:12});
  const r= routeVariant===0?18: routeVariant===1?22:16;
  rings.push({x:c.x+r,z:c.z,y:10},{x:c.x,z:c.z+r,y:11},{x:c.x-r,z:c.z,y:12},{x:c.x,z:c.z-r,y:11},{x:c.x+(r-4),z:c.z-(r-4),y:13});
  for(let i=0;i<16;i++) add('tree', rnd(-70,55), rnd(-84,18), rnd(5,9), 3, 3);
}

function setupChurchMission(){
  const c={x:-20,z:-25};
  add('church', c.x, c.z, 31, 16, 22);
  signs.push({kind:'churchAerial',x:-42,z:-40,w:19,h:13},{kind:'churchDoes',x:4,z:-46,w:16,h:11});
  const r=routeVariant===0?20:routeVariant===1?24:18;
  rings.push({x:c.x+r,z:c.z,y:14},{x:c.x,z:c.z+r,y:15},{x:c.x-r,z:c.z,y:16},{x:c.x,z:c.z-r,y:15},{x:c.x+r-5,z:c.z-r+5,y:13});
  walkers.push({x:18,z:-60,t:1},{x:18,z:-35,t:3},{x:18,z:-10,t:5});
}

function setupForestMission(){
  const gap=routeVariant===0?13: routeVariant===1?10:16;
  for(let i=0;i<26;i++){
    let row=i%2===0?-gap:gap;
    add('tree', row+rnd(-2,2), 28-i*5.6, rnd(6,10), 3, 3);
  }
  for(let i=0;i<16;i++) add('tree', rnd(-54,54), rnd(-72,18), rnd(5,9), 3, 3);
  signs.push({kind:'forestA',x:-53,z:0,w:18,h:12},{kind:'forestB',x:53,z:-20,w:18,h:12},{kind:'forestC',x:48,z:24,w:14,h:16});
  const off= routeVariant===1?3:0;
  rings.push({x:0+off,z:28,y:7},{x:0-off,z:12,y:8},{x:0+off,z:-4,y:9},{x:0-off,z:-20,y:8},{x:0+off,z:-36,y:7});
}

function setupTownMission(){
  const rows= routeVariant===2?3:2;
  for(let i=0;i<rows*4;i++) add('rowhouse', -34 + (i%4)*10, -5 - Math.floor(i/4)*18, rnd(7,10), 8, 8);
  for(let i=0;i<rows*4;i++) add('rowhouse', 34 - (i%4)*10, -5 - Math.floor(i/4)*18, rnd(7,10), 8, 8);
  add('arch', 0, -24, 8, 18, 2);
  signs.push({kind:'streetRow',x:-56,z:-28,w:14,h:18},{kind:'oldStreet2',x:54,z:-34,w:18,h:12});
  const xoff= routeVariant===1?5:routeVariant===2?-5:0;
  rings.push({x:xoff,z:30,y:7},{x:-xoff,z:12,y:7},{x:xoff,z:-6,y:7},{x:-xoff,z:-24,y:8},{x:xoff,z:-42,y:7});
  walkers.push({x:10,z:-34,t:0},{x:-12,z:-12,t:1},{x:11,z:6,t:3});
}

function setupSquareMission(withCrowd){
  add('square', 0, -12, 0.08, 48, 48);
  add('church', 36, -30, 26, 14, 16);
  add('rowhouse', -36, -30, 8, 10, 12);
  add('rowhouse', -36, 4, 8, 10, 12);
  add('booth', 0, -34, 4, 8, 5);
  signs.push({kind:'square2',x:-58,z:-2,w:16,h:20},{kind:'churchDoes',x:58,z:-18,w:18,h:10});
  if(routeVariant===0) rings.push({x:-18,z:10,y:8},{x:18,z:10,y:8},{x:18,z:-34,y:10},{x:-18,z:-34,y:10},{x:0,z:-12,y:12});
  if(routeVariant===1) rings.push({x:-20,z:6,y:8},{x:0,z:18,y:9},{x:20,z:-2,y:8},{x:10,z:-34,y:10},{x:-10,z:-34,y:10});
  if(routeVariant===2) rings.push({x:-12,z:14,y:8},{x:12,z:14,y:8},{x:20,z:-18,y:10},{x:-20,z:-18,y:10},{x:0,z:-8,y:12});
  if(withCrowd){
    noFlyCircle={x:0,z:-12,r:18};
    signs.push({kind:'crowdSquare',x:-58,z:-42,w:18,h:12},{kind:'pedestrians2',x:58,z:12,w:18,h:12});
    for(let i=0;i<16;i++) crowd.push({x:rnd(-12,12), z:rnd(-24,0), t:rnd(0,6), r:rnd(.2,.8)});
    msg('Veiligheidsmissie: houd ruime afstand tot niet-betrokken personen en vermijd de menigte.','bad');
  } else {
    walkers.push({x:-5,z:-20,t:0},{x:6,z:-9,t:2},{x:-10,z:0,t:4},{x:10,z:-36,t:5});
    signs.push({kind:'fair2',x:58,z:-42,w:16,h:16});
  }
}

function setupSlalomMission(){
  // combo of bridge -> forest corridor -> town gate
  add('water', -36, 18, 0.08, 26, 70);
  add('bridgeDeck', -36, 18, 5.8, 34, 6);
  add('bridgePillar', -50, 18, 4.8, 4, 5);
  add('bridgePillar', -22, 18, 4.8, 4, 5);
  boats.push({x:-36,z:4,w:6,d:2.5,speed:.17});
  for(let i=0;i<12;i++){ let row=i%2===0?-10:10; add('tree', row+rnd(-1.5,1.5), -2-i*5, rnd(6,10), 3, 3); }
  for(let i=0;i<8;i++){ add('rowhouse', -30 + (i%4)*8, -50 - Math.floor(i/4)*16, rnd(7,10), 7, 8); add('rowhouse', 30 - (i%4)*8, -50 - Math.floor(i/4)*16, rnd(7,10), 7, 8); }
  add('arch', 0, -58, 8, 16, 2);
  signs.push({kind:'bridgeUnder',x:-58,z:18,w:16,h:12},{kind:'forestA',x:58,z:-10,w:16,h:12},{kind:'streetRow',x:-58,z:-56,w:16,h:12});
  const sx=routeVariant===0?0:routeVariant===1?3:-3;
  rings.push({x:-12,z:34,y:8},{x:-36,z:18,y:4.4},{x:sx,z:-6,y:8},{x:-sx,z:-24,y:9},{x:0,z:-58,y:8});
}

function resetState(){
  rth=false; landingMode=false; missionSaved=false; drone={x:0,y:1.8,z:52}; yaw=Math.PI; camMode=0; lookYaw=0; lookPitch=0; paused=false; air=false; ended=false; progress=0; score=0; battery=100; speed=0;
  $('orbit').textContent='Camera: volgen'; $('fatal').hidden=true; lastDebrief='Klaar om te oefenen.';
}

function make(){
  routeMode=$('routeType').value; area=$('area').value; craftKey=$('drone').value; routeVariant=Math.floor(Math.random()*3);
  applyModeLinks(); resetState(); setupWorld(); setMissionUI(); updateCoachUI();
  if($('droneInfo')) $('droneInfo').textContent=craft[craftKey][0]+' · '+craft[craftKey][1];
  if($('target')) $('target').textContent='Punt 1 van 5';
  if($('score')) $('score').textContent='Score: 0 · 0/5 punten';
  if($('rule')) $('rule').textContent=
    area==='airport' ? 'OEFENCASUS: luchthavenzone zonder toestemming. Niet opstijgen.' :
    routeMode==='crowd' ? 'OEFENCASUS: boven of dicht bij een mensenmenigte vliegen is niet toegestaan. Houd grote afstand of land direct.' :
    craftKey==='mavic' ? 'OEFENCASUS A3: houd extra afstand tot woon-, handels-, industrie- en recreatiegebieden.' :
    'Fictieve trainingswereld. Controleer bij echte vluchten altijd de actuele geozones en plaatselijke regels.';
  if(routeMode!=='crowd') msg('Wereld gereed. Volg de controlepunten en land gecontroleerd op de H-mat.','good');
}

function showDebrief(title,info,advice=''){ air=false; ended=true; $('fatal').hidden=false; $('fatalTitle').textContent=title; $('fatalInfo').textContent=info; lastDebrief=info; updateCoachUI(advice||info); }
function fail(title,info,advice=''){ msg(title,'bad'); showDebrief(title,info,advice); }

function takeoff(){
  if(ended) return;
  if(area==='airport'){ msg('Niet opstijgen: de fictieve luchthavenzone is verboden zonder toestemming.','bad'); updateCoachUI('Goede keuze is: niet vliegen in deze casus zonder toestemming.'); return; }
  air=true; drone.y=Math.max(2,drone.y);
  msg(routeMode==='crowd'?'Opgestegen. Bekijk de menigte, houd afstand en land veilig.':'Opgestegen. Volg de groene controlepunten.','good');
  updateCoachUI(routeMode==='crowd'?'Veiligheidsdoel: herken onveilige situatie en breek de vlucht tijdig af.':'Vlieg rustig, gebruik kleine stuurcorrecties en kijk vooruit naar het volgende punt.');
}

function touchdown(){
  const dist=Math.hypot(drone.x, drone.z-52);
  air=false; landingMode=false; rth=false; drone.y=0;
  if(dist<=6.8 && progress===5){
    score+=100; if($('score')) $('score').textContent='Score: '+score+' · 5/5 punten';
    msg('Missie geslaagd!','good'); saveVictory();
    showDebrief('✓ Missie geslaagd!','Perfect geland op de H-mat. Alle controlepunten zijn gehaald.','Top gedaan. Je hield de route vast, kwam veilig terug en landde gecontroleerd.');
  } else if(dist<=6.8){
    msg('Veilig geland op de H-mat.','good');
    showDebrief('Veilig geland', progress===0 && routeMode==='crowd' ? 'Goed gezien: je bent veilig geland zonder door de menigte te vliegen.' : 'Je landde goed op de H, maar de missie is nog niet compleet.', 'Landing netjes. Let bij de volgende poging op het afmaken van alle controlepunten.');
  } else {
    fail('Buiten de landingsmat geland','Zoek de groene H-landingsmat en daal daar gecontroleerd.','Gebruik het groene home-baken, RTH of de 90°-camera om nauwkeuriger te landen.');
  }
}

function land(){
  if(!air || ended) return;
  landingMode=true; rth=false; camMode=3;
  msg('LANDEN actief: camera 90° omlaag en automatische langzame daling. Corrigeer met de pijltjestoetsen boven de H.','good');
  updateCoachUI('Hou de drone boven de H, stuur kleine correcties en laat de drone rustig zakken.');
}

function update(dt,t){
  walkers.forEach((v,i)=>{ v.x += Math.sin(t*.5+v.t+i)*.012; v.z += Math.cos(t*.35+v.t)*.02; });
  cars.forEach((v,i)=>{ v.z += Math.sin(t*.4+v.t+i)*.12; });
  crowd.forEach((v,i)=>{ v.x += Math.sin(t*.7+v.t+i)*.01; v.z += Math.cos(t*.6+v.t+i)*.01; });
  boats.forEach((b)=>{ b.z += Math.sin(t*b.speed)*.08; });
  if(plane){ plane.x += dt*8; if(plane.x>90) plane.x=-90; }
  if(paused || ended || !air) return;

  if(rth){
    const dx=-drone.x, dz=52-drone.z, d=Math.hypot(dx,dz);
    drone.y=Math.max(drone.y,8);
    if(d>.9){ drone.x += dx/d*Math.min(d,8*dt); drone.z += dz/d*Math.min(d,8*dt); }
    else { rth=false; landingMode=true; camMode=3; msg('RTH voltooid. De landingscamera is actief en de daling is gestart.','good'); updateCoachUI('Je bent terug boven home. Laat de drone nu rustig op de H zakken.'); }
  }
  if(landingMode && !rth){ drone.y=Math.max(0, drone.y-dt*1.45); if(drone.y<=.55){ touchdown(); return; } }

  const f=Number(key.has('ArrowUp'))-Number(key.has('ArrowDown'));
  const s=Number(key.has('ArrowRight'))-Number(key.has('ArrowLeft'));
  const v=Number(key.has('w'))-Number(key.has('s'));
  const r=Number(key.has('a'))-Number(key.has('d'));
  yaw += r*dt*1.18;
  const vx=(Math.sin(yaw)*f + Math.cos(yaw)*s)*11;
  const vz=(Math.cos(yaw)*f - Math.sin(yaw)*s)*11;
  drone.x += vx*dt; drone.z += vz*dt;
  if(!landingMode) drone.y=clamp(drone.y+v*7*dt,0,120); else drone.y=clamp(drone.y+v*1.4*dt,0,120);
  speed=Math.hypot(vx,vz,v*7);
  battery=Math.max(0,battery-dt*(.07+speed*.012));
  if(battery===0){ fail('Accu leeg','Keer eerder terug naar de landingsplaats.','Kijk eerder op je accu en activeer RTH op tijd.'); return; }

  const padDist=Math.hypot(drone.x, drone.z-52);
  if((landingMode || progress===5 || routeMode==='crowd') && drone.y<.7 && padDist<=6.8){ touchdown(); return; }
  if(!landingMode && drone.y<.32){ fail('Botsing met de grond','Je daalde te ver zonder gecontroleerde landing. Gebruik LANDEN of RTH voor een nette landing.','Activeer de landingsmodus vlak boven home en stuur daarna kleine correcties.'); return; }
  if(Math.abs(drone.x)>108 || Math.abs(drone.z)>108){ fail('Buiten oefengebied','Blijf binnen het afgesproken vluchtgebied.','Kijk vooruit en gebruik de vrije camera als je je oriëntatie verliest.'); return; }

  for(const o of objs){
    if(['road','water','square'].includes(o.type)) continue;
    let hit=false;
    if(o.type==='tree'){ hit=Math.hypot(drone.x-o.x,drone.z-o.z)<2.5 && drone.y<o.h+2; }
    else if(o.type==='bridgeDeck'){ hit=Math.abs(drone.x-o.x)<o.w/2 && Math.abs(drone.z-o.z)<o.d/2 && drone.y>o.h-0.4 && drone.y<o.h+1.4; }
    else if(o.type==='bridgePillar'){ hit=Math.abs(drone.x-o.x)<o.w/2+.5 && Math.abs(drone.z-o.z)<o.d/2+.5 && drone.y<o.h+.7; }
    else if(o.type==='arch'){ hit=Math.abs(drone.x-o.x)<o.w/2+.5 && Math.abs(drone.z-o.z)<1.6 && (Math.abs(drone.x-o.x) > o.w/2-3 || drone.y>o.h-1); }
    else { hit=Math.abs(drone.x-o.x)<o.w/2+.8 && Math.abs(drone.z-o.z)<o.d/2+.8 && drone.y<o.h+.7; }
    if(hit){ fail('Botsing!', o.type==='tree'?'Je raakte een boom of tak.': o.type.startsWith('bridge')?'Je raakte de brugconstructie.':'Je raakte een gebouw of obstakel.', 'Verlaag je snelheid en neem een ruimere bocht om het obstakel.'); return; }
  }
  for(const b of boats){ if(Math.abs(drone.x-b.x)<b.w/2+1 && Math.abs(drone.z-b.z)<b.d/2+1 && drone.y<4){ fail('Te laag boven waterverkeer','Je kwam gevaarlijk dicht bij een object op het water.','Houd boven water extra overzicht en reserveer meer ruimte.'); return; } }
  for(const v of walkers){ if(Math.hypot(drone.x-v.x, drone.z-v.z)<1.8 && drone.y<3){ fail('Onveilig bij persoon','Vermijd niet-betrokken personen.','Houd altijd ruime horizontale én verticale afstand tot mensen.'); return; } }
  for(const c of cars){ if(Math.hypot(drone.x-c.x, drone.z-c.z)<3 && drone.y<3){ fail('Botsing met verkeer','Houd afstand tot verkeer.','Vlieg niet laag boven wegen of voertuigen.'); return; } }
  for(const c of crowd){ if(Math.hypot(drone.x-c.x,drone.z-c.z)<2.4 && drone.y<5){ fail('Boven mensenmenigte','Deze veiligheidsmissie laat juist zien dat je niet dicht boven mensen mag vliegen.','Bij een mensenmenigte is de veilige keuze: afstand houden of direct teruggaan.'); return; } }
  if(noFlyCircle && Math.hypot(drone.x-noFlyCircle.x, drone.z-noFlyCircle.z)<noFlyCircle.r && drone.y<12){ msg('Waarschuwing: je vliegt te dicht bij een mensenmenigte. Houd afstand en land veilig.','bad'); }
  if(plane && Math.hypot(drone.x-plane.x,drone.z-plane.z)<25){ fail('Bemand luchtverkeer','Geef bemande luchtvaart altijd voorrang.','Verlaat de zone en land zo snel mogelijk veilig.'); return; }

  const q=rings[progress];
  if(q && Math.hypot(drone.x-q.x,drone.z-q.z,drone.y-q.y)<4){
    progress++; score+=50;
    if($('score')) $('score').textContent='Score: '+score+' · '+progress+'/5 punten';
    if($('target')) $('target').textContent=progress<5?'Punt '+(progress+1)+' van 5':'Keer terug naar H';
    msg(progress===5?'Alle ringen gehaald. Keer terug naar de startmat en druk op LANDEN of RTH!':'Controlepunt '+progress+' gehaald!','good');
    updateCoachUI(progress===5?'Mooi. Nu gecontroleerd terug naar home en netjes landen.':'Goed. Kijk meteen door naar het volgende punt en houd je snelheid rustig.');
  }
}

let CW=1000, CH=640;
let cam={x:0,y:8,z:68,angle:Math.PI,pitch:-.15};
function project(x,y,z){
  const dx=x-cam.x, dz=z-cam.z, dy=y-cam.y, cs=Math.cos(cam.angle), sn=Math.sin(cam.angle);
  const side=dx*cs-dz*sn, forward=dx*sn+dz*cs, cp=Math.cos(cam.pitch), sp=Math.sin(cam.pitch);
  const fy=dy*cp-forward*sp, depth=dy*sp+forward*cp;
  if(depth<.35) return null;
  const focal=Math.min(CW*1.02,CH*1.35);
  return {x:CW/2+side*focal/depth, y:CH*.53-fy*focal/depth, d:depth, k:focal/depth};
}
function polygon(verts,fill,stroke){ const p=verts.map(v=>project(...v)); if(p.some(v=>!v)) return; g.beginPath(); p.forEach((v,i)=>i?g.lineTo(v.x,v.y):g.moveTo(v.x,v.y)); g.closePath(); g.fillStyle=fill; g.fill(); if(stroke){ g.strokeStyle=stroke; g.lineWidth=1; g.stroke(); } }
function cube(x,y,z,w,h,d,col){ const X=x-w/2,Z=z-d/2,verts=[[X,y,Z],[X+w,y,Z],[X+w,y,Z+d],[X,y,Z+d],[X,y+h,Z],[X+w,y+h,Z],[X+w,y+h,Z+d],[X,y+h,Z+d]]; polygon([verts[0],verts[1],verts[5],verts[4]],col[0]); polygon([verts[1],verts[2],verts[6],verts[5]],col[1]); polygon([verts[2],verts[3],verts[7],verts[6]],col[0]); polygon([verts[3],verts[0],verts[4],verts[7]],col[1]); polygon([verts[4],verts[5],verts[6],verts[7]],col[2]); }
function line3(a,b,color,width=2){ const p=project(...a),q=project(...b); if(!p||!q) return; g.strokeStyle=color; g.lineWidth=width; g.beginPath(); g.moveTo(p.x,p.y); g.lineTo(q.x,q.y); g.stroke(); }
function disk(x,y,z,r,col){ const p=project(x,y,z); if(!p) return; g.beginPath(); g.ellipse(p.x,p.y,Math.max(.4,p.k*r),Math.max(.4,p.k*r*.72),0,0,Math.PI*2); g.fillStyle=col; g.fill(); }
function drawBillboard(img,x,y,z,w,h,alpha=1){ if(!img || !img.complete) return; const p=project(x,y+h/2,z); if(!p) return; const ww=Math.max(10,p.k*w), hh=Math.max(10,p.k*h); g.save(); g.globalAlpha=alpha; g.drawImage(img,p.x-ww/2,p.y-hh/2,ww,hh); g.restore(); }

function drawObject(o){
  if(o.type==='tree'){
    cube(o.x,0,o.z,.8,o.h*.64,.8,['#68462e','#5a3c28','#886042']);
    for(let j=0;j<7;j++) disk(o.x+Math.sin(j*2.1)*1.55,o.h+(j%3)*.8,o.z+Math.cos(j*2.1)*1.55,2.1,'#255c31');
  } else if(o.type==='church'){
    cube(o.x,0,o.z,o.w,o.h,o.d,['#a89a84','#857865','#d0c0a4']);
    cube(o.x,o.h,o.z,Math.max(2,o.w*.42),11,Math.max(2,o.d*.42),['#66616a','#55525a','#80777f']); for(let n=-2;n<=2;n++){cube(o.x+n*2.1,8,o.z+o.d/2+.07,.9,3,.15,['#314654','#22343e','#64869b']);} line3([o.x-o.w/2,o.h,o.z-o.d/2],[o.x,o.h+4,o.z-o.d/2],'#45444d',2); line3([o.x,o.h+4,o.z-o.d/2],[o.x+o.w/2,o.h,o.z-o.d/2],'#45444d',2);
  } else if(o.type==='mill'){
    cube(o.x,0,o.z,o.w,o.h,o.d,['#324c63','#22384b','#59748b']);
    cube(o.x,o.h,o.z,Math.max(2,o.w*.40),7,Math.max(2,o.d*.40),['#6c695e','#59574d','#8e8a78']);
    let spin=performance.now()*.00025; for(let i=0;i<4;i++){let a=spin+i*Math.PI/2;line3([o.x,o.h+4,o.z],[o.x+Math.cos(a)*12,o.h+4+Math.sin(a)*12,o.z],'#f4ede0',3);} 
  } else if(o.type==='bridgeDeck'){
    cube(o.x,o.h,o.z,o.w,1.1,o.d,['#8f959b','#757b82','#b7bdc2']);
    line3([o.x-o.w/2,o.h+3,o.z],[o.x,o.h+12,o.z],'#e2e5e7',3);line3([o.x,o.h+12,o.z],[o.x+o.w/2,o.h+3,o.z],'#e2e5e7',3);for(let i=-18;i<=18;i+=6){ line3([o.x+i,o.h+1.2,o.z-o.d/2],[o.x+i,o.h+9,o.z],'#d7dbdd',1.5); line3([o.x+i,o.h+1.2,o.z+o.d/2],[o.x+i,o.h+9,o.z],'#d7dbdd',1.5); }
  } else if(o.type==='bridgePillar'){
    cube(o.x,0,o.z,o.w,o.h,o.d,['#948a7d','#7c7368','#b1a798']);
  } else if(o.type==='factory'){
    cube(o.x,0,o.z,o.w,o.h,o.d,['#8b9ca7','#798b95','#bac7c8']);
  } else if(o.type==='rowhouse'){
    cube(o.x,0,o.z,o.w,o.h,o.d,['#b77c61','#96644c','#d5b18a']);
  } else if(o.type==='house'){
    cube(o.x,0,o.z,o.w,o.h,o.d,['#ba8166','#9b654c','#d7b08d']);
  } else if(o.type==='booth'){
    cube(o.x,0,o.z,o.w,o.h,o.d,['#b22222','#8f1a1a','#de5757']); cube(o.x,o.h,o.z,o.w+1,.8,o.d+1,['#fff2a4','#d9cd80','#fff7cb']);
  } else if(o.type==='arch'){
    cube(o.x,0,o.z,o.w,.6,o.d,['#b4b6b9','#96989b','#d0d3d5']);
    cube(o.x-o.w/2+1,0,o.z,2,o.h,2,['#a2a3a5','#818285','#bfc1c4']);
    cube(o.x+o.w/2-1,0,o.z,2,o.h,2,['#a2a3a5','#818285','#bfc1c4']);
  }
}

function draw(){
  const rect=canvas.getBoundingClientRect();
  const w=Math.max(320,Math.round(rect.width*Math.min(devicePixelRatio||1,1.6))), h=Math.max(220,Math.round(rect.height*Math.min(devicePixelRatio||1,1.6)));
  if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
  CW=w; CH=h;
  if(camMode===3){ cam.angle=0; cam.pitch=-Math.PI/2+.001; cam.x=drone.x; cam.z=drone.z; cam.y=drone.y+23; }
  else if(camMode===0){ cam.angle=yaw; cam.pitch=-.16+lookPitch; cam.x=drone.x-Math.sin(yaw)*12; cam.z=drone.z-Math.cos(yaw)*12; cam.y=drone.y+6; }
  else if(camMode===1){ cam.angle=yaw+lookYaw; cam.pitch=lookPitch; cam.x=drone.x; cam.z=drone.z; cam.y=drone.y+.15; }
  else { cam.angle=yaw+lookYaw; cam.pitch=clamp(-.18+lookPitch,-1.45,.85); cam.x=drone.x-Math.sin(cam.angle)*16; cam.z=drone.z-Math.cos(cam.angle)*16; cam.y=drone.y+8; }

  const sky=g.createLinearGradient(0,0,0,CH); sky.addColorStop(0,'#74b8e5'); sky.addColorStop(.52,'#d5e4ec'); sky.addColorStop(.53, routeMode==='square'||routeMode==='crowd' ? '#a9a493' : '#7da06d'); sky.addColorStop(1, routeMode==='square'||routeMode==='crowd' ? '#7b7468' : '#416b42'); g.fillStyle=sky; g.fillRect(0,0,CW,CH);
  polygon([[-112,0,-112],[112,0,-112],[112,0,112],[-112,0,112]], routeMode==='square'||routeMode==='crowd' ? '#aaa899' : '#739f63');
  for(const o of objs){ if(o.type==='water') cube(o.x,.03,o.z,o.w,.08,o.d,['#3f86ad','#37789a','#66a8cb']); if(o.type==='road') cube(o.x,.06,o.z,o.w,.09,o.d,['#575f64','#4b5257','#717b80']); if(o.type==='square') cube(o.x,.06,o.z,o.w,.09,o.d,['#c2c0bc','#a6a39c','#d9d7d2']); }

  const renderables=[];
  for(const o of objs){ if(['water','road','square'].includes(o.type)) continue; renderables.push({x:o.x,z:o.z,draw:()=>drawObject(o)}); }
  signs.forEach(s=>renderables.push({x:s.x,z:s.z,draw:()=>drawBillboard(pics[s.kind],s.x,0,s.z,s.w,s.h,.96)}));
  walkers.forEach((v,i)=>renderables.push({x:v.x,z:v.z,draw:()=>{ cube(v.x,0,v.z,.55,1.7,.55,['#1769a0','#12557d','#288ac0']); disk(v.x,2,v.z,.33,['#efcca8','#e3b78b','#d9ae88'][i%3]); let walk=Math.sin(performance.now()*.004+i)*.25;line3([v.x,.6,v.z],[v.x+walk,0,v.z+.2],'#263846',2);line3([v.x,.6,v.z],[v.x-walk,0,v.z-.2],'#263846',2); }}));
  crowd.forEach((v,i)=>renderables.push({x:v.x,z:v.z,draw:()=>{ cube(v.x,0,v.z,.6,1.7,.6,['#7c6db0','#5f5491','#9c8dca']); disk(v.x,2,v.z,.33,['#e6c5a1','#dba679','#f1d0b0'][i%3]); }}));
  cars.forEach(v=>renderables.push({x:v.x,z:v.z,draw:()=>cube(v.x,0,v.z,4,1.4,2.2,['#d1ae49','#ae8e34','#eed882'])}));
  boats.forEach(v=>renderables.push({x:v.x,z:v.z,draw:()=>cube(v.x,0,v.z,v.w,1.1,v.d,['#f7f7f7','#d9d9d9','#ffffff'])}));
  rings.forEach((v,i)=>renderables.push({x:v.x,z:v.z,draw:()=>{const p=project(v.x,v.y,v.z); if(!p) return; g.beginPath(); g.ellipse(p.x,p.y,3*p.k,3*p.k,0,0,Math.PI*2); g.strokeStyle=i<progress?'#7b9384':i===progress?'#95ff65':'#49d2cc'; g.lineWidth=clamp(.22*p.k,2,8); g.stroke(); g.fillStyle='#eaffeb'; g.font='bold '+clamp(p.k*1.2,11,26)+'px system-ui'; g.textAlign='center'; g.fillText(String(i+1),p.x,p.y+5); }}));
  if(plane) renderables.push({x:plane.x,z:plane.z,draw:()=>cube(plane.x,plane.y,plane.z,7,1.3,8,['#f1f3f5','#b6c3c8','#ffffff'])});
  renderables.sort((a,b)=>Math.hypot(b.x-cam.x,b.z-cam.z)-Math.hypot(a.x-cam.x,a.z-cam.z)).forEach(r=>r.draw());

  if(noFlyCircle){ const p=project(noFlyCircle.x,.08,noFlyCircle.z); if(p){ g.save(); g.strokeStyle='#ff6b6bcc'; g.lineWidth=3; g.beginPath(); g.ellipse(p.x,p.y,Math.max(30,p.k*noFlyCircle.r),Math.max(14,p.k*noFlyCircle.r*.65),0,0,Math.PI*2); g.stroke(); g.restore(); } }

  // landing pad + beacon
  cube(0,.05,52,11,.15,11,['#238c82','#196d6b','#36bda5']);
  for(let k=-5;k<=5;k+=2){ line3([k,.2,46.5],[k,.2,57.5],'#e2ffec',1); line3([-5.5,.2,52+k],[5.5,.2,52+k],'#e2ffec',1); }
  [[-4.2,47.8],[4.2,47.8],[-4.2,56.2],[4.2,56.2]].forEach(([x,z])=>disk(x,.25,z,.35,'#9cffb1'));
  line3([0,.2,52],[0,11.5,52],'#9cffb1',2);
  disk(0,11.8,52,.55,'#eaffef');
  const hp=project(0,.35,52); if(hp){ g.fillStyle='#fff'; g.font='bold '+clamp(hp.k*3,13,44)+'px system-ui'; g.fillText('H',hp.x,hp.y); }

  if(camMode!==1){ const p=project(drone.x,drone.y,drone.z); if(p){ if(pics.drone.complete) drawBillboard(pics.drone,drone.x,drone.y,drone.z,2.6,1.9,1); else { let size=clamp(1.8*p.k,18,80); g.save(); g.translate(p.x,p.y); g.strokeStyle='#172c34'; g.lineWidth=Math.max(3,size*.13); g.beginPath(); g.moveTo(-size,0); g.lineTo(size,0); g.moveTo(-size*.65,-size*.45); g.lineTo(size*.65,size*.45); g.moveTo(-size*.65,size*.45); g.lineTo(size*.65,-size*.45); g.stroke(); g.restore(); } } }

  const next=rings[progress]||{x:0,z:52,y:3};
  const d=Math.hypot(drone.x-next.x,drone.z-next.z), hd=Math.hypot(drone.x,drone.z-52);
  g.textAlign='center'; g.fillStyle='#05263bdc'; g.fillRect(CW/2-230,CH-90,460,44); g.fillStyle='white'; g.font='bold 16px system-ui';
  g.fillText(progress<5?('PUNT '+(progress+1)+' · '+Math.round(d)+' m · doel '+Math.round(next.y)+' m') : ('TERUG NAAR START · '+Math.round(hd)+' m van H'), CW/2, CH-61);
  if($('alt')) $('alt').textContent='Hoogte '+drone.y.toFixed(1)+' m';
  if($('bat')) $('bat').textContent='Accu '+Math.floor(battery)+'%';
  if($('spd')) $('spd').textContent='Snelheid '+speed.toFixed(1)+' m/s';
}

function loop(t){ const dt=Math.min(.05,(t-last)/1000); last=t; update(dt,t/1000); draw(); requestAnimationFrame(loop); }

$('reset').onclick=$('tryAgain').onclick=make; $('clearBoard').onclick=()=>{if(confirm('Alle lokale klassementscores wissen?')){localStorage.removeItem(BOARD);renderBoard();}};renderBoard();
$('drone').onchange=make; $('area').onchange=make; $('routeType').onchange=make;
$('takeoff').onclick=takeoff; $('land').onclick=land;
$('landingView').onclick=()=>{ camMode=3; msg('Camera: recht naar beneden. Zoek de grote H-landingsmat.','good'); updateCoachUI('Gebruik de 90°-camera om exact boven de H te hangen.'); };
$('pause').onclick=()=>{ paused=!paused; msg(paused?'Pauze':'Vlucht hervat'); };
$('home').onclick=()=>{ if(air&&!ended){ rth=true; landingMode=false; msg('RTH actief: de drone vliegt automatisch terug naar de H-mat.','good'); updateCoachUI('RTH brengt je terug naar home. Daarna kun je gecontroleerd landen.'); } };
$('orbit').onclick=()=>{ camMode=(camMode+1)%3; $('orbit').textContent=['Camera: volgen','Camera: FPV','Camera: vrij'][camMode]; };
$('lookleft').onclick=()=>{ camMode=2; lookYaw+=.23; };
$('lookright').onclick=()=>{ camMode=2; lookYaw-=.23; };
$('pitchup').onclick=()=>{ camMode=2; lookPitch=clamp(lookPitch+.13,-1.3,.9); };
$('pitchdown').onclick=()=>{ camMode=2; lookPitch=clamp(lookPitch-.13,-1.3,.9); };

window.addEventListener('keydown',e=>{
  if(['w','s','a','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){ key.add(e.key); e.preventDefault(); }
  if(e.key==='4') camMode=3;
  if(e.key.toLowerCase()==='h'&&air) rth=true;
  if(['1','2','3'].includes(e.key)){ camMode=Number(e.key)-1; $('orbit').textContent=['Camera: volgen','Camera: FPV','Camera: vrij'][camMode]; }
});
window.addEventListener('keyup',e=>key.delete(e.key)); window.addEventListener('blur',()=>key.clear());

document.querySelectorAll('[data-key]').forEach(b=>{ const k=b.dataset.key; b.addEventListener('pointerdown',e=>{ e.preventDefault(); b.setPointerCapture(e.pointerId); key.add(k); b.classList.add('pressed'); }); ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,()=>{ key.delete(k); b.classList.remove('pressed'); })); });

let drag=null;
canvas.addEventListener('pointerdown',e=>{ drag={x:e.clientX,y:e.clientY}; canvas.setPointerCapture(e.pointerId); camMode=2; });
canvas.addEventListener('pointermove',e=>{ if(!drag) return; lookYaw+=(e.clientX-drag.x)*.006; lookPitch=clamp(lookPitch+(e.clientY-drag.y)*.004,-1.3,.9); drag={x:e.clientX,y:e.clientY}; });
canvas.addEventListener('pointerup',()=>drag=null); canvas.addEventListener('pointercancel',()=>drag=null);

try{ make(); $('load').remove(); requestAnimationFrame(loop); } catch(err){ $('load').textContent='Startfout: '+err.message; console.error(err); }
})();
