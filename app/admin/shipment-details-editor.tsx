import { useLanguage } from "@/app/language-provider";
import { useState, type FormEvent } from "react";
import { shipmentStatuses, trackingMilestones, type Shipment, type ShipmentStatus, type RouteStop } from "@/lib/shipments";

const inputClass = "min-w-0 w-full rounded-xl border border-blue-200 bg-white p-3 text-base text-blue-950 outline-none focus:border-blue-500";
type Field = { key: keyof Shipment; label: string; type?: string };
const extraGroups: { title: string; fields: Field[] }[] = [
  { title: "Sender information", fields: [{key:"senderName",label:"Sender name"},{key:"senderAddress",label:"Sender address"},{key:"senderPhone",label:"Sender phone",type:"tel"},{key:"senderEmail",label:"Sender email",type:"email"}] },
  { title: "Receiver contact", fields: [{key:"receiverAddress",label:"Receiver address"},{key:"receiverPhone",label:"Receiver phone",type:"tel"}] },
  { title: "Parcel details & fees", fields: [{key:"weight",label:"Weight (kg)",type:"number"},{key:"shipmentType",label:"Shipment type"},{key:"deliveryMode",label:"Delivery mode"},{key:"shippedAt",label:"Shipped date",type:"datetime-local"},{key:"pickupAt",label:"Pickup date",type:"datetime-local"},{key:"dutyFees",label:"Duty fees",type:"number"},{key:"feeName",label:"Fee name"},{key:"clearanceFee",label:"Fee amount",type:"number"},{key:"currency",label:"Currency (e.g. USD)"},{key:"estimatedDistance",label:"Estimated distance"}] },
];
const coreGroups: { title: string; fields: Field[] }[] = [
  { title: "Shipment & receiver", fields: [{key:"trackingCode",label:"Tracking number"},{key:"customerName",label:"Receiver name"},{key:"customerEmail",label:"Receiver email",type:"email"},{key:"cargoDescription",label:"Cargo description"},{key:"origin",label:"Departure location"},{key:"destination",label:"Destination"},{key:"location",label:"Current location"},{key:"eta",label:"Expected delivery",type:"datetime-local"},{key:"updatedAt",label:"Last updated",type:"datetime-local"}] },
];
function inputDate(value: string) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function storedDate(value: string) { return value ? new Date(value).toISOString() : ""; }

export function ShipmentFields({value, onChange, extendedOnly = false}: {value: Partial<Shipment>; onChange: (value: Partial<Shipment>) => void; extendedOnly?: boolean}) {
  const { localize } = useLanguage();

  function patch(change: Partial<Shipment>) { onChange({...value,...change}); }
  const history = value.history ?? [];
  const stops = value.routeStops ?? [];
  return localize(<div className="grid min-w-0 gap-4">
    {[...(extendedOnly ? [] : coreGroups), ...extraGroups].map(group => <details key={group.title} className="rounded-xl border border-blue-100 bg-blue-50 p-4" open={group.title === "Shipment & receiver"}>
      <summary className="cursor-pointer py-1 font-semibold text-blue-950">{group.title}</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{group.fields.map(field => <label key={field.key} className="grid min-w-0 gap-2 text-sm text-blue-950">{field.label}<input className={inputClass} type={field.type ?? "text"} min={field.type === "number" ? "0" : undefined} step={field.type === "number" ? "any" : undefined} required={field.key === "trackingCode"} value={field.type === "datetime-local" ? inputDate(String(value[field.key] ?? "")) : String(value[field.key] ?? "")} onChange={event => patch({[field.key]: field.type === "datetime-local" ? storedDate(event.target.value) : event.target.value})} /></label>)}</div>
      {group.title === "Parcel details & fees" && <p className="mt-3 text-xs text-slate-600">The button uses this fee name and amount, for example: Pay Storage Fee ($500.00). Customers can send the shipment and fee details through WhatsApp at +1 (915) 201-9157 or email at support@bluecrestshipping.com.</p>}
    </details>)}
    {!extendedOnly && <label className="grid gap-2 text-sm text-blue-950">Current status<select aria-label="Current status" className={inputClass} value={value.status ?? "Order Confirmed"} onChange={e=>patch({status:e.target.value as ShipmentStatus})}>{shipmentStatuses.map(status=><option key={status}>{status}</option>)}</select></label>}
    <label className="flex items-center gap-3 text-sm text-blue-950"><input type="checkbox" checked={value.verified ?? false} onChange={e=>patch({verified:e.target.checked})} className="h-5 w-5" />Show verified badge</label>
    <details className="rounded-xl border border-blue-100 bg-blue-50 p-4"><summary className="cursor-pointer py-1 font-semibold text-blue-950">Progress milestone dates</summary><p className="mt-2 text-xs text-slate-600">Leave a date empty until the milestone has been recorded.</p><div className="mt-4 grid gap-4">{trackingMilestones.map(status=><label key={status} className="grid gap-2 text-sm text-blue-950">{status} date<input type="datetime-local" className={inputClass} value={inputDate(value.milestoneDates?.[status] ?? "")} onChange={e=>patch({milestoneDates:{...value.milestoneDates,[status]:storedDate(e.target.value)}})} /></label>)}</div></details>
    <details className="rounded-xl border border-blue-100 bg-blue-50 p-4"><summary className="cursor-pointer py-1 font-semibold text-blue-950">Shipment history ({history.length})</summary><p className="mt-2 text-xs leading-5 text-slate-600">Shipment creation and saved changes are logged automatically. You can also add a manual update.</p><div className="mt-4 grid gap-4">{history.map((event,index)=><fieldset key={event.id} className="grid min-w-0 gap-3 rounded-xl border border-blue-200 p-3"><legend className="px-1 text-sm font-semibold">History event {index+1}</legend>
      <label className="grid gap-2 text-sm">Event date<input required type="datetime-local" className={inputClass} value={inputDate(event.date)} onChange={e=>patch({history:history.map(item=>item.id===event.id?{...item,date:storedDate(e.target.value)}:item)})}/></label>
      <label className="grid gap-2 text-sm">Event status<select aria-label="Event status" className={inputClass} value={event.status} onChange={e=>patch({history:history.map(item=>item.id===event.id?{...item,status:e.target.value as ShipmentStatus}:item)})}>{shipmentStatuses.map(status=><option key={status}>{status}</option>)}</select></label>
      <label className="grid gap-2 text-sm">Event location<input className={inputClass} value={event.location} onChange={e=>patch({history:history.map(item=>item.id===event.id?{...item,location:e.target.value}:item)})}/></label>
      <label className="grid gap-2 text-sm">Event description<textarea className={inputClass} rows={3} value={event.description} onChange={e=>patch({history:history.map(item=>item.id===event.id?{...item,description:e.target.value}:item)})}/></label>
      <button type="button" className="min-h-11 text-left text-sm font-semibold text-red-700" onClick={()=>patch({history:history.filter(item=>item.id!==event.id)})}>Remove event {index+1}</button>
    </fieldset>)}</div><button type="button" className="mt-3 min-h-11 font-semibold text-blue-700" onClick={()=>patch({history:[...history,{id:crypto.randomUUID(),date:new Date().toISOString(),status:value.status ?? "Order Confirmed",location:value.location ?? "",description:""}]})}>+ Add history event</button></details>
    <details className="rounded-xl border border-blue-100 bg-blue-50 p-4"><summary className="cursor-pointer py-1 font-semibold text-blue-950">Complete shipment route ({stops.length} stops)</summary><p className="mt-2 text-xs leading-5 text-slate-600">Add stops in travel order, from departure to destination. Coordinates position each marker on the map; mark the last reported position as Current.</p><div className="mt-4 grid gap-4">{stops.map((stop,index)=>{
      const change=(values:Partial<RouteStop>)=>patch({routeStops:stops.map(item=>item.id===stop.id?{...item,...values}:item)});
      return localize(<fieldset key={stop.id} className="grid min-w-0 gap-3 rounded-xl border border-blue-200 p-3"><legend className="px-1 text-sm font-semibold">Route stop {index+1}</legend><label className="grid gap-2 text-sm">Stop name<input required className={inputClass} value={stop.label} onChange={e=>change({label:e.target.value})}/></label><label className="grid gap-2 text-sm">Marker type<select aria-label="Marker type" className={inputClass} value={stop.kind} onChange={e=>change({kind:e.target.value as RouteStop["kind"]})}><option value="origin">Departure</option><option value="stop">Stop</option><option value="current">Current</option><option value="destination">Destination</option></select></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-sm">Latitude<input required type="number" min="-85" max="85" step="any" className={inputClass} value={Number.isFinite(stop.latitude)?stop.latitude:""} onChange={e=>change({latitude:e.target.value === "" ? NaN : Number(e.target.value)})}/></label><label className="grid gap-2 text-sm">Longitude<input required type="number" min="-180" max="180" step="any" className={inputClass} value={Number.isFinite(stop.longitude)?stop.longitude:""} onChange={e=>change({longitude:e.target.value === "" ? NaN : Number(e.target.value)})}/></label></div><div className="flex flex-wrap gap-4"><button type="button" disabled={index===0} className="min-h-11 text-sm font-semibold text-blue-700 disabled:opacity-40" onClick={()=>{const next=[...stops];[next[index-1],next[index]]=[next[index],next[index-1]];patch({routeStops:next});}}>Move up</button><button type="button" className="min-h-11 text-sm font-semibold text-red-700" onClick={()=>patch({routeStops:stops.filter(item=>item.id!==stop.id)})}>Remove stop {index+1}</button></div></fieldset>);
    })}</div><button type="button" className="mt-3 min-h-11 font-semibold text-blue-700" onClick={()=>patch({routeStops:[...stops,{id:crypto.randomUUID(),label:"",latitude:0,longitude:0,kind:stops.length?"destination":"origin"}]})}>+ Add route stop</button></details>
    {!extendedOnly && <label className="grid gap-2 text-sm text-blue-950">Tracking note<textarea className={inputClass} rows={4} maxLength={2000} value={value.note ?? ""} onChange={e=>patch({note:e.target.value})}/></label>}
  </div>);
}
export function validateTrackingDetails(value: Partial<Shipment>) {
  if (value.routeStops?.some(stop=>!stop.label.trim() || !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude) || Math.abs(stop.latitude)>85 || Math.abs(stop.longitude)>180)) throw Error("Each route stop needs a name and valid latitude / longitude.");
  if(value.history?.some(event=>!event.date || !Number.isFinite(new Date(event.date).getTime()))) throw Error("Each history event needs a valid date.");
}
export default function ShipmentDetailsEditor({shipment,onSave}:{shipment:Shipment;onSave:(updates:Partial<Shipment>)=>Promise<Shipment>}) {
  const { localize } = useLanguage();

  const [draft,setDraft]=useState<Partial<Shipment>>({...shipment});
  const [baseline,setBaseline]=useState(shipment);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  async function save(event:FormEvent) {event.preventDefault();setSaving(true);setMessage("");try{validateTrackingDetails(draft);const updates=Object.fromEntries(Object.entries(draft).filter(([key,value]) => key !== "photoUrl" && key !== "photoPath" && JSON.stringify(value) !== JSON.stringify(baseline[key as keyof Shipment]))) as Partial<Shipment>;const saved=await onSave(updates);setDraft({...saved});setBaseline(saved);setMessage("Shipment details saved. The tracking page has been updated.");}catch(error){setMessage(error instanceof Error?error.message:"Unable to save. Please try again.");}finally{setSaving(false);}}
  return localize(<form onSubmit={save} className="mt-6"><h3 className="mb-4 text-lg font-semibold text-blue-950">Edit tracking information</h3><fieldset disabled={saving} className="min-w-0"><ShipmentFields value={draft} onChange={setDraft}/></fieldset><button disabled={saving} className="mt-5 min-h-12 w-full rounded-full bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50">{saving?"Saving...":"Save shipment details"}</button><p role="status" className="mt-3 text-sm text-blue-800">{message}</p></form>);
}
