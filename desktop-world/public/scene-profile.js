// Runtime scene geometry. Source points stay in original PNG coordinates.
// Art is cropped once; all rendering, interaction and save migration share this map.
const SOURCE = {
  "id": "island-pond-long-v1",
  "version": 2,
  "sourceRect": [
    17,
    101,
    2065,
    586
  ],
  "worldRect": {
    "x": 20,
    "y": 85,
    "width": 600,
    "height": 170.26634382566587
  },
  "viewBounds": {
    "x": 0,
    "y": 0,
    "width": 640,
    "height": 280
  },
  "land": [
    [
      41,
      452
    ],
    [
      62,
      407
    ],
    [
      92,
      378
    ],
    [
      127,
      353
    ],
    [
      177,
      337
    ],
    [
      233,
      337
    ],
    [
      287,
      351
    ],
    [
      333,
      349
    ],
    [
      372,
      339
    ],
    [
      419,
      329
    ],
    [
      469,
      325
    ],
    [
      528,
      327
    ],
    [
      574,
      329
    ],
    [
      630,
      340
    ],
    [
      690,
      334
    ],
    [
      752,
      330
    ],
    [
      804,
      335
    ],
    [
      867,
      333
    ],
    [
      928,
      339
    ],
    [
      990,
      331
    ],
    [
      1047,
      328
    ],
    [
      1105,
      331
    ],
    [
      1164,
      331
    ],
    [
      1220,
      336
    ],
    [
      1283,
      328
    ],
    [
      1336,
      339
    ],
    [
      1400,
      341
    ],
    [
      1457,
      348
    ],
    [
      1519,
      339
    ],
    [
      1572,
      325
    ],
    [
      1625,
      330
    ],
    [
      1672,
      338
    ],
    [
      1718,
      339
    ],
    [
      1773,
      363
    ],
    [
      1834,
      375
    ],
    [
      1893,
      387
    ],
    [
      1946,
      404
    ],
    [
      2000,
      425
    ],
    [
      2031,
      444
    ],
    [
      2064,
      465
    ],
    [
      2063,
      492
    ],
    [
      2033,
      509
    ],
    [
      1989,
      523
    ],
    [
      1941,
      538
    ],
    [
      1877,
      556
    ],
    [
      1807,
      563
    ],
    [
      1740,
      567
    ],
    [
      1673,
      563
    ],
    [
      1605,
      568
    ],
    [
      1542,
      568
    ],
    [
      1473,
      565
    ],
    [
      1402,
      569
    ],
    [
      1337,
      571
    ],
    [
      1271,
      572
    ],
    [
      1203,
      568
    ],
    [
      1132,
      568
    ],
    [
      1067,
      568
    ],
    [
      1002,
      568
    ],
    [
      936,
      568
    ],
    [
      869,
      568
    ],
    [
      803,
      565
    ],
    [
      736,
      565
    ],
    [
      669,
      571
    ],
    [
      599,
      571
    ],
    [
      532,
      571
    ],
    [
      463,
      575
    ],
    [
      397,
      573
    ],
    [
      330,
      569
    ],
    [
      264,
      563
    ],
    [
      209,
      564
    ],
    [
      162,
      557
    ],
    [
      121,
      544
    ],
    [
      97,
      516
    ],
    [
      58,
      498
    ]
  ],
  "pond": [
    [
      143,
      406
    ],
    [
      170,
      404
    ],
    [
      192,
      417
    ],
    [
      214,
      409
    ],
    [
      234,
      412
    ],
    [
      258,
      420
    ],
    [
      288,
      421
    ],
    [
      308,
      428
    ],
    [
      330,
      431
    ],
    [
      346,
      436
    ],
    [
      370,
      435
    ],
    [
      389,
      444
    ],
    [
      406,
      454
    ],
    [
      422,
      456
    ],
    [
      428,
      465
    ],
    [
      422,
      478
    ],
    [
      413,
      489
    ],
    [
      387,
      491
    ],
    [
      389,
      502
    ],
    [
      365,
      502
    ],
    [
      360,
      514
    ],
    [
      334,
      519
    ],
    [
      306,
      522
    ],
    [
      287,
      523
    ],
    [
      265,
      518
    ],
    [
      248,
      514
    ],
    [
      227,
      513
    ],
    [
      218,
      493
    ],
    [
      195,
      495
    ],
    [
      180,
      488
    ],
    [
      171,
      485
    ],
    [
      163,
      474
    ],
    [
      154,
      466
    ],
    [
      130,
      461
    ],
    [
      134,
      453
    ],
    [
      143,
      441
    ],
    [
      146,
      426
    ]
  ],
  "path": [
    [
      402,
      324
    ],
    [
      378,
      351
    ],
    [
      460,
      391
    ],
    [
      514,
      426
    ],
    [
      615,
      443
    ],
    [
      701,
      466
    ],
    [
      795,
      469
    ]
  ],
  "pathHalfWidth": 27,
  "obstacles": [
    {
      "id": "baked-cherry",
      "center": [
        281,
        348
      ],
      "suggestedCollisionEllipse": {
        "radiusX": 31,
        "radiusY": 17
      },
      "meaning": "樱花树树干触地位置；树冠属于图片烘焙内容，不能独立做前后遮挡。"
    },
    {
      "id": "back-right-rock",
      "center": [
        1889,
        359
      ],
      "suggestedCollisionEllipse": {
        "radiusX": 55,
        "radiusY": 26
      }
    },
    {
      "id": "front-right-rock",
      "center": [
        1834,
        543
      ],
      "suggestedCollisionEllipse": {
        "radiusX": 54,
        "radiusY": 25
      }
    }
  ],
  "bakedLilies": [
    {
      "center": [
        224,
        454
      ],
      "suggestedRadius": 31
    },
    {
      "center": [
        284,
        482
      ],
      "suggestedRadius": 34
    }
  ],
  "spawns": {
    "animal.cat": [
      1060,
      456
    ],
    "animal.dog": [
      1424,
      476
    ],
    "animal.bird": [
      1209,
      380
    ],
    "animal.squirrel": [
      328,
      368
    ],
    "animal.rabbit": [
      1752,
      435
    ],
    "animal.duck": [
      354,
      476
    ],
    "plant.default": [
      963,
      438
    ],
    "plant.demo": [
      1209,
      474
    ],
    "plant.waterlily.new": [
      346,
      454
    ],
    "food.default": [
      1368,
      440
    ],
    "prop.focus-bench": [
      973,
      372
    ],
    "prop.windmill": [
      1506,
      368
    ],
    "prop.compost": [
      1675,
      488
    ]
  },
  "initialPlants": [
    [
      890,
      422
    ],
    [
      950,
      450
    ],
    [
      1025,
      406
    ],
    [
      1090,
      485
    ],
    [
      1140,
      440
    ],
    [
      1270,
      435
    ],
    [
      1340,
      400
    ],
    [
      1400,
      490
    ],
    [
      1460,
      446
    ],
    [
      1530,
      445
    ],
    [
      1610,
      430
    ],
    [
      1670,
      495
    ],
    [
      1150,
      530
    ],
    [
      1330,
      530
    ],
    [
      1000,
      530
    ],
    [
      850,
      515
    ],
    [
      1770,
      480
    ],
    [
      1790,
      400
    ]
  ],
  "decor": [
    {
      "id": "decor.pine",
      "foot": [
        1565,
        350
      ],
      "width": 44,
      "height": 62.45,
      "phase": 2
    },
    {
      "id": "decor.apple",
      "foot": [
        1900,
        470
      ],
      "width": 44,
      "height": 53.57,
      "phase": 0
    }
  ]
};
const scale = SOURCE.worldRect.width / SOURCE.sourceRect[2];
export const sourcePoint = ([x,y]) => ({x:SOURCE.worldRect.x+(x-SOURCE.sourceRect[0])*scale,y:SOURCE.worldRect.y+(y-SOURCE.sourceRect[1])*scale});
const polygon = points => points.map(p=>{const {x,y}=sourcePoint(p);return [x,y];});
const obstacles = SOURCE.obstacles.map(o=>({...sourcePoint(o.center),radiusX:o.suggestedCollisionEllipse.radiusX*scale,radiusY:o.suggestedCollisionEllipse.radiusY*scale}));
const spawns = Object.fromEntries(Object.entries(SOURCE.spawns).map(([id,p])=>[id,sourcePoint(p)]));
export const LONG_ISLAND_SCENE = Object.freeze({
  id:SOURCE.id,version:SOURCE.version,sourceRect:SOURCE.sourceRect,worldRect:SOURCE.worldRect,viewBounds:SOURCE.viewBounds,
  land:polygon(SOURCE.land),pond:polygon(SOURCE.pond),rainGround:polygon(SOURCE.land),path:polygon(SOURCE.path),pathHalfWidth:SOURCE.pathHalfWidth*scale,obstacles,
  bakedLilies:SOURCE.bakedLilies.map(o=>({...sourcePoint(o.center),radiusX:o.suggestedRadius*scale,radiusY:o.suggestedRadius*scale*.58})),
  spawns,props:{compost:spawns['prop.compost'],windmill:spawns['prop.windmill'],focus:spawns['prop.focus-bench']},
  initialPlants:SOURCE.initialPlants.map(sourcePoint),
  decor:SOURCE.decor.map(d=>({...d,...sourcePoint(d.foot)})),
  ambient:{x:320,y:177,radiusX:260,radiusY:34},
  meadowBounds:{x:165,y:153,width:420,height:68},
  keyboardRain:spawns['plant.default'],
  sun:{x:505,y:42},idleCloud:{x:325,y:44,w:.8},
  canopy:{x:48,y:85,width:100,height:70,anchorX:100,anchorY:157},
  interactionTrees:[
    {id:'cherry',...sourcePoint([280,340]),w:100,h:70},
    ...SOURCE.decor.map(d=>({id:d.id==='decor.pine'?'pine':'apple',...sourcePoint(d.foot),w:d.width,h:d.height})),
  ],
  shelter:[sourcePoint([440,360]),sourcePoint([1520,400])],
});

// Retain the former round profile for save migration and regression coverage.
const roundLand=[[107,173],[151,149],[207,135],[259,140],[303,132],[352,143],[400,148],[449,166],[501,190],[548,225],[566,267],[524,297],[461,317],[403,336],[329,347],[257,335],[194,318],[135,289],[91,256],[81,214]];
const roundPond=Array.from({length:40},(_,i)=>{const angle=i*Math.PI/20;return[191+Math.cos(angle)*76,253+Math.sin(angle)*43];});
const point=([x,y])=>({x,y});
const roundSpawns=Object.fromEntries(Object.entries({
  'animal.cat':[378,259],'animal.dog':[345,306],'animal.bird':[400,246],
  'animal.squirrel':[252,167],'animal.rabbit':[287,237],'animal.duck':[191,257],
  'plant.default':[350,260],'plant.demo':[346,260],'plant.waterlily.new':[191,253],
  'food.default':[364,278],'prop.compost':[382,303],'prop.windmill':[420,198],'prop.focus-bench':[342,184],
}).map(([id,p])=>[id,point(p)]));
export const ROUND_ISLAND_SCENE=Object.freeze({
  id:'island-pond-round-v1',version:2,sourceRect:[14,629,609,562],
  worldRect:{x:60,y:14,width:520,height:370},viewBounds:{x:0,y:0,width:640,height:400},
  land:roundLand,pond:roundPond,rainGround:roundLand,
  path:[[274,145],[264,167],[299,186],[315,207],[340,214]],pathHalfWidth:10,
  obstacles:[{x:220,y:142,radiusX:15,radiusY:12}],
  bakedLilies:[{x:171,y:246,radiusX:12,radiusY:7},{x:213,y:261,radiusX:12,radiusY:7}],
  spawns:roundSpawns,props:{compost:roundSpawns['prop.compost'],windmill:roundSpawns['prop.windmill'],focus:roundSpawns['prop.focus-bench']},
  initialPlants:[[307,227],[329,215],[351,218],[310,251],[332,247],[355,245],[292,276],[314,281],[338,279],[429,285],[452,272],[445,294],[393,323],[415,316],[271,305],[287,315],[404,211],[422,220]].map(point),
  decor:[{id:'decor.pine',x:461,y:184,width:62,height:88,phase:2},{id:'decor.apple',x:497,y:258,width:69,height:84,phase:0}],
  ambient:{x:330,y:246,radiusX:180,radiusY:65},meadowBounds:{x:268,y:200,width:190,height:128},
  keyboardRain:{x:355,y:245},sun:{x:505,y:70},idleCloud:{x:355,y:77,w:1},
  canopy:{x:144,y:14,width:174,height:121,anchorX:220,anchorY:140},
  interactionTrees:[{id:'cherry',x:220,y:142,w:150,h:125},{id:'pine',x:461,y:184,w:62,h:88},{id:'apple',x:497,y:258,w:69,h:84}],
  shelter:[{x:245,y:172},{x:450,y:215}],
});
