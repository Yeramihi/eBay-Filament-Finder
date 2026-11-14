const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context={Intl,URL,console,Event};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/variants.js`,'utf8'),context);
const api=context.EbayVariants;
const matches=(query,text)=>api.matches(text,api.terms(query));

test('implicit AND, explicit operators and case insensitive words',()=>{
  assert.equal(matches('PLA white silk','White silk pLa+'),true);
  assert.equal(matches('PLA white silk','white PLA'),false);
  assert.equal(matches('PLA aNd white AND silk','SILK white PLA'),true);
  assert.equal(matches('pla','PLA+'),true);
});
test('OR groups adjacent operands before explicit or implicit AND',()=>{
  for(const query of ['PLA OR PETG silk','PLA or PETG and silk']) {
    assert.equal(matches(query,'PLA silk'),true);
    assert.equal(matches(query,'PETG silk'),true);
    assert.equal(matches(query,'PLA matte'),false);
    assert.equal(matches(query,'silk ABS'),false);
  }
  assert.equal(matches('PLA or "yellow PETG" and silk','yellow PETG silk'),true);
  assert.equal(matches('PLA or "yellow PETG" and silk','yellow silk PETG'),false);
  assert.equal(matches('PLA or "yellow PETG" and silk','PLA matte'),false);
  assert.equal(matches('PLA OR PETG OR ABS silk','ABS silk'),true);
});
test('parentheses override grouping and can nest or adjoin terms',()=>{
  assert.equal(matches('PLA OR (PETG silk)','PLA matte'),true);
  assert.equal(matches('(PLA OR PETG)(silk OR matte)','PETG matte'),true);
  assert.equal(matches('((PLA OR PETG) silk) OR ABS','PLA matte'),false);
  assert.equal(matches('((PLA OR PETG) silk) OR ABS','ABS matte'),true);
});
test('NOT and ! negate terms, phrases and grouped expressions',()=>{
  for(const query of ['PLA NOT silk','PLA !silk','PLA AND NOT silk']) {
    assert.equal(matches(query,'PLA matte'),true);
    assert.equal(matches(query,'PLA silk'),false);
  }
  assert.equal(matches('!(PLA OR PETG)','ABS'),true);
  assert.equal(matches('NOT (PLA OR PETG)','PETG'),false);
  assert.equal(matches('NOT NOT PLA','PLA'),true);
  assert.equal(matches('PLA NOT "dark blue"','PLA blue dark'),true);
  assert.equal(matches('PLA NOT "dark blue"','PLA dark blue'),false);
});
test('quotes preserve phrases, literal operators and punctuation',()=>{
  assert.equal(matches('"white silk"','PLA WHITE SILK'),true);
  assert.equal(matches('"white silk"','white PLA silk'),false);
  assert.equal(matches('"AND"','candy'),false);
  assert.equal(matches('"(PLA!)"','(PLA!) silk'),true);
  assert.equal(matches('PLA+ [blue]','PLA+ [blue]'),true);
  assert.equal(matches('PLA+ [blue]','PLAA blue'),false);
  assert.equal(matches('"white silk','white silk PLA'),true);
});
test('percent requires one or more characters for each wildcard',()=>{
  assert.equal(matches('%PLA','xPLA'),true);
  assert.equal(matches('%PLA','PLA'),false);
  assert.equal(matches('%PLA%','xPLAy'),true);
  assert.equal(matches('%PLA%','PLA'),false);
  assert.equal(matches('%PLA%','xPLA'),false);
  assert.equal(matches('PLA%white','PLA white'),true);
  assert.equal(matches('PLA%white','PLAwhite'),false);
  assert.equal(matches('PLA%white','PLA\nwhite'),true);
  assert.equal(matches('"PLA%white"','pla silk white'),true);
  assert.equal(matches('%%','x'),false);
  assert.equal(matches('%%','xy'),true);
});
test('empty search allows all rows and malformed expressions do not throw or broaden results',()=>{
  assert.equal(matches('','anything'),true);
  for(const query of ['PLA OR','AND PLA','()','(PLA','PLA)','!','PLA OR OR PETG','""']) {
    assert.equal(matches(query,'PLA PETG'),false,query);
  }
});

test('ambiguous materials require a single-item listing and distinct material families',()=>{
  const types=(title,singleItem=true)=>Array.from(api.ambiguousFilamentTypes({title,singleItem}));
  assert.deepEqual(types('2 X YOYI 1.75mm PLA Classic PLA+ PETG SILK ASA TPU 3D Printer Filament 1KG White'),['PLA','PETG','ASA','TPU']);
  assert.deepEqual(types('PLA white PLA+ silk matte PLA-CF'),[]);
  assert.deepEqual(types('PA12 Nylon PA6-CF'),[]);
  assert.deepEqual(types('PLA PETG',false),[]);
  assert.deepEqual(types('plate absorbs silk white'),[]);
  assert.deepEqual(types('petg/abs'),['PETG','ABS']);
  assert.deepEqual(types('PETG PET'),[]);
  assert.deepEqual(types('PLA TPU'),['PLA','TPU']);
  assert.deepEqual(types('PLA PA12 nylon'),['PLA','PA / Nylon']);
  assert.deepEqual(types('PC PVA HIPS TPE PET'),[]);
  assert.deepEqual(types('PC Polycarbonate'),[]);
  assert.deepEqual(Array.from(api.ambiguousFilamentTypes({singleItem:true,label:'TPU / PLA'})),['PLA','TPU']);
});

test('adjacent brackets imply AND without requiring spaces',()=>{
  assert.equal(matches('white(PETG or PLA)','white PETG'),true);
  assert.equal(matches('white(PETG or PLA)','white PLA'),true);
  assert.equal(matches('white(PETG or PLA)','black PLA'),false);
  assert.equal(matches('(PETG or PLA)white','white PETG'),true);
});
test('formatter wraps OR neighbours and exclusion operands at the cursor',()=>{
  function check(value,cursor,char,expected,expectedCursor) {
    const result=api.formatQueryInput(value,cursor,char);
    assert.equal(result.value,expected);
    assert.equal(result.cursor,expectedCursor);
  }
  check('white ASA or ',13,' ','white (ASA or )',14);
  check('white ASA or black PETG',13,' ','white (ASA or black) PETG',14);
  check('white "silk PLA" OR PETG',20,' ','white ("silk PLA" OR PETG)',21);
  check('white NOT ',10,' ','white NOT ()',11);
  check('white !',7,'!','white !()',8);
  check('white NOT black PETG',10,' ','white NOT (black) PETG',11);
  assert.equal(api.formatQueryInput('"white OR ',10,' '),null);
  assert.equal(api.formatQueryInput('NOT (PLA)',4,' '),null);
  assert.equal(api.formatQueryInput('white(PETG or ',14,' '),null);
});
test('typing stays inside auto brackets until an explicit closing bracket',()=>{
  const handlers={};
  const input={value:'',selectionStart:0,selectionEnd:0,
    addEventListener(type,fn){(handlers[type] ||= []).push(fn);},
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
  api.attachQueryFormatting(input);
  function type(text) {
    for(const char of text) {
      let prevented=false;
      for(const handler of handlers.keydown || []) handler({key:char,preventDefault(){prevented=true;}});
      if(prevented) continue;
      const cursor=input.selectionStart;
      input.value=input.value.slice(0,cursor)+char+input.value.slice(input.selectionEnd);
      input.setSelectionRange(cursor+1,cursor+1);
      for(const handler of handlers.input) handler({inputType:'insertText',data:char});
    }
  }
  type('white ASA or black PETG');
  assert.equal(input.value,'white (ASA or black PETG)');
  assert.equal(matches(input.value,'white ASA PETG'),true);
  assert.equal(matches(input.value,'white ASA'),false);
  input.value='';input.setSelectionRange(0,0);
  type('PLA NOT "dark blue") silk');
  assert.equal(input.value,'PLA NOT ("dark blue") silk');
  input.value='';input.setSelectionRange(0,0);
  type('PLA !black) silk');
  assert.equal(input.value,'PLA !(black) silk');
  input.value='';input.setSelectionRange(0,0);
  type('(white ASA) OR (black PETG)');
  assert.equal(input.value,'(white ASA) OR (black PETG)');
  assert.equal(input.selectionStart,input.value.length);
  assert.equal(matches(input.value,'white ASA'),true);
  assert.equal(matches(input.value,'black PETG'),true);
  assert.equal(matches(input.value,'black ASA'),false);
});

test('plain searches require whole words and percent explicitly enables partial matches',()=>{
  assert.equal(matches('GR','green'),false);
  assert.equal(matches('GR','GR filament'),true);
  assert.equal(matches('gr%','green'),true);
  assert.equal(matches('gr%','GR'),false);
  assert.equal(matches('%gr%','lightgrey'),true);
  assert.equal(matches('%gr','darkgr'),true);
  assert.equal(matches('%gr','darkgreen'),false);
  assert.equal(matches('green','greenish'),false);
  assert.equal(matches('green','evergreen'),false);
  assert.equal(matches('green','green-blue'),true);
  assert.equal(matches('PLA','plate'),false);
  assert.equal(matches('PLA','PLA-CF'),true);
  assert.equal(matches('"white silk"','offwhite silk'),false);
  assert.equal(matches('"white silk"','white silky'),false);
  assert.equal(matches('NOT GR','green'),true);
  assert.equal(matches('NOT gr%','green'),false);
  assert.equal(matches('GR OR blue','green'),false);
  assert.equal(matches('gr% OR blue','green'),true);
  assert.equal(matches('GR','éGR'),false);
  assert.equal(matches('GR','GR2'),false);
});

test('queries and listing text share dash and whitespace normalisation',()=>{
  const forms=['carbon-fibre','carbon -  fibre','carbon fibre','carbon  fibre',
    'carbon‐fibre','carbon‑fibre','carbon‒fibre','carbon–fibre','carbon—fibre',
    'carbon−fibre','CARBON – FIBRE','carbon\u00a0fibre'];
  for(const query of forms) {
    for(const text of forms) {
      assert.equal(matches(query,text),true,`${query} versus ${text}`);
      assert.equal(matches(`"${query}"`,text),true,`quoted ${query} versus ${text}`);
    }
  }
  assert.equal(matches('"carbon-fibre"','carbon reinforced fibre'),false);
  assert.equal(matches('carbon-fibre','carbonfibre'),false);
  assert.equal(matches('NOT "carbon-fibre"','carbon – fibre'),false);
  assert.equal(matches('"carbon-fibre" OR PETG','carbon — fibre'),true);
  assert.equal(matches('carbon%fibre','carbon‑fibre'),true);
  assert.equal(api.normalizeSearchText('  Carbon  –  FIBRE  '),'carbon fibre');
});

test('OR formatting skips leading expressions and existing OR chains',()=>{
  for (const value of ['PLA OR ', '  PLA OR ', '(white ASA) OR ',
    'PLA OR PETG OR ', 'white PLA OR PETG OR ', 'white (PLA OR ']) {
    assert.equal(api.formatQueryInput(value,value.length,' '),null,value);
  }
  const existing='PLA OR PETG silk';
  assert.equal(api.formatQueryInput(existing,existing.indexOf('PETG'),' '),null);
  const value='white ASA OR ';
  assert.equal(api.formatQueryInput(value,value.length,' ').value,'white (ASA OR )');
  const explicit='white AND ASA OR ';
  assert.equal(api.formatQueryInput(explicit,explicit.length,' ').value,'white AND (ASA OR )');
  const grouped='silk (white ASA) OR ';
  assert.equal(api.formatQueryInput(grouped,grouped.length,' ').value,'silk ((white ASA) OR )');
});

test('selected British and American spellings match in both directions',()=>{
  const pairs=[['grey','gray'],['colour','color'],['colours','colors'],
    ['coloured','colored'],['colouring','coloring'],
    ['multicolour','multicolor'],['multicoloured','multicolored'],
    ['fibre','fiber'],['fibres','fibers'],['aluminium','aluminum'],
    ['metre','meter'],['metres','meters'],['millimetre','millimeter'],
    ['millimetres','millimeters'],['centimetre','centimeter'],['centimetres','centimeters'],
    ['litre','liter'],['litres','liters'],['mould','mold'],['moulds','molds'],
    ['moulded','molded'],['moulding','molding']];
  for(const [british,american] of pairs) {
    assert.equal(matches(british,american),true,`${british} -> ${american}`);
    assert.equal(matches(american,british),true,`${american} -> ${british}`);
    assert.equal(matches(british.toUpperCase(),american),true);
    assert.equal(matches(`NOT ${british}`,american),false);
    assert.equal(matches(`"${british} PLA"`,`${american} PLA`),true);
  }
  assert.equal(matches('"grey carbon-fibre"','GRAY CARBON – FIBER'),true);
  assert.equal(matches('gray OR black','grey'),true);
  assert.equal(matches('%gray%','dark grey silk'),true);
  assert.equal(matches('gray%','grey silk'),true);
  assert.equal(api.normalizeSearchText('Fiberon Graystone ColorFabb'),'fiberon graystone colorfabb');
  assert.equal(matches('gray','graystone'),false);
  assert.equal(matches('fiber','fiberon'),false);
  assert.equal(matches('color','multicolor'),false);
});

test('validation describes missing brackets, quotes and operands',()=>{
  assert.match(api.queryError('(white ASA) or (black PETG'),/Missing closing bracket/);
  assert.match(api.queryError('PLA)'),/Unexpected closing bracket/);
  assert.match(api.queryError('PLA OR'),/operator needs a search term/);
  assert.match(api.queryError('"white silk'),/Missing closing quotation/);
  assert.match(api.queryError('""'),/quotation marks/);
  assert.equal(api.queryError('(white ASA) or (black PETG)'), '');
});
test('clear button resets text and validation without applying a search',()=>{
  const listeners={},attributes={};
  const input={value:'PLA OR',addEventListener(t,fn){(listeners[t] ||= []).push(fn);},
    dispatchEvent(e){for(const fn of listeners[e.type] || []) fn(e);},
    setAttribute(k,v){attributes[k]=v;},focus(){this.focused=true;}};
  const error={},button={addEventListener(t,fn){this[t]=fn;}};
  const validate=api.attachQueryValidation(input,error);
  api.attachClearInput(input,button);
  assert.equal(button.hidden,false);
  assert.equal(validate(),false);
  assert.equal(attributes['aria-invalid'],'true');
  button.click();
  assert.equal(input.value,'');
  assert.equal(input.focused,true);
  assert.equal(error.hidden,true);
  assert.equal(button.hidden,true);
  assert.equal(attributes['aria-invalid'],'false');
});

test('starting the next term wraps the preceding leading OR block',()=>{
  function check(value,expected,char=value.at(-1)) {
    const result=api.formatQueryInput(value,value.length,char);
    assert.equal(result?.value,expected);
    if(result)assert.equal(result.cursor,value.length+2);
  }
  check('pink or yellow P','(pink or yellow) P');
  check('  pink OR yellow   P','  (pink OR yellow)   P');
  check('pink OR yellow OR blue P','(pink OR yellow OR blue) P');
  check('"light pink" OR yellow P','("light pink" OR yellow) P');
  check('(white ASA) OR (black PETG) P','((white ASA) OR (black PETG)) P');
  assert.equal(api.formatQueryInput('pink or yellow ',15,' '),null);
  assert.equal(api.formatQueryInput('pink or yellow o',16,'o'),null);
  assert.equal(api.formatQueryInput('pink or yellow or',17,'r'),null);
  assert.equal(api.formatQueryInput('(pink or yellow) P',18,'P'),null);
  assert.equal(api.formatQueryInput('pink yellow P',13,'P'),null);
});

test('oversized queries are rejected before parsing',()=>{
  assert.equal(api.queryError('a'.repeat(512)),'');
  assert.match(api.queryError('a'.repeat(513)),/Maximum 512/);
  assert.equal(matches('a'.repeat(100000),'a'),false);
});
test('many failing wildcard branches use bounded matching rather than a regex',()=>{
  const query='%a'.repeat(200)+'%b';
  const expression=api.terms(query);
  assert.equal(expression[0].pattern,undefined);
  assert.equal(expression[0].wildcard.length,query.length);
  assert.equal(api.matches('a'.repeat(2000),expression),false);
});
test('bounded wildcard matching agrees with reference semantics on short patterns',()=>{
  const patterns=['a%','%a','%a%','a%b','%a%b','a%%b','%%','%a%a%b'];
  const texts=['a','ab','ba','aab','a b','a ba','b a b','ababab',' a b ','aaab'];
  for(const pattern of patterns) {
    const regex=new RegExp(`(?<![a-z0-9_])${pattern.replaceAll('%','[\\s\\S]+')}(?![a-z0-9_])`,'i');
    for(const text of texts) assert.equal(matches(pattern,text),regex.test(api.normalizeSearchText(text)),`${pattern} / ${text}`);
  }
});

function queryField(value='',start=value.length,end=start) {
  const handlers={};
  const input={value,selectionStart:start,selectionEnd:end,
    addEventListener(t,fn){(handlers[t] ||= []).push(fn);},
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
    dispatchEvent(event){for(const fn of handlers[event.type] || [])fn(event);}};
  api.attachQueryFormatting(input);
  return {input,
    paste(text){let prevented=false;input.dispatchEvent({type:'paste',clipboardData:{getData:()=>text},preventDefault(){prevented=true;}});assert.equal(prevented,true);},
    type(text){for(const character of text){
      let prevented=false;
      input.dispatchEvent({type:'keydown',key:character,preventDefault(){prevented=true;}});
      if(prevented)continue;
      const cursor=input.selectionStart;
      input.value=input.value.slice(0,cursor)+character+input.value.slice(input.selectionEnd);
      input.setSelectionRange(cursor+character.length,cursor+character.length);
      input.dispatchEvent({type:'input',inputType:'insertText',data:character});
    }}
  };
}
test('whole-query paste produces the same brackets and cursor as manual typing',()=>{
  for(const text of ['white or black PLA or PETG','pink or yellow PLA',
    '(white ASA) OR (black PETG)','PLA NOT silk','PLA !(black OR yellow)',
    '"white silk" OR "black silk" PLA','carbon–fibre OR PETG', 'grey% OR black PLA']) {
    const pasted=queryField(),typed=queryField();
    pasted.paste(text);typed.type(text);
    assert.equal(pasted.input.value,typed.input.value,text);
    assert.equal(pasted.input.selectionStart,typed.input.selectionStart,text);
  }
  const field=queryField();field.paste('white or black PLA or PETG');
  assert.equal(field.input.value,'(white or black) (PLA or PETG)');
});
test('partial paste formats only the inserted characters while retaining surrounding input',()=>{
  for(const [value,start,end,text] of [
    ['white  silk',6,6,'ASA or PETG'],
    ['white OLD silk',6,9,'ASA or PETG'],
    ['pink or  PLA',8,8,'yellow'],
    ['PLA NOT ()',9,9,'black PETG'],
    ['white silk',0,5,'black OR yellow']
  ]) {
    const pasted=queryField(value,start,end),typed=queryField(value,start,end);
    pasted.paste(text);typed.type(text);
    assert.equal(pasted.input.value,typed.input.value,`${value} + ${text}`);
    assert.equal(pasted.input.selectionStart,typed.input.selectionStart);
  }
});
test('paste respects character limit and emits one change notification',()=>{
  const field=queryField();let notifications=0;
  field.input.addEventListener('input',()=>notifications++);
  field.paste('x'.repeat(100000));
  assert.equal(field.input.value.length,512);
  assert.equal(notifications,1);
  const limited=queryField('a'.repeat(510));limited.paste('abc');
  assert.equal(limited.input.value.length,512);
});

test('unit and filament vocabulary singulars and plurals match in both directions',()=>{
  for(const [singular,plural] of [['metre','metres'],['meter','meters'],
    ['millimetre','millimeters'],['centimeter','centimetres'],['litre','liters'],
    ['millilitre','milliliters'],['gram','grams'],['kilogram','kilograms'],
    ['filament','filaments'],['spool','spools'],['roll','rolls'],['reel','reels'],
    ['pack','packs'],['bundle','bundles'],['colour','colors'],['fibre','fibers'],['mould','molds']]) {
    assert.equal(matches(singular,plural),true,`${singular} / ${plural}`);
    assert.equal(matches(plural,singular),true,`${plural} / ${singular}`);
  }
  for(const text of ['10 metre','10 metres','10 meter','10 meters']) {
    assert.equal(matches('!(10 metres)',text),false,text);
    assert.equal(matches('NOT "10 metres"',text),false,text);
  }
  assert.equal(matches('!(10 metres)','20 metre'),true);
  assert.equal(matches('!(10 metres)','100 metres'),true);
  assert.equal(matches('metres','millimetres'),false);
  assert.equal(matches('gram','kilogram'),false);
  assert.equal(api.normalizeSearchText('ABS HIPS PPS glass ColorFabb'),'abs hips pps glass colorfabb');
  assert.equal(matches('ABS','AB'),false);
});
