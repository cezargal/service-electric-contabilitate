"use client";
import { useEffect, useMemo, useState } from "react";
type Line={id:number;description:string;quantity:number;price:number;vat:number};
type SavedInvoice={id:string;series:string;number:string;client:string;cif:string;date:string;due:string;total:number;status:string;lines:Line[]};
const money=(n:number)=>new Intl.NumberFormat("ro-RO",{style:"currency",currency:"RON"}).format(n);
export default function Home(){
 const [tab,setTab]=useState("Factură nouă"),[client,setClient]=useState(""),[cif,setCif]=useState(""),[address,setAddress]=useState(""),[email,setEmail]=useState(""),[date,setDate]=useState("2026-11-14"),[due,setDue]=useState("2026-11-21"),[series,setSeries]=useState("SE"),[number,setNumber]=useState("0001"),[notes,setNotes]=useState("Contravaloare servicii și materiale conform lucrării efectuate."),[lines,setLines]=useState<Line[]>([{id:1,description:"Servicii de intervenție și verificare instalație",quantity:1,price:350,vat:0},{id:2,description:"Materiale și consumabile",quantity:1,price:120,vat:0}]),[loading,setLoading]=useState(false),[message,setMessage]=useState(""),[anaf,setAnaf]=useState<{platitorTva:boolean;tvaLaIncasare:boolean;inactiv:boolean;nrRegCom:string}|null>(null);
 const [saved,setSaved]=useState<SavedInvoice[]>([]);
 useEffect(()=>{try{const raw=localStorage.getItem("service-electric-invoices");if(raw)setSaved(JSON.parse(raw))}catch{setMessage("Nu am putut încărca documentele salvate local.")}},[]);
 function saveDraft(){con���q�^