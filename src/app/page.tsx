"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Client={id:string;tip_client:string;denumire:string;cui?:string;nr_reg_com?:string;adresa?:string;email?:string;telefon?:string};
type Line={descriere:string;cantitate:number;unitate:string;pret_unitar:number;cota_tva:number};
type Invoice={id:string;serie:string;numar:number;data_document:string;client_denumire:string;client_cui?:string;client_adresa?:string;total:number;status:string;total_incasat?:number;rest_de_plata?:number;status_incasare?:"achitata"|"partial"|"neachitata"};
const money=(n:number)=>new Intl.NumberFormat("ro-RO",{style:"currency",currency:"RON"}).format(n||0);
const today=()=>new Date().toISOString().slice(0,10);
export default function Home(){
 const [session,setSession]=useState<any>(null),[loading,setLoading]=useState(true),[tab,setTab]=useState("new"),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [clients,setClients]=useState<Client[]>([]),[invoices,setInvoices]=useState<Invoice[]>([]);
 const [clientId,setClientId]=useState(""),[clientName,setClientName]=useState(""),[cui,setCui]=useState(""),[reg,setReg]=useState(""),[address,setAddress]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState("");
 const [date,setDate]=useState(""),[due,setDue]=useState(""),[notes,setNotes]=useState("");
 const [lines,setLines]=useState<Line[]>([{descriere:"Servicii",cantitate:1,unitate:"buc",pret_unitar:0,cota_tva:0}]);
 const [current,setCurrent]=useState<any>(null),[loginEmail,setLoginEmail]=useState(""),[loginPass,setLoginPass]=useState("");
 const [newClient,setNewClient]=useState({denumire:"",cui:"",adresa:"",email:"",telefon:"",tip_client:"firma"});
 const [search,setSearch]=useState("");
 const [anafLoading,setAnafLoading]=useState(false),[anafMessage,setAnafMessage]=useState("");
 const [supplierCif,setSupplierCif]=useState("43594993"),[supplierDays,setSupplierDays]=useState("30"),[supplierLoading,setSupplierLoading]=useState(false),[supplierMessages,setSupplierMessages]=useState<any[]>([]),[supplierStatus,setSupplierStatus]=useState("");
 const [supplierPreview,setSupplierPreview]=useState<any>(null),[supplierPreviewLoading,setSupplierPreviewLoading]=useState(false),[courierReceipt,setCourierReceipt]=useState(""),[courierReceiptDate,setCourierReceiptDate]=useState(""),[supplierPaymentDate,setSupplierPaymentDate]=useState("");
 const [anafArchive,setAnafArchive]=useState<any[]>([]),[archiveLoading,setArchiveLoading]=useState(false),[archiveSearch,setArchiveSearch]=useState(""),[archiveBusyId,setArchiveBusyId]=useState(""),[archiveProgress,setArchiveProgress]=useState("");
 const [archiveInvoice,setArchiveInvoice]=useState<any>(null),[archiveInvoiceLoading,setArchiveInvoiceLoading]=useState(false),[archivePayments,setArchivePayments]=useState<any[]>([]);
 const [archivePayDate,setArchivePayDate]=useState(today()),[archivePayAmount,setArchivePayAmount]=useState(""),[archivePayMethod,setArchivePayMethod]=useState("banca"),[archivePayReference,setArchivePayReference]=useState(""),[archivePayNotes,setArchivePayNotes]=useState(""),[archivePaySaving,setArchivePaySaving]=useState(false);
 const [oblioEmail,setOblioEmail]=useState(""),[oblioSecret,setOblioSecret]=useState(""),[oblioCif,setOblioCif]=useState("43594993"),[oblioLoading,setOblioLoading]=useState(false),[oblioResult,setOblioResult]=useState<any>(null);
 const [oblioHistory,setOblioHistory]=useState<any>({documents:[],clients:0,collections:0});
 const [collectionDate,setCollectionDate]=useState(""),[collectionAmount,setCollectionAmount]=useState(""),[collectionMethod,setCollectionMethod]=useState("banca"),[collectionReference,setCollectionReference]=useState(""),[collectionNotes,setCollectionNotes]=useState(""),[collectionSaving,setCollectionSaving]=useState(false),[collectionKey,setCollectionKey]=useState("");

 useEffect(()=>{setDate(today());setCollectionDate(today())},[]);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(session)loadData()},[session]);
 useEffect(()=>{if(session&&tab==="import")loadOblioHistory()},[session,tab]);
 useEffect(()=>{if(session&&tab==="archive")loadAnafArchive()},[session,tab]);
 async function loadData(){setError("");const {data,error}=await supabase.rpc("app_bootstrap");if(error){setError(error.message);return}setClients(data?.clients||[]);setInvoices(data?.invoices||[])}
 const totals=useMemo(()=>lines.reduce((a,l)=>{const net=Math.round(Number(l.cantitate||0)*Number(l.pret_unitar||0)*100)/100;const vat=0;return {net:a.net+net,vat:a.vat,total:a.total+net}},{net:0,vat:0,total:0}),[lines]);
 async function loadOblioHistory(){const {data,error}=await supabase.rpc("app_list_oblio_imports");if(!error&&data)setOblioHistory(data)}
 async function importOblio(){setError("");setNotice("");setOblioResult(null);if(!oblioEmail.trim()||!oblioSecret.trim()||!oblioCif.trim()){setError("Completează datele de conectare Oblio și CUI-ul firmei.");return}setOblioLoading(true);try{const {data:{session:activeSession}}=await supabase.auth.getSession();const response=await fetch("/api/import/oblio",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${activeSession?.access_token||""}`},body:JSON.stringify({clientId:oblioEmail,clientSecret:oblioSecret,cif:oblioCif})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Importul Oblio a eșuat.");const {data:stored,error:storeError}=await supabase.rpc("app_import_oblio",{p_clients:data.clients,p_documents:data.documents});if(storeError)throw new Error("Datele au fost citite din Oblio, dar salvarea a eșuat: "+storeError.message);setOblioResult({...data,stored});setOblioSecret("");setNotice("Importul Oblio s-a încheiat. Datele au fost salvate fără a emite facturi noi.");await loadData();}catch(e:any){setError(e.message||"Importul nu a putut fi finalizat.");}finally{setOblioLoading(false)}}
 async function loadAnafArchive(){setArchiveLoading(true);setError("");setArchiveProgress("Se verifică documentele din arhivă…");try{const {data:{session:activeSession}}=await supabase.auth.getSession();const headers={Authorization:`Bearer ${activeSession?.access_token||""}`};const response=await fetch("/api/anaf/archive",{headers,cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Nu am putut încărca arhiva SPV.");let documents=data.documents||[];setAnafArchive(documents);const pending=documents.filter((doc:any)=>!doc.has_xml&&doc.anaf_message_id&&doc.cif);let saved=0,failed=0;for(let i=0;i<pending.length;i++){const doc=pending[i];setArchiveProgress("Arhivez automat documentul "+(i+1)+" din "+pending.length+"…");try{const download=await fetch("/api/anaf/download?cif="+encodeURIComponent(doc.cif)+"&id="+encodeURIComponent(doc.anaf_message_id),{cache:"no-store"});if(download.ok)saved++;else failed++;}catch{failed++;}}if(pending.length){const refreshed=await fetch("/api/anaf/archive",{headers,cache:"no-store"});const refreshedData=await refreshed.json();if(refreshed.ok){documents=refreshedData.documents||[];setAnafArchive(documents);}setArchiveProgress("Arhivare automată încheiată: "+saved+" salvate"+(failed?", "+failed+" nereușite":"")+".");}else{setArchiveProgress("Arhiva este actualizată. Toate documentele disponibile au XML-ul salvat.");}}catch(e:any){setError(e.message||"Arhiva SPV nu poate fi încărcată.");setArchiveProgress("");}finally{setArchiveLoading(false)}}
 async function openArchiveInvoice(doc:any){
  if(!doc.has_xml){setError("Factura nu are încă XML arhivat.");return}
  setArchiveInvoiceLoading(true);setError("");
  try{
   const {data:{session:activeSession}}=await supabase.auth.getSession();
   const response=await fetch("/api/anaf/archive?id="+encodeURIComponent(doc.anaf_message_id)+"&cif="+encodeURIComponent(doc.cif)+"&view=1",{headers:{Authorization:"Bearer "+(activeSession?.access_token||"")},cache:"no-store"});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Factura nu poate fi afișată.");
   const {data:payments,error}=await supabase.from("anaf_supplier_payments").select("*").eq("cif",doc.cif).eq("anaf_message_id",doc.anaf_message_id).order("payment_date",{ascending:true});
   if(error)throw error;setArchiveInvoice({...data,doc});setArchivePayments(payments||[]);
   setArchivePayDate(today());setArchivePayAmount("");setArchivePayMethod("banca");setArchivePayReference("");setArchivePayNotes("");
  }catch(e:any){setError(e.message||"Nu am putut deschide factura SPV.");}finally{setArchiveInvoiceLoading(false)}
 }
 async function saveArchivePayment(){
  if(!archiveInvoice?.doc)return;const amount=Number(archivePayAmount),total=Number(archiveInvoice.invoice?.invoice_total||0);
  const paid=archivePayments.reduce((sum,p)=>sum+Number(p.amount||0),0),remaining=Math.max(0,total-paid);
  if(!archivePayDate||!Number.isFinite(amount)||amount<=0){setError("Completează data și o sumă validă.");return}
  if(amount>remaining+0.001){setError("Suma depășește soldul rămas de "+money(remaining)+".");return}
  setArchivePaySaving(true);setError("");
  try{const {data:{user}}=await supabase.auth.getUser();const {data,error}=await supabase.from("anaf_supplier_payments").insert({cif:archiveInvoice.doc.cif,anaf_message_id:archiveInvoice.id,payment_date:archivePayDate,amount,method:archivePayMethod,reference:archivePayReference||null,notes:archivePayNotes||null,created_by:user?.id}).select().single();if(error)throw error;
   setArchivePayments(old=>[...old,data]);setArchivePayAmount("");setArchivePayReference("");setArchivePayNotes("");setNotice("Plata a fost înregistrată. În RJIP o vom prelua separat, la data plății efective.");
  }catch(e:any){setError(e.message||"Plata nu a putut fi salvată.");}finally{setArchivePaySaving(false)}
 }
 async function downloadArchivedXml(doc:any){setArchiveBusyId(doc.anaf_message_id);setError("");try{let response:Response;if(doc.has_xml){const {data:{session:activeSession}}=await supabase.auth.getSession();response=await fetch("/api/anaf/archive?id="+encodeURIComponent(doc.anaf_message_id)+"&cif="+encodeURIComponent(doc.cif),{headers:{Authorization:"Bearer "+(activeSession?.access_token||"")},cache:"no-store"});}else{response=await fetch("/api/anaf/download?cif="+encodeURIComponent(doc.cif)+"&id="+encodeURIComponent(doc.anaf_message_id),{cache:"no-store"});}if(!response.ok){const d=await response.json();throw new Error(d.error||"Documentul nu poate fi descărcat.");}const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="SPV-"+doc.anaf_message_id+".xml";a.click();URL.revokeObjectURL(url);if(!doc.has_xml)await loadAnafArchive();}catch(e:any){setError(e.message||"Descărcarea XML a eșuat.");}finally{setArchiveBusyId("");}}
 async function loadSupplierInvoices(){setSupplierLoading(true);setSupplierStatus("");setError("");try{const response=await fetch(`/api/anaf/invoices?cif=${encodeURIComponent(supplierCif)}&days=${supplierDays}`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Preluarea facturilor din SPV a eșuat.");setSupplierMessages(data.messages||[]);setSupplierStatus(data.count?`ANAF a returnat ${data.count} mesaje de tip factură primită.`:"ANAF nu a găsit facturi primite în intervalul selectat.");}catch(e:any){setSupplierStatus(e.message||"Nu am putut prelua facturile.");}finally{setSupplierLoading(false)}}
 async function previewSupplierInvoice(message:any){
  setSupplierPreviewLoading(true);setSupplierStatus("");
  try{const response=await fetch(`/api/anaf/download?cif=${encodeURIComponent(supplierCif)}&id=${encodeURIComponent(message.id)}&view=1`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Nu am putut citi factura.");setSupplierPreview({...data, message});setCourierReceipt("");setCourierReceiptDate("");setSupplierPaymentDate(data.invoice?.invoiceDate||"");}
  catch(e:any){setSupplierStatus(e.message||"Nu am putut afișa factura.");}finally{setSupplierPreviewLoading(false)}
 }
 async function importSupplierInvoice(){
  if(!supplierPreview?.invoice){return}
  const inv=supplierPreview.invoice;
  if(!inv.total||inv.total<=0){setSupplierStatus("Totalul facturii nu a putut fi extras din XML. Nu am importat o sumă incorectă.");return}
  setSupplierPreviewLoading(true);setSupplierStatus("");
  try{
   const {data:{session:activeSession}}=await supabase.auth.getSession();const response=await fetch("/api/anaf/import-rjip",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${activeSession?.access_token||""}`},body:JSON.stringify({cif:supplierCif,id:supplierPreview.id,invoice:inv,courierReceipt,courierReceiptDate,supplierPaymentDate})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Importul în RJIP a eșuat.");
   setSupplierStatus(data.duplicate?"Factura exista deja în RJIP; nu am creat o dublură.":"Factura a fost importată în RJIP, în așteptarea verificării plății bancare.");
   setSupplierPreview(null);
  }catch(e:any){setSupplierStatus(e.message||"Nu am putut importa factura în RJIP.");}finally{setSupplierPreviewLoading(false)}
 }
 async function signIn(e:any){e.preventDefault();setError("");const {error}=await supabase.auth.signInWithPassword({email:loginEmail,password:loginPass});if(error)setError(error.message)}
 async function signOut(){await supabase.auth.signOut();setSession(null)}
 async function lookupAnaf(){const clean=cui.replace(/^RO/i,"").replace(/\\D/g,"");if(!clean)return;setAnafLoading(true);setAnafMessage("");try{const r=await fetch("/api/anaf/cui",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cui:clean})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Interogarea ANAF a eșuat.");setClientName(d.denumire||clientName);setReg(d.nrRegCom||reg);setAddress(d.adresa||address);setCui(d.cui||clean);setClientId("");setAnafMessage("Date preluate din ANAF. Verifică informațiile înainte de emitere.");}catch(e:any){setAnafMessage(e.message||"Nu am putut prelua datele.");}finally{setAnafLoading(false)}}
 function pickClient(id:string){setClientId(id);const c=clients.find(x=>x.id===id);if(c){setClientName(c.denumire);setCui(c.cui||"");setReg(c.nr_reg_com||"");setAddress(c.adresa||"");setEmail(c.email||"");setPhone(c.telefon||"")}else{setClientName("");setCui("");setReg("");setAddress("");setEmail("");setPhone("")}}
 async function saveClient(e:any){e.preventDefault();setError("");const {data,error}=await supabase.rpc("app_save_client",{p_client:newClient});if(error){setError(error.message);return}await loadData();pickClient(data.id);setNotice("Client salvat.");setTab("new")}
 function previewDraft(){setError("");const items=lines.map((l,i)=>{const value=Math.round(Number(l.cantitate||0)*Number(l.pret_unitar||0)*100)/100;return {...l,id:"draft-"+i,valoare_totala:value}});const net=items.reduce((a,x)=>a+Number(x.valoare_totala),0);setCurrent({isDraftPreview:true,serie:"SE",numar:"—",data_document:date,data_scadenta:due,client_denumire:clientName||"Client",client_cui:cui,client_nr_reg_com:reg,client_adresa:address,client_email:email,items,total_fara_tva:net,total_tva:0,total:net,observatii:notes});setTab("preview")}
 async function issueInvoice(){setError("");setNotice("");if(!clientName.trim()){setError("Completează denumirea clientului.");return}if(lines.some(l=>!l.descriere.trim()||Number(l.cantitate)<=0)){setError("Verifică pozițiile facturii.");return}
 const payload={id:clientId||null,tip_client:"firma",denumire:clientName,cui,nr_reg_com:reg,adresa:address,email,telefon:phone,tara:"România"};
 const {data,error}=await supabase.rpc("app_issue_invoice",{p_client:payload,p_linii:lines.map((l,i)=>({...l,cota_tva:0,pozitie:i+1})),p_data:date,p_scadenta:due||null,p_observatii:notes||null});
 if(error){setError("Factura nu a fost emisă: "+error.message);return}
 const {data:invoice,error:readError}=await supabase.rpc("app_get_invoice",{p_id:data.id});
 if(readError){setError("Factura a fost emisă, dar nu am putut încărca detaliile: "+readError.message);return}
 setCurrent(invoice);await loadData();setTab("preview");setNotice("Factura "+data.serie+" "+data.numar+" a fost emisă și salvată în baza de date.");
 }
 async function openInvoice(id:string){const {data,error}=await supabase.rpc("app_get_invoice",{p_id:id});if(error){setError(error.message);return}setCurrent(data);setTab("preview")}
 function startCollection(invoice:any){
  setCurrent(invoice);
  setCollectionDate(today());
  setCollectionAmount(String(Number(invoice.rest_de_plata??invoice.total??0).toFixed(2)));
  setCollectionMethod("banca");
  setCollectionReference("");
  setCollectionNotes("");
  setCollectionKey(crypto.randomUUID());
  setError("");
  setNotice("");
  setTab("preview");
 }
 async function saveCollection(){
  if(!current?.id||current.isDraftPreview){setError("Încasarea poate fi înregistrată doar pentru o factură emisă.");return}
  const amount=Number(collectionAmount);
  const remaining=Number(current.rest_de_plata??current.total??0);
  if(!collectionDate){setError("Alege data încasării.");return}
  if(!Number.isFinite(amount)||amount<=0){setError("Introdu o sumă validă, mai mare decât zero.");return}
  if(amount>remaining+0.001){setError("Suma depășește restul de plată de "+money(remaining)+".");return}
  setCollectionSaving(true);setError("");setNotice("");
  try{
   const {data,error}=await supabase.rpc("app_register_collection",{
    p_factura_id:current.id,p_data:collectionDate,p_suma:amount,p_metoda:collectionMethod,
    p_referinta:collectionReference||null,p_observatii:collectionNotes||null,p_idempotency_key:collectionKey||crypto.randomUUID()
   });
   if(error)throw error;
   const {data:updated,error:readError}=await supabase.rpc("app_get_invoice",{p_id:current.id});
   if(readError)throw readError;
   setCurrent(updated);await loadData();
   setCollectionKey(crypto.randomUUID());
   setCollectionAmount(String(Number(updated.rest_de_plata||0).toFixed(2)));
   setCollectionReference("");setCollectionNotes("");
   setNotice(data?.duplicate?"Această încasare fusese deja înregistrată; nu am adăugat-o din nou.":"Încasarea a fost salvată. Rest de plată: "+money(Number(updated.rest_de_plata||0))+".");
  }catch(e:any){setError(e.message||"Încasarea nu a putut fi salvată.");}
  finally{setCollectionSaving(false)}
 }

 if(loading)return <main className="shell">Se încarcă…</main>;
 if(!session)return <main className="shell" style={{maxWidth:460,paddingTop:80}}><div className="panel"><img src="/service-electric-logo.svg" alt="SERVICE ELECTRIC by Cezar Gălățanu" style={{width:"100%",maxWidth:340,height:"auto",display:"block",margin:"0 auto 18px"}}/><h1>Facturare</h1><p className="muted">Autentifică-te pentru a emite facturi. Accesul este restricționat la contul autorizat.</p>{error&&<div className="error">{error}</div>}<form onSubmit={signIn}><div className="field"><label>E-mail</label><input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required/></div><div className="field"><label>Parolă</label><input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required/></div><button className="btn" style={{width:"100%"}}>Intră în aplicație</button></form></div></main>;
 return <main className="shell"><header className="top"><img src="/service-electric-logo.svg" alt="SERVICE ELECTRIC by Cezar Gălățanu" style={{width:340,maxWidth:"75%",height:"auto",display:"block"}}/><div className="no-print"><button className="btn secondary" onClick={signOut} aria-label="Ieșire din cont">Ieșire</button></div></header>
 {error&&<div className="error no-print">{error}</div>}{notice&&<div className="success no-print">{notice}</div>}
 <nav className="tabs no-print">{[["new","Factură nouă"],["invoices","Facturi emise"],["clients","Clienți"],["import","Import Oblio"],["spv","Preluare SPV"],["archive","Arhivă SPV"],["rjip","Registru-jurnal"]].map(([v,l])=><button key={v} className={"tab "+(tab===v?"active":"")} onClick={()=>{setTab(v);setError("");setNotice("")}}>{l}</button>)}</nav>
 {tab==="archive"&&<section className="panel no-print">
  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><h1>Arhivă facturi primite din SPV</h1><p className="muted">Documentele originale primite prin RO e-Factura, păstrate separat de registrul-jurnal. Informațiile sunt extrase din XML, fără modificarea documentului original.</p></div><button className="btn" onClick={loadAnafArchive} disabled={archiveLoading}>{archiveLoading?"Se actualizează…":"Reîncarcă arhiva"}</button></div>
  <div className="field"><label>Caută după furnizor, CUI, număr factură sau ID mesaj</label><input value={archiveSearch} onChange={e=>setArchiveSearch(e.target.value)} placeholder="Ex.: FAN Courier, 13838336 sau număr factură"/></div>
  <p className="muted">Mesaje SPV: {anafArchive.length} · XML-uri arhivate: {anafArchive.filter(x=>x.has_xml).length} · XML-uri de preluat: {anafArchive.filter(x=>!x.has_xml).length}</p>
  {archiveProgress&&<p className="muted" role="status">{archiveProgress}</p>}
  <div className="scroll"><table className="table"><thead><tr><th>Furnizor</th><th>Document</th><th>Primit în SPV</th><th>Valoare</th><th>Stare arhivă</th><th>Acțiuni</th></tr></thead><tbody>{anafArchive.filter(d=>(String(d.supplier_name||"")+" "+String(d.sender_cif||"")+" "+String(d.invoice_number||"")+" "+String(d.anaf_message_id||"")+" "+String(d.details||"")).toLowerCase().includes(archiveSearch.toLowerCase())).map(d=><tr key={d.id}>
   <td><strong>{d.supplier_name||"Furnizor neidentificat"}</strong><div className="muted">CUI {d.sender_cif||"—"}</div></td>
   <td><strong>{d.invoice_number||"Factură primită"}</strong><div className="muted">{d.invoice_date?new Date(d.invoice_date+"T00:00:00").toLocaleDateString("ro-RO"):"Data documentului indisponibilă"}</div></td>
   <td>{d.created_at_anaf?new Date(d.created_at_anaf).toLocaleString("ro-RO"):"—"}</td>
   <td>{d.invoice_total!=null?new Intl.NumberFormat("ro-RO",{style:"currency",currency:d.currency||"RON"}).format(Number(d.invoice_total)):"—"}</td>
   <td>{d.has_xml?<span style={{color:"#16804a",fontWeight:700}}>XML original arhivat</span>:<span className="muted">XML încă nedescărcat</span>}</td>
   <td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{d.has_xml&&<button className="btn" disabled={archiveInvoiceLoading} onClick={()=>openArchiveInvoice(d)}>Vezi factura</button>}<button className="btn secondary" disabled={archiveBusyId===d.anaf_message_id} onClick={()=>downloadArchivedXml(d)}>{archiveBusyId===d.anaf_message_id?"Se preia…":d.has_xml?"Descarcă XML original":"Preia XML"}</button></div><div className="muted" style={{marginTop:5}}>ID {d.anaf_message_id}</div></td>
  </tr>)}</tbody></table>{!anafArchive.length&&<p className="muted">Arhiva este goală. Preia facturile din SPV pentru a salva mesajele și documentele originale.</p>}</div>
 </section>}
 {archiveInvoice&&<section className="panel" style={{marginTop:18,border:"1px solid #b8cbe3"}}>
  <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h2 style={{margin:0}}>Factura primită – {archiveInvoice.invoice?.invoice_number||"SPV"}</h2><p className="muted">Previzualizare extrasă din XML-ul original, care rămâne nemodificat.</p></div><div style={{display:"flex",gap:8}}><button className="btn secondary" onClick={()=>window.print()}>Tipărește A4 / Salvează PDF</button><button className="btn secondary" onClick={()=>setArchiveInvoice(null)}>Închide</button></div></div>
  <div className="invoice-print" style={{maxWidth:850,margin:"18px auto",padding:24,color:"#111",fontFamily:"Arial,Helvetica,sans-serif"}}>
   <h1 style={{textAlign:"center"}}>FACTURĂ FURNIZOR</h1><div className="grid"><div><p><b>Furnizor:</b> {archiveInvoice.invoice?.supplier_name||archiveInvoice.doc?.supplier_name||"—"}</p><p><b>CUI:</b> {archiveInvoice.invoice?.supplier_cif||archiveInvoice.doc?.sender_cif||"—"}</p></div><div><p><b>Număr:</b> {archiveInvoice.invoice?.invoice_number||"—"}</p><p><b>Data:</b> {archiveInvoice.invoice?.invoice_date||"—"} · <b>Scadență:</b> {archiveInvoice.invoice?.due_date||"—"}</p></div></div>
   <div className="scroll"><table className="table"><thead><tr><th>Descriere</th><th>Cantitate</th><th>Preț unitar</th><th>Valoare</th></tr></thead><tbody>{(archiveInvoice.invoice?.lines||[]).map((line:any,i:number)=><tr key={i}><td>{line.description}</td><td>{line.quantity} {line.unit}</td><td>{line.unit_price}</td><td>{line.line_total}</td></tr>)}</tbody></table></div>
   <h2 style={{textAlign:"right"}}>TOTAL: {money(Number(archiveInvoice.invoice?.invoice_total||0))} {archiveInvoice.invoice?.currency||"RON"}</h2><p className="muted">Pentru documentul electronic original, descarcă XML-ul din arhivă.</p>
  </div>
  <div className="no-print" style={{borderTop:"1px solid #dbe3ee",paddingTop:18}}>
   <h3>Plăți înregistrate</h3>{(()=>{const total=Number(archiveInvoice.invoice?.invoice_total||0),paid=archivePayments.reduce((s,p)=>s+Number(p.amount||0),0),rest=Math.max(0,total-paid);return <><p><b>Total:</b> {money(total)} · <b>Achitat:</b> {money(paid)} · <b>Rest:</b> {money(rest)} · <b>{rest<=0?"ACHITATĂ":paid>0?"PLATĂ PARȚIALĂ":"NEACHITATĂ"}</b></p>{rest>0&&<div className="grid">
    <div className="field"><label>Data plății</label><input type="date" value={archivePayDate} onChange={e=>setArchivePayDate(e.target.value)}/></div><div className="field"><label>Sumă plătită</label><input type="number" min="0.01" max={rest} step="0.01" value={archivePayAmount} onChange={e=>setArchivePayAmount(e.target.value)} placeholder={rest.toFixed(2)}/></div>
    <div className="field"><label>Modalitate</label><select value={archivePayMethod} onChange={e=>setArchivePayMethod(e.target.value)}><option value="numerar">Numerar</option><option value="card">Card / POS</option><option value="banca">OP / Transfer bancar</option></select></div><div className="field"><label>Referință / document</label><input value={archivePayReference} onChange={e=>setArchivePayReference(e.target.value)} placeholder="Număr OP, bon etc."/></div><div className="field"><label>Observații</label><input value={archivePayNotes} onChange={e=>setArchivePayNotes(e.target.value)}/></div>
   </div>}<button className="btn" disabled={archivePaySaving||rest<=0} onClick={saveArchivePayment}>{archivePaySaving?"Se salvează…":"Adaugă plata"}</button></>})()}
   {archivePayments.length>0&&<div className="scroll"><table className="table"><thead><tr><th>Data</th><th>Modalitate</th><th>Referință</th><th>Sumă</th></tr></thead><tbody>{archivePayments.map((p:any)=><tr key={p.id}><td>{p.payment_date}</td><td>{p.method==="numerar"?"Numerar":p.method==="card"?"Card / POS":"OP / Transfer bancar"}</td><td>{p.reference||"—"}</td><td>{money(Number(p.amount))}</td></tr>)}</tbody></table></div>}
   <p className="muted">Plățile sunt evidențiate separat. Înregistrarea în Registrul-jurnal se face separat, la data plății efective.</p>
  </div>
 </section>}
 {tab==="spv"&&<section className="panel no-print">
  <h1>Facturi furnizori – ANAF SPV</h1>
  <p className="muted">Certificatul ANAF este conectat. Preia facturile primite în SPV și verifică documentele înainte de asocierea lor cu plățile din registrul-jurnal.</p>
  <div className="panel" style={{background:"#f7f9fc",border:"1px solid #e3e8ef",marginTop:18}}>
   <h2><span style={{color:"#15803d"}}>● Conectat la ANAF</span></h2>
   <div className="grid">
    <div className="field"><label>CUI întreprinderii</label><input value={supplierCif} onChange={e=>setSupplierCif(e.target.value)} placeholder="CUI fără RO"/></div>
    <div className="field"><label>Perioadă de căutare</label><select value={supplierDays} onChange={e=>setSupplierDays(e.target.value)}><option value="7">Ultimele 7 zile</option><option value="30">Ultimele 30 zile</option><option value="60">Ultimele 60 zile</option></select></div>
   </div>
   <button className="btn" disabled={supplierLoading} onClick={loadSupplierInvoices}>{supplierLoading?"Se caută în SPV…":"Preia facturile primite"}</button>
   {supplierStatus&&<p className="muted" style={{marginTop:12}}>{supplierStatus}</p>}
  </div>
  {supplierMessages.length>0&&<div style={{marginTop:20}}>
   <h2>Mesaje e-Factura primite</h2>
   <div className="scroll"><table className="table"><thead><tr><th>Data</th><th>Furnizor (CUI)</th><th>Tip</th><th>Detalii</th><th>ID ANAF</th><th>XML</th></tr></thead>
   <tbody>{supplierMessages.map((m,i)=><tr key={m.id||i}><td>{m.date?new Date(m.date).toLocaleString("ro-RO"):"—"}</td><td>{m.supplierCif||"—"}</td><td>{m.type||"—"}</td><td>{m.details||"—"}</td><td>{m.id||"—"}</td><td><button className="btn secondary" disabled={!m.id||supplierPreviewLoading} onClick={()=>previewSupplierInvoice(m)}>Vezi factura</button><button className="btn secondary" style={{marginTop:6}} disabled={!m.id} onClick={()=>window.location.assign(`/api/anaf/download?cif=${encodeURIComponent(supplierCif)}&id=${encodeURIComponent(m.id)}`)}>XML</button></td></tr>)}</tbody></table></div>
  </div>}
  {supplierPreview&&<div className="panel" style={{marginTop:18,border:"1px solid #b8cbe3"}}>
   <h2>Factura furnizor – previzualizare</h2>
   <div className="grid">
    <div><p><b>Furnizor:</b> {supplierPreview.invoice.supplierName||supplierPreview.message?.supplierCif||"—"}</p><p><b>CUI:</b> {supplierPreview.invoice.supplierCif||supplierPreview.message?.supplierCif||"—"}</p><p><b>Factură:</b> {supplierPreview.invoice.invoiceNumber||"—"}</p><p><b>Data:</b> {supplierPreview.invoice.invoiceDate||"—"}</p></div>
    <div><p><b>Scadență:</b> {supplierPreview.invoice.dueDate||"—"}</p><p><b>Total:</b> {money(Number(supplierPreview.invoice.total||0))} {supplierPreview.invoice.currency||"RON"}</p><p><b>Articole:</b> {supplierPreview.invoice.lines?.length||0}</p></div>
   </div>
   {supplierPreview.invoice.lines?.length>0&&<div className="scroll"><table className="table"><thead><tr><th>Descriere</th><th>Cantitate</th><th>Preț unitar</th><th>Total</th></tr></thead><tbody>{supplierPreview.invoice.lines.map((line:any,i:number)=><tr key={i}><td>{line.description}</td><td>{line.quantity||"—"}</td><td>{line.unitPrice||"—"}</td><td>{line.lineTotal||"—"}</td></tr>)}</tbody></table></div>}
   <h3>Detalii pentru RJIP</h3>
   <div className="grid">
    <div className="field"><label>Număr bon curier (dacă există)</label><input value={courierReceipt} onChange={e=>setCourierReceipt(e.target.value)} placeholder="Bon / AWB / chitanță"/></div>
    <div className="field"><label>Data bonului curier</label><input type="date" value={courierReceiptDate} onChange={e=>setCourierReceiptDate(e.target.value)}/></div>
    <div className="field"><label>Data plății prin bancă</label><input type="date" value={supplierPaymentDate} onChange={e=>setSupplierPaymentDate(e.target.value)}/></div>
   </div>
   <p className="muted">Factura se importă ca operațiune în așteptare. Metoda de plată este banca; nu intră în soldurile RJIP până la confirmarea plății.</p>
   <button className="btn" disabled={supplierPreviewLoading||!supplierPreview.invoice.total} onClick={importSupplierInvoice}>{supplierPreviewLoading?"Se procesează…":"Importă factura în RJIP"}</button>
   <button className="btn secondary" style={{marginLeft:8}} onClick={()=>setSupplierPreview(null)}>Închide</button>
  </div>}
  <p className="muted" style={{marginTop:18,fontSize:13}}>Documentele preluate nu generează automat cheltuieli în registrul-jurnal. Înregistrarea se va face numai după verificarea documentului și a plății.</p>
 </section>}
 {tab==="rjip"&&<section className="panel no-print" style={{padding:0,overflow:"hidden"}}><iframe title="Registru-jurnal" src="/registru-jurnal.html" onLoad={e=>{const frame=e.currentTarget;const doc=frame.contentDocument;if(!doc)return;const resize=()=>{frame.style.height=Math.max(doc.documentElement.scrollHeight,doc.body.scrollHeight)+"px"};resize();new ResizeObserver(resize).observe(doc.body);}} style={{display:"block",width:"100%",height:"1200px",border:0,background:"#f3f6fa"}}/></section>}
 {tab==="import"&&<>
  <div className="panel no-print">
   <h1>Import istoric din Oblio</h1>
   <p className="muted">Importă clienții, facturile emise și încasările asociate. Documentele sunt păstrate în registrul separat de importuri; nu se reemit și nu modifică seria SE.</p>
   <div className="grid">
    <div className="field"><label>E-mail cont Oblio</label><input type="email" value={oblioEmail} onChange={e=>setOblioEmail(e.target.value)} placeholder="E-mailul de autentificare Oblio"/></div>
    <div className="field"><label>CUI firmă în Oblio</label><input value={oblioCif} onChange={e=>setOblioCif(e.target.value)}/></div>
   </div>
   <div className="field"><label>Token API Oblio (Setări → Date cont)</label><input type="password" autoComplete="off" value={oblioSecret} onChange={e=>setOblioSecret(e.target.value)} placeholder="Introdu tokenul API"/></div>
   <p className="muted">Tokenul API este folosit doar pentru această operațiune și nu este salvat în aplicație. Recomand să îl copiezi direct din contul Oblio.</p>
   <button className="btn" disabled={oblioLoading} onClick={importOblio}>{oblioLoading?"Se preiau datele din Oblio…":"Conectează și importă istoricul"}</button>
   {oblioResult&&<div className="success" style={{marginTop:16}}><b>Import finalizat</b><p>Clienți procesați: {oblioResult.stored?.clients??oblioResult.counts?.clients??0}</p><p>Facturi procesate: {oblioResult.stored?.documents??oblioResult.counts?.documents??0}</p><p>Încasări procesate: {oblioResult.stored?.collections??oblioResult.counts?.collections??0}</p><p className="muted">Facturile importate rămân marcate ca istoric extern și nu intră în numerotarea seriei SE.</p></div>}
  </div>
  <div className="panel" style={{marginTop:18}}>
   <h2>Istoric importat din Oblio</h2>
   <p className="muted">Clienți importați: {oblioHistory.clients||0} · Încasări importate: {oblioHistory.collections||0} · Facturi: {(oblioHistory.documents||[]).length} afișate</p>
   <div className="scroll"><table className="table">
    <thead><tr><th>Document</th><th>Data</th><th>Client</th><th>Total</th><th>Stare</th></tr></thead>
    <tbody>
     {(oblioHistory.documents||[]).map((d:any)=>(
      <tr key={d.id_extern}>
       <td>{d.serie} {d.numar}</td><td>{d.data_document||"—"}</td><td>{d.client_denumire||"—"}</td><td>{money(Number(d.total||0))}</td><td>{d.status}</td>
      </tr>
     ))}
    </tbody>
   </table></div>
  </div>
 </>}
 {tab==="new"&&<div className="panel no-print"><h1>Emitere factură</h1><div className="grid"><div><h3>Client</h3><div className="field"><label>Alege client salvat</label><select value={clientId} onChange={e=>pickClient(e.target.value)}><option value="">Client nou / completează manual</option>{clients.map(c=><option key={c.id} value={c.id}>{c.denumire}</option>)}</select></div><div className="field"><label>Denumire client</label><input value={clientName} onChange={e=>setClientName(e.target.value)} required/></div><div className="field"><label>CUI</label><input value={cui} onChange={e=>{setCui(e.target.value);setAnafMessage("");}} onBlur={()=>{if(cui.trim().length>=2&&!anafLoading)lookupAnaf()}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();lookupAnaf()}}} placeholder="Introdu CUI-ul firmei"/><button type="button" className="btn secondary" disabled={anafLoading||!cui.trim()} onClick={lookupAnaf}>{anafLoading?"Se verifică la ANAF…":"Preia datele din ANAF"}</button>{anafMessage&&<p className="muted">{anafMessage}</p>}</div><div className="field"><label>Nr. Registrul Comerțului</label><input value={reg} onChange={e=>setReg(e.target.value)}/></div><div className="field"><label>Adresă</label><input value={address} onChange={e=>setAddress(e.target.value)}/></div><div className="grid"><div className="field"><label>E-mail</label><input value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label>Telefon</label><input value={phone} onChange={e=>setPhone(e.target.value)}/></div></div></div><div><h3>Detalii factură</h3><div className="field"><label>Data emiterii</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div className="field"><label>Data scadenței</label><input type="date" value={due} onChange={e=>setDue(e.target.value)}/></div><div className="field"><label>Observații</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></div><p className="muted">Seria SE și numărul se alocă automat la emitere.</p></div></div>
 <h3>Produse și servicii</h3><div style={{display:"grid",gap:10}}>{lines.map((l,i)=><div className="line" key={i}><div className="field wide"><label>Descriere</label><input value={l.descriere} onChange={e=>setLines(old=>old.map((x,j)=>j===i?{...x,descriere:e.target.value}:x))}/></div><div className="field"><label>Cant.</label><input type="number" min="0.001" step="0.001" value={l.cantitate} onChange={e=>setLines(old=>old.map((x,j)=>j===i?{...x,cantitate:Number(e.target.value)}:x))}/></div><div className="field"><label>Preț unitar</label><input type="number" min="0" step="0.01" value={l.pret_unitar} onChange={e=>setLines(old=>old.map((x,j)=>j===i?{...x,pret_unitar:Number(e.target.value)}:x))}/></div><div className="field"><label>U.M.</label><input value={l.unitate} onChange={e=>setLines(old=>old.map((x,j)=>j===i?{...x,unitate:e.target.value}:x))}/></div><button className="btn danger" style={{marginBottom:12}} onClick={()=>setLines(old=>old.filter((_,j)=>j!==i))}>×</button></div>)}</div><button className="btn secondary" onClick={()=>setLines(old=>[...old,{descriere:"",cantitate:1,unitate:"buc",pret_unitar:0,cota_tva:0}])}>+ Adaugă poziție</button>
 <div style={{display:"flex",justifyContent:"flex-end",marginTop:22}}><div style={{minWidth:260}}><p>Valoare servicii și produse: <b>{money(totals.net)}</b></p><div className="total">Total de plată: {money(totals.total)}</div><button className="btn secondary" style={{width:"100%",marginTop:14}} onClick={previewDraft}>Previzualizează factura</button><button className="btn" style={{width:"100%",marginTop:8}} onClick={issueInvoice}>Emite și salvează factura</button></div></div></div>}
 {tab==="invoices"&&<div className="panel no-print"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h1>Facturi emise</h1><button className="btn" onClick={()=>setTab("new")}>+ Factură nouă</button></div><div className="field"><label>Caută client / serie / număr</label><input value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="scroll"><table className="table"><thead><tr><th>Factura</th><th>Data</th><th>Client</th><th>Total</th><th>Status factură</th><th>Încasat</th><th>Rest</th><th>Status încasare</th><th></th></tr></thead><tbody>{invoices.filter(f=>(f.client_denumire+" "+f.serie+" "+f.numar).toLowerCase().includes(search.toLowerCase())).map(f=><tr key={f.id}><td>{f.serie} {f.numar}</td><td>{f.data_document}</td><td>{f.client_denumire}</td><td>{money(Number(f.total))}</td><td>{f.status}</td><td>{money(Number(f.total_incasat||0))}</td><td>{money(Number(f.rest_de_plata??f.total??0))}</td><td>{f.status_incasare==="achitata"?"Achitată":f.status_incasare==="partial"?"Parțial":"Neîncasată"}</td><td style={{display:"flex",gap:6}}><button className="btn secondary" onClick={()=>openInvoice(f.id)}>Deschide</button>{Number(f.rest_de_plata??f.total)>0&&<button className="btn" onClick={()=>startCollection(f)}>Încasează</button>}</td></tr>)}</tbody></table>{!invoices.length&&<p className="muted">Nu există facturi emise.</p>}</div></div>}
 {tab==="clients"&&<div className="grid no-print"><div className="panel"><h2>Adaugă client</h2><form onSubmit={saveClient}>{([["denumire","Denumire"],["cui","CUI / CNP"],["adresa","Adresă"],["email","E-mail"],["telefon","Telefon"]] as const).map(([k,l])=><div className="field" key={k}><label>{l}</label><input value={(newClient as any)[k]} onChange={e=>setNewClient(o=>({...o,[k]:e.target.value}))} required={k==="denumire"}/></div>)}<button className="btn">Salvează client</button></form></div><div className="panel"><h2>Clienți salvați</h2>{clients.map(c=><div key={c.id} style={{padding:"10px 0",borderBottom:"1px solid #eee"}}><b>{c.denumire}</b><div className="muted">{c.cui||"Fără CUI"} · {c.adresa||""}</div></div>)}{!clients.length&&<p className="muted">Nu există clienți salvați.</p>}</div></div>}
 {tab==="preview"&&current&&<div className="panel">
  <div className="no-print" style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
   <button className="btn secondary" onClick={()=>setTab(current.isDraftPreview?"new":"invoices")}>{current.isDraftPreview?"← Înapoi la editare":"← Înapoi la facturi"}</button>
   <div style={{display:"flex",gap:8}}>{current.isDraftPreview&&<button className="btn" onClick={issueInvoice}>Emite factura</button>}<button className="btn secondary" onClick={()=>window.print()}>Tipărește factura A4 / Salvează PDF</button></div>
  </div>
  {!current.isDraftPreview&&<div className="no-print panel" style={{marginBottom:18,border:"1px solid #cdd9e8"}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap",alignItems:"center"}}>
    <div><h2 style={{margin:"0 0 6px"}}>Încasare factură</h2><div className="muted">Total: {money(Number(current.total||0))} · Încasat: {money(Number(current.total_incasat||0))} · Rest: <b>{money(Number(current.rest_de_plata??current.total??0))}</b></div></div>
    <strong style={{color:Number(current.rest_de_plata??current.total??0)<=0?"#18723b":"#a15a00"}}>{current.status_incasare==="achitata"?"ACHITATĂ":current.status_incasare==="partial"?"PLATĂ PARȚIALĂ":"NEÎNCASATĂ"}</strong>
   </div>
   {Number(current.rest_de_plata??current.total??0)>0&&<div style={{marginTop:16}}>
    <div className="grid">
     <div className="field"><label>Data încasării</label><input type="date" value={collectionDate} onChange={e=>setCollectionDate(e.target.value)}/></div>
     <div className="field"><label>Sumă încasată (RON)</label><input type="number" min="0.01" max={Number(current.rest_de_plata??current.total??0)} step="0.01" value={collectionAmount} onChange={e=>setCollectionAmount(e.target.value)}/></div>
     <div className="field"><label>Modalitate</label><select value={collectionMethod} onChange={e=>setCollectionMethod(e.target.value)}><option value="numerar">Cash / Numerar</option><option value="card">Card / POS</option><option value="banca">OP – Ordin de plată (transfer bancar)</option></select></div>
     <div className="field"><label>Referință / număr document (opțional)</label><input value={collectionReference} onChange={e=>setCollectionReference(e.target.value)} placeholder="Nr. bon cash, bon POS sau OP"/></div>
    </div>
    <div className="field"><label>Observații (opțional)</label><input value={collectionNotes} onChange={e=>setCollectionNotes(e.target.value)}/></div>
    <button className="btn" disabled={collectionSaving} onClick={saveCollection}>{collectionSaving?"Se salvează…":"Înregistrează încasarea"}</button>
    <p className="muted" style={{marginTop:8}}>Alege metoda reală de plată: cash, card/POS sau OP. Încasările parțiale se păstrează separat, iar istoricul rămâne atașat facturii.</p>
   </div>}
   {(current.incasari||[]).length>0&&<div style={{marginTop:18}}><h3>Istoric încasări</h3><div className="scroll"><table className="table"><thead><tr><th>Data</th><th>Modalitate</th><th>Referință</th><th>Sumă</th></tr></thead><tbody>{current.incasari.map((p:any)=><tr key={p.id}><td>{p.data_incasarii}</td><td>{p.metoda==="numerar"?"Numerar":p.metoda==="card"?"Card / POS":"Transfer bancar"}</td><td>{p.referinta||"—"}</td><td>{money(Number(p.suma))}</td></tr>)}</tbody></table></div></div>}
  </div>}
  <div className="invoice-print" style={{maxWidth:850,margin:"auto",padding:28,color:"#111",fontFamily:"Arial,Helvetica,sans-serif",fontSize:13}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:24,marginBottom:26}}>
    <div>
     <div style={{fontSize:27,fontWeight:800,letterSpacing:.4}}>FACTURĂ</div>
     <div style={{fontWeight:700,marginTop:5}}>Serie/Număr: {current.serie} / {current.numar}</div>
     <div style={{fontWeight:700,marginTop:4}}>Data: {current.data_document}</div>
     {current.data_scadenta&&<div style={{marginTop:4}}>Data scadență: {current.data_scadenta}</div>}
    </div>
    <img src="/service-electric-logo.svg" alt="SERVICE ELECTRIC by Cezar Gălățanu" style={{width:290,maxWidth:"100%",height:"auto",display:"block"}}/>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:24}}>
    <section style={{minWidth:0}}>
     <div style={{border:"1px solid #222",padding:"7px 9px",fontWeight:800,marginBottom:9}}>FURNIZOR</div>
     <div style={{padding:"0 2px",lineHeight:1.55}}>
      <b>GĂLĂȚANU CEZAR ÎNTREPRINDERE INDIVIDUALĂ</b>
      <div>Adresă: Mandrești (Vlădeni), jud. Botoșani</div>
      <div>CUI: 43594993</div>
      <div>Reg. comerțului: F2021000025079</div>
      <div>Banca: Banca Transilvania</div>
      <div>Cont bancar: RO56BTRLRONCRT0587888101</div>
      <div>Telefon: 0733928730</div>
      <div>E-mail: office@service-electric.ro</div>
     </div>
    </section>
    <section style={{minWidth:0}}>
     <div style={{border:"1px solid #222",padding:"7px 9px",fontWeight:800,marginBottom:9}}>CLIENT</div>
     <div style={{padding:"0 2px",lineHeight:1.55}}>
      <b>{current.client_denumire}</b>
      <div>Adresă: {current.client_adresa||"—"}</div>
      <div>Cod fiscal: {current.client_cui||"—"}</div>
      <div>Reg. comerțului: {current.client_nr_reg_com||"—"}</div>
      {current.client_email&&<div>E-mail: {current.client_email}</div>}
     </div>
    </section>
   </div>
   <table className="table" style={{marginTop:8,border:"1px solid #222"}}>
    <thead><tr>
     <th style={{border:"1px solid #222",color:"#111"}}>Nr. crt.</th>
     <th style={{border:"1px solid #222",color:"#111"}}>Denumirea produselor sau a serviciilor</th>
     <th style={{border:"1px solid #222",color:"#111"}}>UM</th>
     <th style={{border:"1px solid #222",color:"#111"}}>Cantitate</th>
     <th style={{border:"1px solid #222",color:"#111"}}>Preț unitar</th>
     <th style={{border:"1px solid #222",color:"#111"}}>Valoare</th>
     <th style={{border:"1px solid #222",color:"#111"}}>Cota TVA</th>
     <th style={{border:"1px solid #222",color:"#111"}}>Valoare TVA</th>
    </tr></thead>
    <tbody>{(current.items||[]).map((x:any,i:number)=>{
      const net=Number(x.valoare_totala??(Number(x.cantitate||0)*Number(x.pret_unitar||0)));
      const rate=Number(x.cota_tva||0);
      const vat=net*rate/100;
      return <tr key={x.id||i}>
       <td style={{border:"1px solid #ccc"}}>{i+1}</td>
       <td style={{border:"1px solid #ccc"}}>{x.descriere}</td>
       <td style={{border:"1px solid #ccc"}}>{x.unitate}</td>
       <td style={{border:"1px solid #ccc"}}>{Number(x.cantitate||0).toLocaleString("ro-RO")}</td>
       <td style={{border:"1px solid #ccc"}}>{money(Number(x.pret_unitar||0))}</td>
       <td style={{border:"1px solid #ccc"}}>{money(net)}</td>
       <td style={{border:"1px solid #ccc"}}>{rate}%</td>
       <td style={{border:"1px solid #ccc"}}>{money(vat)}</td>
      </tr>
    })}</tbody>
   </table>
   <div style={{display:"flex",justifyContent:"flex-end",marginTop:18}}>
    <div style={{minWidth:270,lineHeight:1.8}}>
     <div style={{display:"flex",justifyContent:"space-between",gap:20}}><span>Total valoare</span><b>{money(Number(current.total_fara_tva??current.total??0))}</b></div>
     <div style={{display:"flex",justifyContent:"space-between",gap:20}}><span>Total TVA</span><b>{money(Number(current.total_tva||0))}</b></div>
     <div style={{borderTop:"1px solid #222",marginTop:6,paddingTop:7,display:"flex",justifyContent:"space-between",gap:20,fontSize:17,fontWeight:800}}><span>TOTAL DE PLATĂ</span><span>{money(Number(current.total))}</span></div>
    </div>
   </div>
   <div style={{borderTop:"1px solid #999",marginTop:34,paddingTop:10,fontSize:11,lineHeight:1.5}}>
    <div>Factura circulă fără semnătură și ștampilă, conform prevederilor Codului fiscal.</div>
    {current.observatii&&<div style={{marginTop:12,border:"1px solid #999",padding:8}}>Observații: {current.observatii}</div>}
   </div>
  </div>
 </div>}
 <footer className="muted no-print" style={{marginTop:24}}>Datele sunt salvate în baza de date. Emiterea PDF se face prin funcția Tipărește / Salvează PDF.</footer></main>
}