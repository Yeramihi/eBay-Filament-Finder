// Window only the DOM; filters and sorting continue to use every in-memory row.
globalThis.EbaySearchView = (()=>{
  const yieldTurn=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function sort(rows,compare,current) {
    let source=rows.slice(),target=new Array(rows.length),start=performance.now();
    for(let width=1;width<source.length;width*=2) {
      for(let left=0;left<source.length;left+=2*width) {
        const middle=Math.min(left+width,source.length),end=Math.min(left+2*width,source.length);
        let a=left,b=middle;
        for(let out=left;out<end;out++) {
          target[out]=a<middle&&(b>=end||compare(source[a],source[b])<=0) ? source[a++] : source[b++];
          if(performance.now()-start>4) {await yieldTurn();if(!current()) return null;start=performance.now();}
        }
      }
      [source,target]=[target,source];
    }
    return current() ? source : null;
  }
  function create(viewport,makeEntry,updateEntry) {
    const views=new Map();let disposed=false,frame,width=viewport.clientWidth;
    function schedule() {if(!disposed&&!frame) frame=requestAnimationFrame(()=>{frame=undefined;paint();});}
    function prefix(view) {
      const photos=view.container.classList.contains('photos-only');
      view.columns=photos ? Math.max(1,Math.floor(((view.container.clientWidth||viewport.clientWidth)-16+8)/104)) : 1;
      const bands=Math.ceil(view.rows.length/view.columns);
      view.offsets=new Float64Array(bands+1);
      for(let band=0;band<bands;band++) {
        let height=0;
        for(let column=0;column<view.columns;column++) {
          const row=view.rows[band*view.columns+column];
          if(row) height=Math.max(height,view.heights.get(row)||view.estimate);
        }
        view.offsets[band+1]=view.offsets[band]+height;
      }
    }
    function indexAt(offsets,position) {
      let low=0,high=offsets.length-1;
      while(low<high) {const mid=(low+high+1)>>1;if(offsets[mid]<=position) low=mid;else high=mid-1;}
      return Math.min(low,offsets.length-2);
    }
    function paint() {
      if(!viewport.clientHeight) return;
      const bounds=viewport.getBoundingClientRect(),height=viewport.clientHeight;
      for(const view of views.values()) {
        if(!view.rows.length) continue;
        if(!view.section.open||view.section.hidden) {
          view.nodes.clear();view.container.replaceChildren(view.top,view.bottom);
          view.top.style.height='0px';view.bottom.style.height=`${view.offsets.at(-1)}px`;
          continue;
        }
        const rect=view.container.getBoundingClientRect(),total=view.offsets.at(-1);
        const visibleTop=Math.max(0,bounds.top-rect.top-8);
        const from=Math.max(0,Math.min(visibleTop-height/2,total-2*height));
        const intersects=rect.top<bounds.bottom&&rect.top+total+16>bounds.top;
        const firstBand=intersects ? indexAt(view.offsets,from) : 0;
        const first=firstBand*view.columns;
        const lastBand=intersects ? Math.min(view.offsets.length-1,indexAt(view.offsets,Math.min(total,from+2*height))+1) : 0;
        const last=Math.min(view.rows.length,lastBand*view.columns);
        const next=new Map(),nodes=[],listingActions=new Set();
        for(let index=first;index<last;index++) {
          const row=view.rows[index],entry=view.nodes.get(row)||makeEntry(row);
          updateEntry(entry,row,view.context,!listingActions.has(row.url));listingActions.add(row.url);
          entry.setAttribute('role','listitem');entry.setAttribute('aria-posinset',String(index+1));entry.setAttribute('aria-setsize',String(view.rows.length));
          next.set(row,entry);nodes.push(entry);
        }
        const previousRows=[...view.nodes.keys()];
        const changed=next.size!==view.nodes.size||[...next.keys()].some((row,index)=>row!==previousRows[index]);
        if(changed) globalThis.EbayCards?.closeTooltip();
        view.nodes=next;
        view.top.style.height=`${view.offsets[firstBand] || 0}px`;
        view.bottom.style.height=`${Math.max(0,total-(view.offsets[lastBand] || 0))}px`;
        if(changed||view.dirty) {view.container.replaceChildren(view.top,...nodes,view.bottom);view.dirty=false;}
        if(!nodes.length) continue;
        const anchor=indexAt(view.offsets,visibleTop),oldAnchor=view.offsets[anchor];
        let measured=false,sum=0;
        for(const [row,entry] of next) {
          const size=entry.getBoundingClientRect().height+8;sum+=size;
          if(size>8&&Math.abs((view.heights.get(row)||0)-size)>1) {view.heights.set(row,size);measured=true;}
        }
        if(!view.estimated) {view.estimate=sum/nodes.length;view.estimated=true;measured=true;}
        if(measured) {
          prefix(view);
          if(rect.top<bounds.top) viewport.scrollTop+=view.offsets[anchor]-oldAnchor;
          view.top.style.height=`${view.offsets[firstBand]}px`;
          view.bottom.style.height=`${Math.max(0,view.offsets.at(-1)-view.offsets[lastBand])}px`;
          schedule();
        }
      }
    }
    const observer=new ResizeObserver(()=>{
      if(width!==viewport.clientWidth) {
        width=viewport.clientWidth;
        for(const view of views.values()) {view.heights=new WeakMap();view.estimated=false;prefix(view);view.dirty=true;}
      }
      schedule();
    });
    observer.observe(viewport);
    viewport.addEventListener('scroll',schedule,{passive:true});
    function set(container,rows,context,empty) {
      let view=views.get(container);
      if(!view) {
        const top=document.createElement('div'),bottom=document.createElement('div');
        top.className=bottom.className='finder-virtual-spacer';top.setAttribute('aria-hidden','true');bottom.setAttribute('aria-hidden','true');
        container.classList.add('finder-virtual-list');container.setAttribute('role','list');
        view={container,section:container.closest('details'),top,bottom,rows:[],nodes:new Map(),heights:new WeakMap(),estimate:240,estimated:false};
        views.set(container,view);view.section.addEventListener('toggle',schedule);
        const layout=new MutationObserver(()=>{view.heights=new WeakMap();view.estimated=false;view.estimate=container.classList.contains('lines')?28:240;prefix(view);view.dirty=true;schedule();});
        view.layoutObserver=layout;
        layout.observe(container,{attributes:true,attributeFilter:['class']});
      }
      view.rows=rows;view.context=context;view.dirty=true;prefix(view);
      if(!rows.length) {view.nodes.clear();container.replaceChildren(...(empty?[empty]:[]));}
      else if(!container.contains(view.top)) {view.top.style.height='0px';view.bottom.style.height=`${view.offsets.at(-1)}px`;container.replaceChildren(view.top,view.bottom);}
      schedule();
    }
    return {set,schedule,dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();viewport.removeEventListener('scroll',schedule);for(const view of views.values()) {view.layoutObserver?.disconnect();view.nodes.clear();}views.clear();}};
  }
  return {create,sort,yieldTurn};
})();
