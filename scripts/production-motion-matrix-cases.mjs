const allowed={
 engines:['chromium','webkit'],
 widths:[320,390,768],
 motions:['no-preference','reduce']
};
const csv=value=>value?.split(',').map(x=>x.trim()).filter(Boolean);
function dimension(name,value,values,convert=x=>x){
 const selected=csv(value)?.map(convert)??values;
 if(!selected.length||selected.some(x=>!values.includes(x)))throw new Error(`${name} contains an unsupported value`);
 return selected;
}
export function buildMatrixCases(sites,{engines,widths,motions,caseFilter}={}){
 const selectedEngines=dimension('MATRIX_ENGINES',engines,allowed.engines);
 const selectedWidths=dimension('MATRIX_WIDTHS',widths,allowed.widths,x=>Number(x));
 const selectedMotions=dimension('MATRIX_MOTIONS',motions,allowed.motions);
 const all=[];for(const [site,base] of sites)for(const engine of selectedEngines)for(const width of selectedWidths)for(const reducedMotion of selectedMotions)all.push({site,base,engine,width,reducedMotion});
 if(!caseFilter)return all;
 const wanted=csv(caseFilter);
 const keys=new Set(all.map(x=>`${x.site}/${x.engine}/${x.width}/${x.reducedMotion}`));
 if(!wanted?.length||wanted.some(x=>!keys.has(x)))throw new Error('MATRIX_CASE_FILTER contains a case outside the selected matrix');
 const order=new Map(wanted.map((x,i)=>[x,i]));
 return all.filter(x=>order.has(`${x.site}/${x.engine}/${x.width}/${x.reducedMotion}`)).sort((a,b)=>order.get(`${a.site}/${a.engine}/${a.width}/${a.reducedMotion}`)-order.get(`${b.site}/${b.engine}/${b.width}/${b.reducedMotion}`));
}
