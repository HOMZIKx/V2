'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';

import { usePlayerStore } from '../../../../src/player-store-react';
import { AppShell } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';
import { WorkspaceSectionNav } from '../workspace-section-nav';
import styles from './team-economy.module.css';

type Currency = 'yang' | 'won' | 'gem';
type Tab = 'drop' | 'costs' | 'history' | 'ranking';
type Summary = { runCount: number; totals: Array<{ currency: Currency; gross: number; costs: number; net: number }> };
type DropItem = { id: string; displayName: string; totalQuantity: number; ourQuantity: number; unitPrice: number; currency: Currency; perPile: number; leftover: number };
type Drop = { id: string; source: string; occurredAtIso: string; ourShareBasisPoints: number; pileCount: number; splitMode: 'max_equal'|'strict_equal'; items: DropItem[]; participants: Array<{ participantId: string; displayName: string; isTeamMember: boolean }> };
type Expense = { id: string; label: string; quantity: number; unitPrice: number; currency: Currency; ourShareBasisPoints: number; occurredAtIso: string };
type DraftItem = { key: string; itemId: string|null; name: string; category: string; totalQuantity: number; ourQuantity: number; unitPrice: number; currency: Currency; confidence: number|null };
type AiItem = { recognizedName: string; quantity: number; confidence: number; catalogMatch: { name: string; category: string; imageUrl: string|null } | null };

function weekStartIso(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, 0, 0, 0, 0);
  return start.toISOString();
}
function money(value: number, currency: Currency): string {
  if (currency === 'won') return `${value.toLocaleString('pl-PL',{maximumFractionDigits:2})} Won`;
  if (currency === 'gem') return `${value.toLocaleString('pl-PL',{maximumFractionDigits:2})} GEM`;
  const abs=Math.abs(value); const sign=value<0?'-':'';
  if(abs>=1_000_000_000)return `${sign}${(abs/1_000_000_000).toLocaleString('pl-PL',{maximumFractionDigits:2})} kkk`;
  if(abs>=1_000_000)return `${sign}${(abs/1_000_000).toLocaleString('pl-PL',{maximumFractionDigits:2})} kk`;
  if(abs>=1_000)return `${sign}${(abs/1_000).toLocaleString('pl-PL',{maximumFractionDigits:1})}k`;
  return `${value.toLocaleString('pl-PL')} Yang`;
}
function api(workspaceId:string,path:string){return `/player-team/v1/economy/workspaces/${encodeURIComponent(workspaceId)}/${path}`;}

export function TeamEconomy(){
  const {teamId}=useParams<{teamId:string}>();
  const {state,hydrated}=usePlayerStore();
  const workspace=state.workspaces.find((entry)=>entry.id===teamId&&!entry.archived)??null;
  const [tab,setTab]=useState<Tab>('drop');
  const [summary,setSummary]=useState<Summary|null>(null); const [drops,setDrops]=useState<Drop[]>([]); const [expenses,setExpenses]=useState<Expense[]>([]);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [dropOpen,setDropOpen]=useState(false); const [expenseOpen,setExpenseOpen]=useState(false);
  const [source,setSource]=useState('Azrael'); const [share,setShare]=useState(100); const [piles,setPiles]=useState(1); const [splitMode,setSplitMode]=useState<'max_equal'|'strict_equal'>('max_equal');
  const [draftItems,setDraftItems]=useState<DraftItem[]>([]); const [outsiders,setOutsiders]=useState(''); const [selectedMembers,setSelectedMembers]=useState<string[]>([]);
  const [expenseLabel,setExpenseLabel]=useState(''); const [expenseQty,setExpenseQty]=useState(1); const [expensePrice,setExpensePrice]=useState(0); const [expenseCurrency,setExpenseCurrency]=useState<Currency>('yang'); const [expenseShare,setExpenseShare]=useState(100);

  useEffect(()=>{if(workspace&&selectedMembers.length===0)setSelectedMembers(workspace.members.map((m)=>m.id));},[workspace,selectedMembers.length]);
  const load=useCallback(async()=>{
    if(!workspace)return; setError('');
    const since=encodeURIComponent(weekStartIso());
    try{
      const [s,d,e]=await Promise.all([fetch(api(workspace.id,`summary?since=${since}`),{cache:'no-store'}),fetch(api(workspace.id,`drops?since=${since}`),{cache:'no-store'}),fetch(api(workspace.id,`expenses?since=${since}`),{cache:'no-store'})]);
      if(!s.ok||!d.ok||!e.ok)throw new Error('Nie udało się pobrać ekonomii zespołu.');
      setSummary(await s.json() as Summary); setDrops(await d.json() as Drop[]); setExpenses(await e.json() as Expense[]);
    }catch(err){setError(err instanceof Error?err.message:'Błąd pobierania danych.');}
  },[workspace]);
  useEffect(()=>{void load();},[load]);

  const yang=summary?.totals.find((t)=>t.currency==='yang')??{gross:0,costs:0,net:0,currency:'yang' as const};
  const ranking=useMemo(()=>Object.entries(drops.reduce<Record<string,number>>((acc,drop)=>{acc[drop.source]=(acc[drop.source]??0)+drop.items.filter(i=>i.currency==='yang').reduce((s,i)=>s+i.ourQuantity*i.unitPrice,0);return acc;},{})).sort((a,b)=>b[1]-a[1]),[drops]);

  async function recognize(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0]; if(!file)return; setBusy(true); setError('');
    try{
      const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Nie udało się odczytać screena.'));reader.readAsDataURL(file);});
      const response=await fetch('/api/team-economy/recognize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({imageDataUrl:dataUrl})});
      if(!response.ok){const b=await response.json().catch(()=>({})) as {error?:string};throw new Error(b.error==='ai_not_configured'?'AI nie jest skonfigurowane w tym wdrożeniu. Możesz dodać drop ręcznie.':'AI nie rozpoznało screena. Możesz poprawić wynik ręcznie.');}
      const body=await response.json() as {items:AiItem[]};
      setDraftItems(body.items.map((item,index)=>({key:`ai-${Date.now()}-${index}`,itemId:null,name:item.catalogMatch?.name??item.recognizedName,category:item.catalogMatch?.category??'Pozostałe',totalQuantity:item.quantity,ourQuantity:Math.floor(item.quantity*share/100),unitPrice:0,currency:'yang',confidence:item.confidence})));
      setNotice(`AI rozpoznało ${body.items.length} pozycji. Sprawdź nazwę, ilość i naszą część przed zapisem.`);
    }catch(err){setError(err instanceof Error?err.message:'Błąd AI.');}finally{setBusy(false);}
  }
  function patchItem(key:string,patch:Partial<DraftItem>){setDraftItems((items)=>items.map((item)=>item.key===key?{...item,...patch}:item));}
  function applyShare(){setDraftItems((items)=>items.map((item)=>({...item,ourQuantity:Math.floor(item.totalQuantity*share/100)})));}
  function addManual(){setDraftItems((items)=>[...items,{key:`manual-${Date.now()}`,itemId:null,name:'',category:'Pozostałe',totalQuantity:1,ourQuantity:Math.floor(share/100),unitPrice:0,currency:'yang',confidence:null}]);}

  async function submitDrop(event:FormEvent){event.preventDefault();if(!workspace||draftItems.length===0)return;setBusy(true);setError('');
    try{
      const resolved=[] as DraftItem[];
      for(const item of draftItems){if(!item.name.trim())throw new Error('Każdy przedmiot musi mieć nazwę.');let itemId=item.itemId;
        if(!itemId){const r=await fetch(api(workspace.id,'items'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({canonicalName:item.name.trim(),category:item.category||'Pozostałe'})});if(!r.ok)throw new Error(`Nie udało się zapisać przedmiotu: ${item.name}.`);const saved=await r.json() as {id:string};itemId=saved.id;}
        resolved.push({...item,itemId});}
      const participants=[...workspace.members.filter((m)=>selectedMembers.includes(m.id)).map((m)=>({participantId:m.id,displayName:m.displayName,isTeamMember:true})),...outsiders.split(',').map(v=>v.trim()).filter(Boolean).map((name,index)=>({participantId:`external-${Date.now()}-${index}`,displayName:name,isTeamMember:false}))];
      const r=await fetch(api(workspace.id,'drops'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source,occurredAtIso:new Date().toISOString(),ourShareBasisPoints:Math.round(share*100),pileCount:piles,splitMode,participants,items:resolved.map(i=>({itemId:i.itemId,displayName:i.name,totalQuantity:i.totalQuantity,ourQuantity:i.ourQuantity,unitPrice:i.unitPrice,currency:i.currency,aiConfidence:i.confidence}))})});
      if(!r.ok)throw new Error('Serwer odrzucił zapis dropu.'); setDraftItems([]);setDropOpen(false);setNotice('Drop zapisany i doliczony do ekonomii zespołu.');await load();
    }catch(err){setError(err instanceof Error?err.message:'Błąd zapisu dropu.');}finally{setBusy(false);}
  }
  async function submitExpense(event:FormEvent){event.preventDefault();if(!workspace||!expenseLabel.trim())return;setBusy(true);setError('');try{const r=await fetch(api(workspace.id,'expenses'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label:expenseLabel,expenseType:'other',quantity:expenseQty,unitPrice:expensePrice,currency:expenseCurrency,ourShareBasisPoints:Math.round(expenseShare*100),occurredAtIso:new Date().toISOString()})});if(!r.ok)throw new Error('Serwer odrzucił koszt.');setExpenseOpen(false);setExpenseLabel('');setNotice('Koszt zapisany.');await load();}catch(err){setError(err instanceof Error?err.message:'Błąd zapisu kosztu.');}finally{setBusy(false);}}

  if(!hydrated)return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  if(state.authStatus!=='authenticated'||!state.viewer)return <DiscordEntryScreen/>;
  if(!workspace)return <AppShell activeSection="teams" viewerName={state.viewer.displayName}><main className={styles.page}><section className="panel"><h1>Nie znaleziono zespołu</h1></section></main></AppShell>;

  return <AppShell activeSection="teams" viewerName={state.viewer.displayName}><main className={styles.page} id="main-content">
    <section className={styles.hero}><div><span className={styles.eyebrow}>Zespół · Ekonomia</span><h1>{workspace.name}</h1><p>Drop, udział naszego zespołu, podział, ceny, koszty i wynik tygodnia.</p></div><div className={styles.actions}><button className={styles.button} onClick={()=>setDropOpen(v=>!v)} type="button">+ Dodaj drop</button><button className={styles.buttonGhost} onClick={()=>setExpenseOpen(v=>!v)} type="button">+ Koszt</button></div></section>
    <WorkspaceSectionNav active="economy" workspaceId={workspace.id}/>
    <section className={styles.metrics}><article className={styles.metric}><span>Drop · ten tydzień</span><strong>{money(yang.gross,'yang')}</strong></article><article className={styles.metric}><span>Koszty</span><strong>{money(yang.costs,'yang')}</strong></article><article className={styles.metric}><span>Wynik netto</span><strong className={styles.net}>{money(yang.net,'yang')}</strong></article><article className={styles.metric}><span>Wyprawy</span><strong>{summary?.runCount??0}</strong></article></section>
    {error?<p className={styles.error}>{error}</p>:null}{notice?<p className={styles.warning}>{notice}</p>:null}

    {dropOpen?<section className={styles.panel}><div className={styles.panelHeader}><h2>Nowy drop</h2><span className={styles.tag}>AI + ręczna kontrola</span></div><form onSubmit={submitDrop}>
      <div className={styles.formGrid}><label className={styles.field}>Źródło<input value={source} onChange={e=>setSource(e.target.value)} /></label><label className={styles.field}>Nasz udział %<input min="0" max="100" step="0.01" type="number" value={share} onChange={e=>setShare(Math.max(0,Math.min(100,Number(e.target.value))))}/><small className={styles.shareHint}>Procent proponuje ilość; fizyczną ilość „nasze” możesz poprawić.</small></label><label className={styles.field}>Liczba kupek<input min="1" max="100" type="number" value={piles} onChange={e=>setPiles(Math.max(1,Math.floor(Number(e.target.value))))}/></label><label className={styles.field}>Tryb podziału<select value={splitMode} onChange={e=>setSplitMode(e.target.value as typeof splitMode)}><option value="max_equal">Maksymalnie równo</option><option value="strict_equal">Tylko idealnie równo</option></select></label>
      <label className={`${styles.field} ${styles.full}`}><span>Screen dropu</span><span className={styles.dropZone}><input accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={recognize} type="file"/><small>AI rozpozna przedmioty i ilości. Zawsze zatwierdzasz wynik.</small></span></label>
      <div className={`${styles.actions} ${styles.full}`}><button className={styles.buttonGhost} type="button" onClick={addManual}>+ Przedmiot ręcznie</button><button className={styles.buttonGhost} type="button" onClick={applyShare}>Przelicz „nasze” wg {share}%</button></div></div>
      {draftItems.length?<table className={styles.itemTable}><thead><tr><th>Przedmiot</th><th>Całość</th><th>Nasze</th><th>Cena / szt.</th><th>Waluta</th><th>Na kupkę</th><th>Reszta</th><th></th></tr></thead><tbody>{draftItems.map(item=>{const per=splitMode==='strict_equal'&&item.ourQuantity%piles!==0?0:Math.floor(item.ourQuantity/piles);const left=item.ourQuantity-per*piles;return <tr key={item.key}><td><input value={item.name} onChange={e=>patchItem(item.key,{name:e.target.value})}/>{item.confidence!==null?<small> AI {Math.round(item.confidence*100)}%</small>:null}</td><td><input min="1" type="number" value={item.totalQuantity} onChange={e=>patchItem(item.key,{totalQuantity:Math.max(1,Math.floor(Number(e.target.value)))})}/></td><td><input min="0" max={item.totalQuantity} type="number" value={item.ourQuantity} onChange={e=>patchItem(item.key,{ourQuantity:Math.max(0,Math.min(item.totalQuantity,Math.floor(Number(e.target.value))))})}/></td><td><input min="0" type="number" value={item.unitPrice} onChange={e=>patchItem(item.key,{unitPrice:Math.max(0,Number(e.target.value))})}/></td><td><select value={item.currency} onChange={e=>patchItem(item.key,{currency:e.target.value as Currency})}><option value="yang">Yang</option><option value="won">Won</option><option value="gem">GEM</option></select></td><td>{per}</td><td>{left}</td><td><button className={styles.buttonGhost} type="button" onClick={()=>setDraftItems(v=>v.filter(x=>x.key!==item.key))}>Usuń</button></td></tr>})}</tbody></table>:<p className={styles.empty}>Wgraj screen lub dodaj przedmiot ręcznie.</p>}
      <div className={styles.formGrid}><fieldset className={`${styles.field} ${styles.wide}`}><legend>Uczestnicy zespołu</legend>{workspace.members.map(m=><label key={m.id}><input checked={selectedMembers.includes(m.id)} onChange={e=>setSelectedMembers(v=>e.target.checked?[...v,m.id]:v.filter(id=>id!==m.id))} type="checkbox"/> {m.displayName}</label>)}</fieldset><label className={`${styles.field} ${styles.wide}`}>Osoby / ekipy z zewnątrz<input placeholder="np. Kamil, Ekipa B" value={outsiders} onChange={e=>setOutsiders(e.target.value)}/></label></div>
      <div className={styles.rowActions}><button className={styles.button} disabled={busy||draftItems.length===0} type="submit">Zapisz i rozlicz drop</button><button className={styles.buttonGhost} type="button" onClick={()=>setDropOpen(false)}>Anuluj</button></div>
    </form></section>:null}

    {expenseOpen?<section className={styles.panel}><div className={styles.panelHeader}><h2>Dodaj koszt</h2></div><form className={styles.formGrid} onSubmit={submitExpense}><label className={`${styles.field} ${styles.wide}`}>Koszt<input placeholder="np. Przepustki" value={expenseLabel} onChange={e=>setExpenseLabel(e.target.value)}/></label><label className={styles.field}>Ilość<input min="0.0001" step="any" type="number" value={expenseQty} onChange={e=>setExpenseQty(Number(e.target.value))}/></label><label className={styles.field}>Cena / jednostkę<input min="0" type="number" value={expensePrice} onChange={e=>setExpensePrice(Number(e.target.value))}/></label><label className={styles.field}>Waluta<select value={expenseCurrency} onChange={e=>setExpenseCurrency(e.target.value as Currency)}><option value="yang">Yang</option><option value="won">Won</option><option value="gem">GEM</option></select></label><label className={styles.field}>Nasza część kosztu %<input min="0" max="100" type="number" value={expenseShare} onChange={e=>setExpenseShare(Number(e.target.value))}/></label><div className={`${styles.rowActions} ${styles.full}`}><button className={styles.button} disabled={busy} type="submit">Zapisz koszt</button></div></form></section>:null}

    <div className={styles.tabs}><button data-active={tab==='drop'} onClick={()=>setTab('drop')}>Drop</button><button data-active={tab==='costs'} onClick={()=>setTab('costs')}>Koszty</button><button data-active={tab==='history'} onClick={()=>setTab('history')}>Historia</button><button data-active={tab==='ranking'} onClick={()=>setTab('ranking')}>Ranking</button></div>
    {tab==='drop'?<section className={styles.panel}><div className={styles.panelHeader}><h2>Drop tego tygodnia</h2><span>{drops.length} wpisów</span></div><div className={styles.history}>{drops.length?drops.map(d=><article key={d.id}><header><h3>{d.source}</h3><strong>{money(d.items.filter(i=>i.currency==='yang').reduce((s,i)=>s+i.ourQuantity*i.unitPrice,0),'yang')}</strong></header><p>{new Date(d.occurredAtIso).toLocaleString('pl-PL')} · nasz udział {d.ourShareBasisPoints/100}% · {d.pileCount} kupek</p><p>{d.items.map(i=>`${i.displayName} ${i.ourQuantity}/${i.totalQuantity}${i.leftover?` (reszta ${i.leftover})`:''}`).join(' · ')}</p></article>):<p className={styles.empty}>Brak zapisanego dropu w tym tygodniu.</p>}</div></section>:null}
    {tab==='costs'?<section className={styles.panel}><div className={styles.panelHeader}><h2>Koszty tego tygodnia</h2></div><div className={styles.history}>{expenses.length?expenses.map(e=><article key={e.id}><header><h3>{e.label}</h3><strong>{money(e.quantity*e.unitPrice*e.ourShareBasisPoints/10000,e.currency)}</strong></header><p>{new Date(e.occurredAtIso).toLocaleString('pl-PL')} · nasza część {e.ourShareBasisPoints/100}%</p></article>):<p className={styles.empty}>Brak kosztów.</p>}</div></section>:null}
    {tab==='history'?<section className={styles.panel}><div className={styles.panelHeader}><h2>Historia rozliczeń</h2></div><p className={styles.empty}>Historia jest trwała po stronie serwera. Powyżej pokazujemy bieżący tydzień; kolejnym filtrem będzie zakres dat.</p><div className={styles.history}>{drops.map(d=><article key={d.id}><header><h3>{d.source}</h3><span>{new Date(d.occurredAtIso).toLocaleString('pl-PL')}</span></header><p>{d.participants.map(p=>p.displayName).join(', ')||'Brak wskazanych uczestników'}</p></article>)}</div></section>:null}
    {tab==='ranking'?<section className={styles.panel}><div className={styles.panelHeader}><h2>Najbardziej dochodowe aktywności · tydzień</h2></div><div className={styles.rank}>{ranking.length?ranking.map(([name,value],index)=><div key={name}><b>{index+1}</b><span>{name}</span><strong>{money(value,'yang')}</strong></div>):<p className={styles.empty}>Ranking pojawi się po zapisaniu dropu.</p>}</div></section>:null}
  </main></AppShell>;
}
