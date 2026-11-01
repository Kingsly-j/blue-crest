"use client";

import { useLanguage } from "@/app/language-provider";
import Link from "next/link";
import { shipmentPaymentLink, shipmentPaymentEmailLink } from "@/lib/whatsapp";
import type { ReactNode } from "react";
import { statusLabel, trackingMilestones, type Shipment, type ShipmentStatus } from "@/lib/shipments";
import ShipmentRoute from "./shipment-route";
import { shipmentMilestoneDate } from "@/lib/shipment-progress";

function Icon({name}:{name:string}) {
  const { localize } = useLanguage();
return localize(<i className={`fas fa-${name}`} aria-hidden="true"/>);}
export function displayDate(value?:string,withTime=false,locale="en-US") {
  if(!value)return "Not recorded";
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return value;
  return new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',year:'numeric',...(withTime?{hour:'2-digit',minute:'2-digit'} as const:{})}).format(date);
}
function Badge({status}:{status:ShipmentStatus}) {
  const { localize } = useLanguage();
const label=statusLabel(status);return localize(<span className={`tracking-badge ${label==='Delivered'?'delivered':label==='On hold'?'hold':''}`}>{label}</span>);}
function Row({icon,label,value}:{icon:string;label?:string;value?:ReactNode}) {
  const { localize } = useLanguage();
return localize(<div className="tracking-info-row"><Icon name={icon}/><div>{label&&<span className="tracking-label">{label}: </span>}{value ? (typeof value === "string" ? <span translate="no">{value}</span> : value) : <span className="text-slate-400">Not provided</span>}</div></div>);}
function Card({title,icon,children}:{title:string;icon:string;children:ReactNode}) {
  const { localize } = useLanguage();
return localize(<section className="tracking-info-card"><h3><Icon name={icon}/>{title}</h3><div className="grid gap-3">{children}</div></section>);}
function amount(value?:string,currency?:string) {
  if(value===undefined||value==='')return "Not provided";
  const numeric=Number(value);
  if(!Number.isFinite(numeric))return value;
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency||'USD'}).format(numeric);}catch{return `${currency||'USD'} ${numeric.toFixed(2)}`;}
}
export default function ShipmentResult({shipment}:{shipment:Shipment}) {
  const { localize, locale } = useLanguage();

  const current=statusLabel(shipment.status);
  const currentIndex=trackingMilestones.findIndex(status=>status===current);
  const history=[...(shipment.history ?? [])].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const feeName=shipment.feeName?.trim() || "Clearance Fee";
  const fee=amount(shipment.clearanceFee,shipment.currency);
  const support=shipmentPaymentLink(shipment,feeName,fee);
  return localize(<div className="tracking-result" aria-label="Shipment details">
    <section className="tracking-summary tracking-surface">
      <header className="tracking-summary-header"><div><h2><Icon name="box"/> Tracking Number</h2><div className="tracking-number"><strong translate="no">{shipment.trackingCode}</strong>{shipment.verified&&<span>Verified</span>}</div></div><div className="tracking-current"><div><Icon name="user"/> Current Status: <Badge status={shipment.status}/></div><p><Icon name="calendar-alt"/> Last Updated: {displayDate(shipment.updatedAt,true,locale)}</p></div></header>
      <div className="tracking-info-grid">
        <Card title="Sender Information" icon="user"><Row icon="user" value={shipment.senderName}/><Row icon="map-marker-alt" value={shipment.senderAddress}/><Row icon="phone" value={shipment.senderPhone}/><Row icon="envelope" value={shipment.senderEmail}/></Card>
        <Card title="Receiver Information" icon="user"><Row icon="user" label="Receiver name" value={shipment.customerName}/><Row icon="map-marker-alt" value={shipment.receiverAddress || shipment.destination}/><Row icon="phone" value={shipment.receiverPhone}/><Row icon="envelope" value={shipment.customerEmail}/></Card>
        <Card title="Shipment Details" icon="clipboard-list"><Row icon="weight-hanging" label="Weight" value={shipment.weight ? `${shipment.weight} kg`:undefined}/><Row icon="box" label="Type" value={shipment.shipmentType}/><Row icon="calendar-alt" label="Shipped" value={displayDate(shipment.shippedAt,false,locale)}/><Row icon="cubes" label="Cargo" value={shipment.cargoDescription}/></Card>
        <Card title="Status Information" icon="chart-line"><Row icon="clock" label="Status" value={<Badge status={shipment.status}/>}/><Row icon="map-marker-alt" label="Location" value={shipment.location}/></Card>
      </div>
    </section>
    <section className="tracking-surface"><h2 className="tracking-section-title">Shipment Progress</h2><ol className="tracking-milestones" aria-label="Shipment progress">{trackingMilestones.map((status,index)=>{
      const date=shipmentMilestoneDate(shipment,status);
      const reached=index<=currentIndex;
      return localize(<li key={status} className={`${reached?'reached':''} ${status==='On hold'?'hold':status==='Delivered'?'delivered':''}`} aria-current={status===current?'step':undefined}><span className="milestone-icon"><Icon name={['check-circle','box','truck','pause-circle','check-double'][index]}/></span><strong>{status}</strong><time>{date ? displayDate(date,false,locale) : "Pending"}</time></li>);
    })}</ol><div className="sr-only" role="progressbar" aria-label="Shipment completion" aria-valuenow={shipment.progress} aria-valuemin={0} aria-valuemax={100}/></section>
    <div className="tracking-route-grid"><section className="tracking-surface"><h2 className="tracking-section-title"><Icon name="calendar-alt"/>Shipment History</h2><ol className="tracking-history">{history.map(event=><li key={event.id}><span className={`history-dot ${statusLabel(event.status)==='On hold'?'hold':statusLabel(event.status)==='Delivered'?'delivered':''}`}><Icon name="info-circle"/></span><time>{displayDate(event.date,true,locale)}</time><div className="my-2"><Badge status={event.status}/></div><p translate="no">{event.description}</p>{event.location&&<small><Icon name="map-marker-alt"/> {event.location}</small>}</li>)}</ol>{!history.length&&<p className="p-6 text-slate-500">No shipment history has been recorded yet.</p>}</section><section className="tracking-surface"><h2 className="tracking-section-title"><Icon name="map-marker-alt"/>Complete Shipment Route <small>Fixed map view</small></h2><ShipmentRoute key={JSON.stringify(shipment.routeStops)} shipment={shipment}/></section></div>
    <section className="tracking-surface"><h2 className="tracking-section-title"><Icon name="th"/>Parcel Information</h2><div className="tracking-parcel"><div className="tracking-photo">{shipment.photoUrl ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shipment.photoUrl} alt="Shipment cargo"/>
    </>:<div><Icon name="box-open"/><p>No parcel photo provided</p></div>}</div><div><dl className="tracking-parcel-grid">{[
      ['Duty Fees',amount(shipment.dutyFees,shipment.currency),'dollar-sign'],['Weight',shipment.weight?`${shipment.weight} kg`:'Not provided','weight-hanging'],['Pickup Date',displayDate(shipment.pickupAt,true,locale),'calendar-alt'],['Expected Delivery',displayDate(shipment.eta,true,locale),'truck'],['Delivery Mode',shipment.deliveryMode||'Not provided','shipping-fast'],['Tracking Status',<Badge key="status" status={shipment.status}/>,'chart-line'],
    ].map(([title,value,icon])=><div key={String(title)}><dt><Icon name={String(icon)}/>{title}</dt><dd>{value}</dd></div>)}</dl><div className="tracking-actions"><button type="button" onClick={()=>window.print()}><Icon name="print"/>Print Receipt</button>{shipment.clearanceFee!==undefined&&shipment.clearanceFee!==''&&<div className="tracking-fee"><details className="payment-choice"><summary><Icon name="dollar-sign"/>Pay {feeName} ({fee})</summary><div className="payment-options"><p>Send payment details via</p><a href={support} target="_blank" rel="noopener noreferrer"><Icon name="comment"/>WhatsApp</a><a href={shipmentPaymentEmailLink(shipment,feeName,fee)}><Icon name="envelope"/>Email</a></div></details><span className="hidden print:inline">{feeName}: {fee}</span></div>}</div></div></div></section>
    {shipment.note?.trim()&&<section className="tracking-surface tracking-note" aria-labelledby="tracking-note-heading"><h2 id="tracking-note-heading">Shipment note</h2><p translate="no">{shipment.note}</p></section>}
    <footer className="tracking-result-footer"><span>{shipment.origin} &rarr; {shipment.destination}</span><Link href="/contact">Need help? Contact support</Link></footer>
  </div>);
}
