"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ObjectItem = {
 id:number; product_name:string; product_code?:string|null; measuring_unit?:string|null; quantity:number; unit_cost:number;
 purchase_date:string; inventory_number?:string|null; serial_number?:string|null; status:"in_stoc"|"in_folosinta"|"scos_din_uz"|"casat";
 date_put_into_use?:string|null; assigned_to?:string|null; location?:string|null; date_retired?:string|null; notes?:string|null;
 supplier_name?:string|null; supplier_cif?:string|null; invoice_number?:string|null; invoice_series?:string|null; invoice_date?:string|null;
};
type StockReceipt = {
 id:number; product_name:string; product_code?:string|null; measuring_unit?:string|null; quantity:number; unit_cost:number;
 purchase_date:string; location?:string|null; categorie:"material"|"consumabil"; invoice_number?:string|null; invoice_series?:string|null; supplier_name?:string|null;
};
type StockProduct = {id:number;denumire:string;cod?:string|null;stoc:number;stoc_minim:number;activ:boolean};
type Props = { sourceInvoice:any; onSourceConsumed:()=>void };
const today=()=>new Date().toISOString().slice(0,10);
const money=(n:number)=>new Intl.NumberFormat("ro-RO",{style:"currency",currency:"RON"}).format(n||0);
const amount=(value:any)=>{const n=Number(String(value??"0").trim().replace(",", "."));return Number.isFinite(n)?n:0};
function grossUnitCost(line:any,invoice:any){const qty=amount(line?.quantity);const netLine=amount(line?.line_total??line?.lineTotal);const tax=amount(line?.tax_amount??line?.taxAmount);const rawRate=line?.tax_percent??line?.taxPercent;const percent=amount(rawRate);const subtotal=amount(invoice?.subtotal);const invoiceTax=amount(invoice?.tax_total??invoice?.vatTotal)||Math.max(0,amount(invoice?.invoice_total??invoice?.total)-subtotal);const hasLineRate=rawRate!==null&&rawRate!==undefined&&String(rawRate).trim()!=="";const effectiveRate=hasLineRate?percent:(subtotal>0&&invoiceTax>0?invoiceTax/subtotal*100:0);if(qty>0&&netLine>0){if(tax>0)return Math.round(((netLine+tax)/qty)*100)/100;if(effectiveRate>0)return Math.round((netLine*(1+effectiveRate/100)/qty)*100)/100;return Math.round((netLine/qty)*100)/100;}const unit=amount(line?.unit_price??line?.unitPrice);return Math.round((unit*(1+effectiveRate/100))*100)/100;}
const cleanCsv=(v:any)=>{const s=String(v??"");return /^[=+@\-]/.test(s)?"'"+s:s};
const csvCell=(v:any)=>'"'+cleanCsv(v).replace(/"/g,'""')+'"';

export default function InventoryRegister({sourceInvoice,onSourceConsumed}:Props){
 const [objects,setObjects]=useState<ObjectItem[]>([]);
 const [stockReceipts,setStockReceipts]=useState<StockReceipt[]>([]);
 const [stockProducts,setStockProducts]=useState<StockProduct[]>([]),[stockSearch,setStockSearch]=useState("");
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [year,setYear]=useState(String(new Date().getFullYear()));
 const [recordType,setRecordType]=useState<"stoc"|"obiect">("stoc"),[category,setCategory]=useState<"material"|"consumabil">("material");
 const [lineIndex,setLineIndex]=useState("0"),[quantity,setQuantity]=useState("1"),[unitCost,setUnitCost]=useState("0"),[purchaseDate,setPurchaseDate]=useState("");
 const [inventoryNumber,setInventoryNumber]=useState(""),[serialNumber,setSerialNumber]=useState(""),[status,setStatus]=useState<ObjectItem["status"]>("in_stoc");
 const [useDate,setUseDate]=useState(""),[assignedTo,setAssignedTo]=useState(""),[location,setLocation]=useState(""),[notes,setNotes]=useState("");
 const [editingId,setEditingId]=useState<number|null>(null),[editStatus,setEditStatus]=useState<ObjectItem["status"]>("in_stoc"),[editUseDate,setEditUseDate]=useState(""),[editAssignedTo,setEditAssignedTo]=useState(""),[editLocation,setEditLocation]=useState(""),[editRetiredDate,setEditRetiredDate]=useState("");
 const invoice=sourceInvoice?.invoice||{},doc=sourceInvoice?.doc||{},lines=Array.isArray(invoice.lines)?invoice.lines:[];
 const sourceKey=String(sourceInvoice?.id||"");
 useEffect(()=>{load();},[]);
 useEffect(()=>{
  if(!sourceKey)return;
  const line=lines[0]||{};
  setLineIndex("0");setRecordType("stoc");setCategory("material");setQuantity(String(line.quantity||1));
  setUnitCost(String(grossUnitCost(line,invoice)));setPurchaseDate(String(invoice.invoice_date||today()).slice(0,10));
  setInventoryNumber("");setSerialNumber("");setStatus("in_stoc");setUseDate("");setAssignedTo("");setLocation("");setNotes("");
 },[sourceKey]);
 async function load(){
  setLoading(true);setError("");
  const [{data:objectRows,error:objectError},{data:stockRows,error:stockError},{data:productRows,error:productError}]=await Promise.all([
   supabase.from("obiecte_inventar").select("*").order("purchase_date",{ascending:false}).order("id",{ascending:false}),
   supabase.from("receptii_stoc").select("*").order("purchase_date",{ascending:false}).order("id",{ascending:false}),
   supabase.from("produse_catalog").select("id,denumire,cod,stoc,stoc_minim,activ").eq("activ",true).order("denumire")
  ]);
  if(objectError||stockError||productError)setError((objectError||stockError||productError)?.message||"Nu s-au putut încărca evidențele.");
  else{setObjects(objectRows||[]);setStockReceipts(stockRows||[]);setStockProducts(productRows||[])}
  setLoading(false);
 }
 const chosenLine=lines[Number(lineIndex)]||null;
 const yearObjects=useMemo(()=>{const end=String(year)+"-12-31";return objects.filter(x=>x.purchase_date<=end&&(!x.date_retired||x.date_retired>end));},[objects,year]);
 const stockTotals=stockProducts;
 async function addFromInvoice(event:any){
  event.preventDefault();setError("");setNotice("");
  if(!sourceInvoice||!chosenLine){setError("Alege o poziție de pe factura SPV.");return}
  const qty=Number(quantity),cost=Number(unitCost);
  if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(cost)||cost<0){setError("Cantitatea sau costul unitar nu este valid.");return}
  if(recordType==="obiect"&&status==="in_folosinta"&&!useDate){setError("Completează data dării în folosință.");return}
  setSaving(true);
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const common={cui_entitate:"43594993",anaf_message_id:sourceKey,anaf_cif:String(doc.cif||"43594993"),invoice_series:invoice.invoice_series||null,invoice_number:invoice.invoice_number||null,invoice_date:invoice.invoice_date||null,supplier_name:invoice.supplier_name||doc.supplier_name||"Furnizor SPV",supplier_cif:invoice.supplier_cif||doc.sender_cif||null,line_index:Number(lineIndex),product_name:String(chosenLine.description||"Produs fără denumire"),product_code:chosenLine.code||chosenLine.item_code||null,measuring_unit:chosenLine.unit||null,quantity:qty,unit_cost:cost,purchase_date:purchaseDate||invoice.invoice_date||today(),created_by:user?.id||null};
   if(recordType==="obiect"){
    const {error}=await supabase.from("obiecte_inventar").insert({...common,inventory_number:inventoryNumber.trim()||null,serial_number:serialNumber.trim()||null,status,date_put_into_use:status==="in_folosinta"?(useDate||null):null,assigned_to:assignedTo.trim()||null,location:location.trim()||null,notes:notes.trim()||null});
    if(error)throw error;
    setNotice("Obiectul a fost adăugat în evidența obiectelor de inventar.");
   }else{
    const {error}=await supabase.rpc("app_register_supplier_stock_receipt",{p_anaf_cif:String(doc.cif||"43594993"),p_anaf_message_id:sourceKey,p_line_index:Number(lineIndex),p_invoice_series:common.invoice_series,p_invoice_number:common.invoice_number,p_invoice_date:common.invoice_date,p_supplier_name:common.supplier_name,p_supplier_cif:common.supplier_cif,p_product_name:common.product_name,p_product_code:common.product_code,p_measuring_unit:common.measuring_unit,p_category:category,p_quantity:qty,p_unit_cost:cost,p_purchase_date:common.purchase_date,p_location:location.trim()||null,p_notes:notes.trim()||null});
    if(error?.message?.includes("recepționată"))throw new Error("Această poziție din factura SPV a fost deja recepționată în aplicație.");
    if(error)throw error;
    setNotice("Poziția a fost recepționată în catalogul și stocul aplicației de deranjamente.");
   }
   await load();onSourceConsumed();
  }catch(e:any){setError(e.message||"Recepția nu a putut fi salvată.");}
  finally{setSaving(false)}
 }
 function downloadCsv(name:string,header:string[],rows:any[][]){
  const csv="\uFEFF"+[header,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
 }
 function exportObjects(){downloadCsv("obiecte-inventar-"+year+".csv",["Denumire","Cod produs","Cantitate","UM","Valoare unitara","Data achizitiei","Furnizor","CUI furnizor","Factura","Nr inventar","Serie produs","Stare","Data folosinta","Responsabil","Locatie","Data scoatere","Observatii"],yearObjects.map(x=>[x.product_name,x.product_code,x.quantity,x.measuring_unit,x.unit_cost,x.purchase_date,x.supplier_name,x.supplier_cif,[x.invoice_series,x.invoice_number].filter(Boolean).join(" "),x.inventory_number,x.serial_number,statusLabel(x.status),x.date_put_into_use,x.assigned_to,x.location,x.date_retired,x.notes]))}
 function exportStock(){downloadCsv("receptii-stoc-"+year+".csv",["Denumire","Cod","Categorie","Cantitate","UM","Cost unitar","Data","Furnizor","Factura","Gestiune"],stockReceipts.filter(x=>x.purchase_date<=year+"-12-31").map(x=>[x.product_name,x.product_code,x.categorie==="consumabil"?"Consumabil":"Material / piesă",x.quantity,x.measuring_unit,x.unit_cost,x.purchase_date,x.supplier_name,[x.invoice_series,x.invoice_number].filter(Boolean).join(" "),x.location]))}
 async function saveEdit(item:ObjectItem){
  setError("");if(editStatus==="in_folosinta"&&!editUseDate){setError("Completează data dării în folosință.");return}
  const patch={status:editStatus,date_put_into_use:editStatus==="in_folosinta"?editUseDate||null:item.date_put_into_use||null,assigned_to:editAssignedTo.trim()||null,location:editLocation.trim()||null,date_retired:["scos_din_uz","casat"].includes(editStatus)?editRetiredDate||today():null,updated_at:new Date().toISOString()};
  const {error}=await supabase.from("obiecte_inventar").update(patch).eq("id",item.id);if(error){setError(error.message);return}
  setEditingId(null);await load();setNotice("Evidența obiectului a fost actualizată.");
 }
 function beginEdit(x:ObjectItem){setEditingId(x.id);setEditStatus(x.status);setEditUseDate(x.date_put_into_use||today());setEditAssignedTo(x.assigned_to||"");setEditLocation(x.location||"");setEditRetiredDate(x.date_retired||today())}
 function statusLabel(value:string){return value==="in_stoc"?"În stoc":value==="in_folosinta"?"În folosință":value==="scos_din_uz"?"Scos din uz":"Casat"}
 return <section className="panel no-print">
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h1>Stocuri și obiecte de inventar</h1><p className="muted">Recepționează produsele facturate direct în aplicație, fără un program extern.</p></div><div style={{display:"flex",gap:8}}><label className="field" style={{margin:0}}>Anul evidenței<input type="number" min="2000" max="2100" value={year} onChange={e=>setYear(e.target.value)}/></label><button className="btn secondary" onClick={exportStock} disabled={!stockReceipts.length}>Export stoc CSV</button><button className="btn secondary" onClick={exportObjects} disabled={!yearObjects.length}>Export obiecte CSV</button><button className="btn secondary" onClick={load} disabled={loading}>{loading?"Se încarcă…":"Reîncarcă"}</button></div></div>
  {sourceInvoice&&<div className="panel" style={{marginTop:16,background:"#f4f8ff",border:"1px solid #cbdaf0"}}>
   <h2>Recepție din factura SPV</h2><p className="muted">Factura: {invoice.invoice_number||"—"} · {invoice.supplier_name||doc.supplier_name||"Furnizor SPV"} · {invoice.invoice_date||"—"}</p>
   <form onSubmit={addFromInvoice}>
    <div className="grid"><div className="field"><label>Tip evidență</label><select value={recordType} onChange={e=>setRecordType(e.target.value as "stoc"|"obiect")}><option value="stoc">Material / consumabil în stoc</option><option value="obiect">Obiect de inventar</option></select></div>{recordType==="stoc"&&<div className="field"><label>Categorie</label><select value={category} onChange={e=>setCategory(e.target.value as "material"|"consumabil")}><option value="material">Material / piesă</option><option value="consumabil">Consumabil</option></select></div>}
     <div className="field"><label>Poziția de pe factură</label><select value={lineIndex} onChange={e=>{setLineIndex(e.target.value);const l=lines[Number(e.target.value)];setQuantity(String(l?.quantity||1));setUnitCost(String(grossUnitCost(l,invoice)))}}>{lines.map((line:any,index:number)=><option key={index} value={index}>{line.description||"Produs"} · {line.quantity||1} {line.unit||"buc"}</option>)}</select></div>
     <div className="field"><label>Cantitate recepționată</label><input type="number" min="0.001" step="0.001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></div><div className="field"><label>Cost unitar cu TVA inclus (RON)</label><input type="number" min="0" step="0.01" value={unitCost} onChange={e=>setUnitCost(e.target.value)}/></div><div className="field"><label>Data recepției</label><input type="date" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></div>
    </div>
    {recordType==="obiect"?<div className="grid"><div className="field"><label>Număr de inventar</label><input value={inventoryNumber} onChange={e=>setInventoryNumber(e.target.value)} placeholder="Opțional"/></div><div className="field"><label>Serie produs</label><input value={serialNumber} onChange={e=>setSerialNumber(e.target.value)} placeholder="Opțional"/></div><div className="field"><label>Stare</label><select value={status} onChange={e=>setStatus(e.target.value as ObjectItem["status"])}><option value="in_stoc">În stoc</option><option value="in_folosinta">În folosință</option><option value="scos_din_uz">Scos din uz</option><option value="casat">Casat</option></select></div>{status==="in_folosinta"&&<><div className="field"><label>Data dării în folosință</label><input type="date" value={useDate} onChange={e=>setUseDate(e.target.value)}/></div><div className="field"><label>Responsabil / persoană</label><input value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}/></div><div className="field"><label>Locație</label><input value={location} onChange={e=>setLocation(e.target.value)}/></div></>}</div>:<div className="grid"><div className="field"><label>Gestiune / locație</label><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Ex. Magazie"/></div><div className="field"><label>Observații</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div></div>}
    {recordType==="obiect"&&<div className="field"><label>Observații</label><input value={notes} onChange={e=>setNotes(e.target.value)}/></div>}
    <button className="btn" disabled={saving||!lines.length}>{saving?"Se salvează…":recordType==="stoc"?"Recepționează în stoc":"Adaugă în evidența obiectelor"}</button><button type="button" className="btn secondary" style={{marginLeft:8}} onClick={onSourceConsumed}>Închide</button>
   </form>
  </div>}
  {error&&<p className="error">{error}</p>}{notice&&<p className="muted">{notice}</p>}
  <div style={{marginTop:18}}><h2>Catalog și stoc curent · aplicația de deranjamente</h2><p className="muted">Recepțiile actualizează direct cantitatea disponibilă în catalogul comun folosit la fișele de intervenție. Ieșirile din fișele nu sunt încă legate automat de acest registru.</p><div className="field" style={{maxWidth:520,marginBottom:10}}><label htmlFor="stock-catalog-search">Caută produs</label><input id="stock-catalog-search" type="search" value={stockSearch} onChange={e=>setStockSearch(e.target.value)} placeholder="Denumire sau cod produs" aria-label="Caută în catalog după denumire sau cod"/><span className="muted">{filteredStockProducts.length} din {stockTotals.length} produse</span></div><div className="scroll"><table className="table"><thead><tr><th>Produs</th><th>Cod</th><th>Stoc</th><th>Stoc minim</th></tr></thead><tbody>{filteredStockProducts.map(x=><tr key={x.id}><td><b>{x.denumire}</b></td><td>{x.cod||"—"}</td><td>{x.stoc}</td><td>{x.stoc_minim}</td></tr>)}{!filteredStockProducts.length&&<tr><td colSpan={4} className="muted">{stockTotals.length?"Nu am găsit produse pentru căutarea aceasta.":"Nu sunt produse în catalogul activ."}</td></tr>}</tbody></table></div></div><div style={{marginTop:18}}><h2>Recepții din facturi SPV</h2><div className="scroll"><table className="table"><thead><tr><th>Produs</th><th>Factură / furnizor</th><th>Data</th><th>Categorie</th><th>Cantitate</th><th>Preț unitar</th></tr></thead><tbody>{stockReceipts.map(x=><tr key={x.id}><td>{x.product_name}</td><td>{[x.invoice_series,x.invoice_number].filter(Boolean).join(" ")||"—"}<div className="muted">{x.supplier_name||"Furnizor"}</div></td><td>{x.purchase_date}</td><td>{x.categorie==="consumabil"?"Consumabil":"Material / piesă"}</td><td>{x.quantity} {x.measuring_unit||""}</td><td>{money(Number(x.unit_cost))}</td></tr>)}{!stockReceipts.length&&<tr><td colSpan={6} className="muted">Nu există recepții înregistrate.</td></tr>}</tbody></table></div></div>
  <div style={{marginTop:18}}><h2>Obiecte de inventar · {year}</h2><p className="muted">Afișează intrările cumpărate până la 31 decembrie și neieșite din evidență până la acea dată. Verifică fizic cantitățile la inventariere.</p><div className="scroll"><table className="table"><thead><tr><th>Obiect</th><th>Factură / furnizor</th><th>Achiziție</th><th>Cant.</th><th>Cost unitar</th><th>Nr. inventar / serie</th><th>Stare</th><th>Responsabil / locație</th><th></th></tr></thead><tbody>
   {yearObjects.map(x=><tr key={x.id}><td><b>{x.product_name}</b><div className="muted">{x.product_code||"—"}</div></td><td>{[x.invoice_series,x.invoice_number].filter(Boolean).join(" ")||"—"}<div className="muted">{x.supplier_name||"Furnizor"}</div></td><td>{x.purchase_date}</td><td>{x.quantity} {x.measuring_unit||""}</td><td>{money(Number(x.unit_cost))}</td><td>{x.inventory_number||"—"}<div className="muted">{x.serial_number||""}</div></td><td>{statusLabel(x.status)}{x.date_put_into_use&&<div className="muted">din {x.date_put_into_use}</div>}</td><td>{x.assigned_to||"—"}<div className="muted">{x.location||""}</div></td><td><button className="btn secondary" onClick={()=>beginEdit(x)}>Modifică stare</button></td></tr>)}
   {!yearObjects.length&&<tr><td colSpan={9} className="muted">Nu există obiecte în evidență pentru acest an.</td></tr>}
  </tbody></table></div></div>
  {editingId&&<div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(7,26,56,.48)",padding:16,display:"grid",placeItems:"center"}}><div role="dialog" aria-modal="true" className="panel" style={{width:"min(600px,100%)",margin:0}}><h2>Actualizează obiectul</h2><div className="grid"><div className="field"><label>Stare</label><select value={editStatus} onChange={e=>setEditStatus(e.target.value as ObjectItem["status"])}><option value="in_stoc">În stoc</option><option value="in_folosinta">În folosință</option><option value="scos_din_uz">Scos din uz</option><option value="casat">Casat</option></select></div>{editStatus==="in_folosinta"&&<div className="field"><label>Data dării în folosință</label><input type="date" value={editUseDate} onChange={e=>setEditUseDate(e.target.value)}/></div>}<div className="field"><label>Responsabil</label><input value={editAssignedTo} onChange={e=>setEditAssignedTo(e.target.value)}/></div><div className="field"><label>Locație</label><input value={editLocation} onChange={e=>setEditLocation(e.target.value)}/></div>{["scos_din_uz","casat"].includes(editStatus)&&<div className="field"><label>Data scoaterii</label><input type="date" value={editRetiredDate} onChange={e=>setEditRetiredDate(e.target.value)}/></div>}</div><button className="btn" onClick={()=>{const item=objects.find(i=>i.id===editingId);if(item)saveEdit(item)}}>Salvează</button><button className="btn secondary" style={{marginLeft:8}} onClick={()=>setEditingId(null)}>Anulează</button></div></div>}
 </section>;
}
