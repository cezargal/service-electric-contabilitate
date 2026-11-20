"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type InventoryItem = {
 id:number; product_name:string; product_code?:string|null; measuring_unit?:string|null; quantity:number; unit_cost:number;
 purchase_date:string; inventory_number?:string|null; serial_number?:string|null; status:"in_stoc"|"in_folosinta"|"scos_din_uz"|"casat";
 date_put_into_use?:string|null; assigned_to?:string|null; location?:string|null; date_retired?:string|null; notes?:string|null;
 supplier_name?:string|null; invoice_number?:string|null; invoice_series?:string|null; invoice_date?:string|null;
};
type Props = { sourceInvoice:any; onSourceConsumed:()=>void };
const today=()=>new Date().toISOString().slice(0,10);
const money=(n:number)=>new Intl.NumberFormat("ro-RO",{style:"currency",currency:"RON"}).format(n||0);
const cleanCsv=(v:any)=>{const s=String(v??"");return /[=+@\-]/.test(s.slice(0,1))?"'"+s:s};
const csvCell=(v:any)=>'"'+cleanCsv(v).replace(/"/g,'""')+'"';

export default function InventoryRegister({sourceInvoice,onSourceConsumed}:Props){
 const [items,setItems]=useState<InventoryItem[]>([]);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [year,setYear]=useState(String(new Date().getFullYear()));
 const [lineIndex,setLineIndex]=useState("0"),[quantity,setQuantity]=useState("1"),[unitCost,setUnitCost]=useState("0");
 const [purchaseDate,setPurchaseDate]=useState(""),[inventoryNumber,setInventoryNumber]=useState(""),[serialNumber,setSerialNumber]=useState("");
 const [status,setStatus]=useState<InventoryItem["status"]>("in_stoc"),[useDate,setUseDate]=useState(""),[assignedTo,setAssignedTo]=useState(""),[location,setLocation]=useState(""),[notes,setNotes]=useState("");
 const [editingId,setEditingId]=useState<number|null>(null),[editStatus,setEditStatus]=useState<InventoryItem["status"]>("in_stoc"),[editUseDate,setEditUseDate]=useState(""),[editAssignedTo,setEditAssignedTo]=useState(""),[editLocation,setEditLocation]=useState(""),[editRetiredDate,setEditRetiredDate]=useState("");
 const invoice=sourceInvoice?.invoice||{},doc=sourceInvoice?.doc||{},lines=Array.isArray(invoice.lines)?invoice.lines:[];
 const sourceKey=String(sourceInvoice?.id||"");
 useEffect(()=>{load();},[]);
 useEffect(()=>{
  if(!sourceKey)return;
  setLineIndex("0");setQuantity(String(lines[0]?.quantity||1));setUnitCost(String(lines[0]?.unit_price||0));
  setPurchaseDate(String(invoice.invoice_date||today()).slice(0,10));setInventoryNumber("");setSerialNumber("");
  setStatus("in_stoc");setUseDate("");setAssignedTo("");setLocation("");setNotes("");
 },[sourceKey]);
 async function load(){
  setLoading(true);setError("");
  const {data,error}=await supabase.from("obiecte_inventar").select("*").order("purchase_date",{ascending:false}).order("id",{ascending:false});
  if(error)setError(error.message);else setItems(data||[]);
  setLoading(false);
 }
 const chosenLine=lines[Number(lineIndex)]||null;
 const yearItems=useMemo(()=>{
  const end=String(year)+"-12-31";
  return items.filter(item=>item.purchase_date<=end&&(!item.date_retired||item.date_retired>end));
 },[items,year]);
 async function addFromInvoice(event:any){
  event.preventDefault();setError("");setNotice("");
  if(!sourceInvoice||!chosenLine){setError("Deschide factura din arhiva SPV și alege o poziție.");return}
  const qty=Number(quantity),cost=Number(unitCost);
  if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(cost)||cost<0){setError("Cantitatea sau valoarea nu este validă.");return}
  if(status==="in_folosinta"&&!useDate){setError("Completează data dării în folosință.");return}
  setSaving(true);
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const payload={
    cui_entitate:"43594993",anaf_message_id:sourceKey,anaf_cif:String(doc.cif||"43594993"),
    invoice_series:invoice.invoice_series||null,invoice_number:invoice.invoice_number||null,invoice_date:invoice.invoice_date||null,
    supplier_name:invoice.supplier_name||doc.supplier_name||"Furnizor SPV",supplier_cif:invoice.supplier_cif||doc.sender_cif||null,
    line_index:Number(lineIndex),product_name:String(chosenLine.description||"Produs fără denumire"),
    product_code:chosenLine.code||chosenLine.item_code||null,measuring_unit:chosenLine.unit||null,
    quantity:qty,unit_cost:cost,purchase_date:purchaseDate||invoice.invoice_date||today(),
    inventory_number:inventoryNumber.trim()||null,serial_number:serialNumber.trim()||null,status,
    date_put_into_use:status==="in_folosinta"?(useDate||null):null,assigned_to:assignedTo.trim()||null,
    location:location.trim()||null,notes:notes.trim()||null,created_by:user?.id||null
   };
   const {error}=await supabase.from("obiecte_inventar").insert(payload);
   if(error)throw error;
   setNotice("Obiectul a fost adăugat în evidență.");
   await load();onSourceConsumed();
  }catch(e:any){setError(e.message||"Obiectul nu a putut fi adăugat.");}
  finally{setSaving(false)}
 }
 function exportCsv(){
  const header=["Denumire","Cod produs","Cantitate","UM","Valoare unitara","Data achizitiei","Furnizor","CUI furnizor","Factura","Nr inventar","Serie produs","Stare","Data folosinta","Responsabil","Locatie","Data scoatere","Observatii"];
  const rows=yearItems.map(x=>[x.product_name,x.product_code,x.quantity,x.measuring_unit,x.unit_cost,x.purchase_date,x.supplier_name,x.supplier_cif,[x.invoice_series,x.invoice_number].filter(Boolean).join(" "),x.inventory_number,x.serial_number,statusLabel(x.status),x.date_put_into_use,x.assigned_to,x.location,x.date_retired,x.notes]);
  const csv="\uFEFF"+[header,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="obiecte-inventar-"+year+".csv";a.click();URL.revokeObjectURL(url);
 }
 async function saveEdit(item:InventoryItem){
  setError("");
  if(editStatus==="in_folosinta"&&!editUseDate){setError("Completează data dării în folosință.");return}
  const patch={status:editStatus,date_put_into_use:editStatus==="in_folosinta"?editUseDate||null:item.date_put_into_use||null,assigned_to:editAssignedTo.trim()||null,location:editLocation.trim()||null,date_retired:["scos_din_uz","casat"].includes(editStatus)?editRetiredDate||today():null,updated_at:new Date().toISOString()};
  const {error}=await supabase.from("obiecte_inventar").update(patch).eq("id",item.id);
  if(error){setError(error.message);return}
  setEditingId(null);await load();setNotice("Evidența obiectului a fost actualizată.");
 }
 function beginEdit(item:InventoryItem){
  setEditingId(item.id);setEditStatus(item.status);setEditUseDate(item.date_put_into_use||today());
  setEditAssignedTo(item.assigned_to||"");setEditLocation(item.location||"");setEditRetiredDate(item.date_retired||today());
 }
 function statusLabel(value:string){return value==="in_stoc"?"În stoc":value==="in_folosinta"?"În folosință":value==="scos_din_uz"?"Scos din uz":"Casat"}
 return <section className="panel no-print">
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h1>Evidență obiecte de inventar</h1><p className="muted">Înregistrează obiectele după recepția în Oblio și actualizează darea în folosință, responsabilul și locația.</p></div><div style={{display:"flex",gap:8}}><label className="field" style={{margin:0}}>Anul evidenței<input type="number" min="2000" max="2100" value={year} onChange={e=>setYear(e.target.value)}/></label><button className="btn secondary" onClick={exportCsv} disabled={!yearItems.length}>Descarcă evidența CSV</button><button className="btn secondary" onClick={load} disabled={loading}>{loading?"Se încarcă…":"Reîncarcă"}</button></div></div>
  {sourceInvoice&&<div className="panel" style={{marginTop:16,background:"#f4f8ff",border:"1px solid #cbdaf0"}}>
   <h2>Adaugă obiect din factura SPV</h2><p className="muted">Factura: {invoice.invoice_number||"—"} · {invoice.supplier_name||doc.supplier_name||"Furnizor SPV"} · {invoice.invoice_date||"—"}</p>
   <form onSubmit={addFromInvoice}>
    <div className="grid"><div className="field"><label>Poziția de pe factură</label><select value={lineIndex} onChange={e=>{setLineIndex(e.target.value);const l=lines[Number(e.target.value)];setQuantity(String(l?.quantity||1));setUnitCost(String(l?.unit_price||0))}}>{lines.map((line:any,index:number)=><option key={index} value={index}>{line.description||"Produs"} · {line.quantity||1} {line.unit||"buc"}</option>)}</select></div><div className="field"><label>Cantitate</label><input type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></div><div className="field"><label>Cost unitar (RON)</label><input type="number" min="0" step="0.01" value={unitCost} onChange={e=>setUnitCost(e.target.value)}/></div><div className="field"><label>Data achiziției</label><input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></div></div>
    <div className="grid"><div className="field"><label>Număr de inventar</label><input value={inventoryNumber} onChange={e=>setInventoryNumber(e.target.value)} placeholder="Opțional"/></div><div className="field"><label>Serie produs</label><input value={serialNumber} onChange={e=>setSerialNumber(e.target.value)} placeholder="Opțional"/></div><div className="field"><label>Stare</label><select value={status} onChange={e=>setStatus(e.target.value as InventoryItem["status"])}><option value="in_stoc">În stoc</option><option value="in_folosinta">În folosință</option><option value="scos_din_uz">Scos din uz</option><option value="casat">Casat</option></select></div>{status==="in_folosinta"&&<><div className="field"><label>Data dării în folosință</label><input type="date" value={useDate} onChange={e=>setUseDate(e.target.value)}/></div><div className="field"><label>Responsabil / persoană</label><input value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}/></div><div className="field"><label>Locație</label><input value={location} onChange={e=>setLocation(e.target.value)}/></div></>}</div>
    <div className="field"><label>Observații</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div><button className="btn" disabled={saving||!lines.length}>{saving?"Se salvează…":"Adaugă în evidență"}</button><button type="button" className="btn secondary" style={{marginLeft:8}} onClick={onSourceConsumed}>Închide</button>
   </form>
  </div>}
  {error&&<p className="error">{error}</p>}{notice&&<p className="muted">{notice}</p>}
  <div style={{marginTop:18}}><h2>Obiecte înregistrate · {year}</h2><p className="muted">Afișează intrările cumpărate până la 31 decembrie și neieșite din evidență până la acea dată. Verifică fizic cantitățile la inventariere.</p>
   <div className="scroll"><table className="table"><thead><tr><th>Obiect</th><th>Factură / furnizor</th><th>Achiziție</th><th>Cant.</th><th>Cost unitar</th><th>Nr. inventar / serie</th><th>Stare</th><th>Responsabil / locație</th><th></th></tr></thead><tbody>
   {yearItems.map(item=><tr key={item.id}><td><b>{item.product_name}</b><div className="muted">{item.product_code||"—"}</div></td><td>{[item.invoice_series,item.invoice_number].filter(Boolean).join(" ")||"—"}<div className="muted">{item.supplier_name||"Furnizor"}</div></td><td>{item.purchase_date}</td><td>{item.quantity} {item.measuring_unit||""}</td><td>{money(Number(item.unit_cost))}</td><td>{item.inventory_number||"—"}<div className="muted">{item.serial_number||""}</div></td><td>{statusLabel(item.status)}{item.date_put_into_use&&<div className="muted">din {item.date_put_into_use}</div>}</td><td>{item.assigned_to||"—"}<div className="muted">{item.location||""}</div></td><td><button className="btn secondary" onClick={()=>beginEdit(item)}>Modifică stare</button></td></tr>)}
   {!yearItems.length&&<tr><td colSpan={9} className="muted">Nu există obiecte în evidență pentru acest an.</td></tr>}
   </tbody></table></div>
  </div>
  {editingId&&<div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(7,26,56,.48)",padding:16,display:"grid",placeItems:"center"}}><div role="dialog" aria-modal="true" className="panel" style={{width:"min(600px,100%)",margin:0}}><h2>Actualizează obiectul</h2><div className="grid"><div className="field"><label>Stare</label><select value={editStatus} onChange={e=>setEditStatus(e.target.value as InventoryItem["status"])}><option value="in_stoc">În stoc</option><option value="in_folosinta">În folosință</option><option value="scos_din_uz">Scos din uz</option><option value="casat">Casat</option></select></div>{editStatus==="in_folosinta"&&<div className="field"><label>Data dării în folosință</label><input type="date" value={editUseDate} onChange={e=>setEditUseDate(e.target.value)}/></div>}<div className="field"><label>Responsabil</label><input value={editAssignedTo} onChange={e=>setEditAssignedTo(e.target.value)}/></div><div className="field"><label>Locație</label><input value={editLocation} onChange={e=>setEditLocation(e.target.value)}/></div>{["scos_din_uz","casat"].includes(editStatus)&&<div className="field"><label>Data scoaterii</label><input type="date" value={editRetiredDate} onChange={e=>setEditRetiredDate(e.target.value)}/></div>}</div><button className="btn" onClick={()=>{const item=items.find(i=>i.id===editingId);if(item)saveEdit(item)}}>Salvează</button><button className="btn secondary" style={{marginLeft:8}} onClick={()=>setEditingId(null)}>Anulează</button></div></div>}
 </section>;
}
